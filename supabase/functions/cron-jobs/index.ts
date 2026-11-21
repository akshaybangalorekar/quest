// cron-jobs — the sweep the database calls on a timer. No person needed.
//
// verify_jwt is off because the caller is pg_cron, which has no user token. It is not open: the body
// must carry the drain token that lives in app_config, which is readable by nobody but this function's
// service role. It works through every student with queued work, one job each, then returns.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fillFromMaterial } from "./_shared/generate.ts";
import { gateExam, gateQuestion } from "./_shared/gate.ts";
import { checkQuestion } from "./_shared/quality.ts";
import { ask } from "./_shared/mod.ts";
import { alignExam, scopeExam } from "./_shared/authority.ts";

const SUPABASE = Deno.env.get("SUPABASE_URL")!;
const ADMIN = () => createClient(SUPABASE, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const EXAMS = ["aas", "edutest", "amc", "icas", "olympiad"];

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let body: any = {};
  try { body = await req.json(); } catch (e) { console.error("cron-jobs step failed:", String((e as Error)?.message ?? e)); }

  const admin = ADMIN();

  // the token is the only key: it is not a user token and it is not guessable
  const { data: expected } = await admin.rpc("drain_token");
  if (!expected || body?.token !== expected) {
    return json({ error: "not allowed" }, 403);
  }

  // is the model answering at all? A gate that cannot reach the model must say so, not reject silently
  if (body?.mode === "ping") {
    const r = await fetch("https://api.sarvam.ai/v2/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "api-subscription-key": Deno.env.get("SARVAM_API_KEY") ?? "" },
      body: JSON.stringify({ model: "sarvam-m", temperature: 0, max_tokens: 20,
        messages: [{ role: "user", content: "Reply with the single word: ready" }] }),
    });
    const text = await r.text();
    return json({ status: r.status, keyPresent: !!Deno.env.get("SARVAM_API_KEY"), body: text.slice(0, 300) });
  }

  // draw the figures: questions that name a drawing get one, and it is checked before it is kept
  if (body?.mode === "draw") {
    const limit = Number(body?.limit ?? 5);
    // the drawer needs to know whose work this is
    const { data: owner } = await admin.from("profiles").select("student_id").limit(1).maybeSingle();
    const ownerId = body?.student ?? owner?.student_id ?? "";
    const FIG = /venn|angle|perimeter|area|net\b|graph|chart|shape|symmetr|coordinate|triangle|rectangle|circle|number line/i;
    const { data: all } = await admin.from("problems")
      .select("chapter, idx, prompt, diagram_svg, status")
      .is("diagram_svg", null)
      .in("status", ["cleared", "provisional"])
      .limit(60);
    const { data: strands } = await admin.from("strands").select("n, title");
    const titleOf = new Map((strands ?? []).map((x: any) => [x.n, String(x.title)]));

    // a drawing belongs only to a topic that needs one, or to a question that names one
    const rows = (all ?? []).filter((q: any) =>
      FIG.test(String(titleOf.get(q.chapter) ?? "")) ||
      /\b(diagram|figure|shown below|the picture|the table)\b/i.test(String(q.prompt))
    ).slice(0, limit);

    const drawn: any[] = [];
    for (const q of rows ?? []) {
      const res = await callFn("draw-figure", { chapter: q.chapter, kind: "question", idx: q.idx, question: q.prompt }, ownerId);
      drawn.push({ chapter: q.chapter, idx: q.idx, ok: !!res?.svg, checked: res?.checked ?? false,
                   note: res?.error ?? "", head: String(q.prompt).slice(0, 60) });
    }
    return json({ attempted: (rows ?? []).length, drawn });
  }

  // the online-question checker: is each question in the strand it belongs to, and is it sound?
  if (body?.mode === "audit") {
    const limit = Number(body?.limit ?? 30);
    const { data: rows } = await admin.from("problems")
      .select("chapter, idx, prompt, options, status").order("chapter").limit(limit);
    const { data: strands } = await admin.from("strands").select("n, title, exam_id");
    const { data: exams } = await admin.from("exams").select("id, key");
    const examOf = new Map((exams ?? []).map((e: any) => [e.id, e.key]));
    const titleOf = new Map((strands ?? []).map((x: any) => [x.n, x.title]));

    const findings: any[] = [];
    for (const q of rows ?? []) {
      const own = titleOf.get(q.chapter) ?? "";
      const examId = (strands ?? []).find((x: any) => x.n === q.chapter)?.exam_id;
      const siblings = (strands ?? []).filter((x: any) => x.exam_id === examId).map((x: any) => x.title);

      // is it answerable at all?
      const verdict = await checkQuestion(String(q.prompt), false);

      // does it belong where it is?
      let best = own, belongs = true;
      if (siblings.length > 1) {
        const pick = await ask(
          `You file practice questions under a topic. Here are the topics for this exam:\n${siblings.join("\n")}`,
          `Question: ${q.prompt}\n\nReply with JSON only: {"topic":"one topic from the list, copied exactly"}`,
          0, 200, "audit");
        const m = String(pick).match(/\{[\s\S]*\}/);
        if (m) {
          try {
            const parsed = JSON.parse(m[0]);
            best = String(parsed.topic ?? own);
            belongs = best.trim().toLowerCase() === own.trim().toLowerCase();
          } catch (e) { console.error("cron-jobs step failed:", String((e as Error)?.message ?? e)); }
        }
      }

      findings.push({ chapter: q.chapter, idx: q.idx, exam: examOf.get(examId) ?? "?", strand: own,
                      sound: verdict.ok, why: verdict.why, in_right_strand: belongs,
                      suggested: belongs ? own : best, head: String(q.prompt).slice(0, 70) });
    }

    const wrong = findings.filter((f) => !f.in_right_strand);
    const unsound = findings.filter((f) => !f.sound);
    return json({ audited: findings.length, wrong_strand: wrong.length, unsound: unsound.length,
                  findings, wrong, unsound });
  }



  // read the pages again that came back without figure positions, so their diagrams can be cut out
  if (body?.mode === "reread") {
    const limit = Number(body?.limit ?? 4);
    const { data: pages } = await admin.rpc("pages_without_boxes", { p_limit: limit });
    const done: any[] = [];
    for (const pg of (pages ?? []) as any[]) {
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/parse-page`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          token: (await admin.from("app_config").select("value").eq("key", "drain_token").maybeSingle()).data?.value,
          paper_id: pg.paper_id, page: pg.page_no,
        }),
      });
      const out: any = await res.json().catch(() => ({}));
      done.push({ paper: pg.paper_id, page: pg.page_no, ok: !!out?.ok, boxes: out?.boxes ?? null });
    }
    return json({ reread: done.length, done });
  }

  // draw the figures that were never drawn, and only keep the ones that pass their own check
  if (body?.mode === "figures") {
    const limit = Number(body?.limit ?? 10);
    const { data: rows } = await admin.from("problems")
      .select("chapter, idx, prompt, diagram_svg")
      .is("diagram_svg", null)
      .or("has_diagram.eq.true,prompt.ilike.%diagram%,prompt.ilike.%figure%,prompt.ilike.%shown%,prompt.ilike.%below%")
      .limit(limit);

    let drawn = 0, refused = 0;
    for (const r of rows ?? []) {
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/draw-figure`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ chapter: r.chapter, kind: "question", idx: r.idx }),
      });
      const out: any = await res.json().catch(() => ({}));
      if (out?.svg) {
        await admin.from("problems").update({ has_diagram: true })
          .eq("chapter", r.chapter).eq("idx", r.idx);
        drawn++;
      } else refused++;
    }
    const { count } = await admin.from("problems").select("*", { count: "exact", head: true }).is("diagram_svg", null);
    return json({ tried: (rows ?? []).length, drawn, refused, still_without: count });
  }

  // check what is sitting unchecked, so nothing stays unservable
  if (body?.mode === "check") {
    const { data: rows } = await admin.from("problems")
      .select("chapter, idx, prompt, has_diagram, diagram_svg, diagram_url, diagram_box")
      .eq("status", "draft").limit(Number(body?.limit ?? 25));
    let ok = 0, held = 0;
    for (const r of rows ?? []) {
      const v = await gateQuestion(admin,
        { chapter: r.chapter, idx: r.idx, prompt: r.prompt }, "", false);
      const state = v.state === "failed" ? "failed" : "provisional";
      await admin.from("problems").update({
        status: state, status_note: v.why.slice(0, 300), status_at: new Date().toISOString(),
      }).eq("chapter", r.chapter).eq("idx", r.idx);
      state === "failed" ? held++ : ok++;
    }
    const { count } = await admin.from("problems").select("*", { count: "exact", head: true }).eq("status", "draft");
    return json({ checked: (rows ?? []).length, ok, held, still_draft: count });
  }

  // a plain note for each upload tab, written from the questions themselves
  if (body?.mode === "blurb") {
    const { data: tabs } = await admin.from("strands").select("n, title, blurb").not("blurb", "is", null);
    const out: any[] = [];
    for (const t of (tabs ?? []).slice(0, Number(body?.limit ?? 6))) {
      const { data: qs } = await admin.from("problems").select("prompt")
        .eq("chapter", t.n).limit(5);
      const sample = (qs ?? []).map((q: any) => String(q.prompt).slice(0, 120)).join("\n");
      if (!sample) continue;
      const text = await ask(
        `You write one short line for an 11-year-old and his parent describing what is inside a set of practice questions.
Two sentences at most, plain words, no praise, no adjectives like "exciting". Say what kind of maths it is and what
he will have to do. Do not invent numbers or topics that are not in the samples.`,
        `Tab: ${t.title}\n\nQuestions:\n${sample}`, 0.2, 160);
      const line = String(text ?? "").trim().replace(/^["']|["']$/g, "");
      if (!line) continue;
      await admin.from("strands").update({ blurb: line.slice(0, 300) }).eq("n", t.n);
      out.push({ n: t.n, blurb: line.slice(0, 80) });
    }
    return json({ written: out.length, out });
  }

  // what they said is hard: write questions of that kind into that exam, then record it
  if (body?.mode === "hard") {
    const id = Number(body?.id ?? 0);
    if (!id) return json({ error: "no difficulty id given" }, 400);
    const { data: row } = await admin.from("hard_topics")
      .select("id, exam, words, questions_written").eq("id", id).maybeSingle();
    if (!row) return json({ error: "no such difficulty" }, 404);
    if (!row.exam) return json({ refused: "no exam named — ask which exam before writing" });

    const { data: chapter } = await admin.rpc("strand_for_words", { p_exam: row.exam, p_words: row.words });
    if (!chapter) return json({ refused: "no strand in that exam fits" });

    const made = await callFn("make-questions", {
      chapter, count: Number(body?.count ?? 6), focus: row.words,
      token: (await admin.from("app_config").select("value").eq("key", "drain_token").maybeSingle()).data?.value,
    }, row.exam);
    const added = Number((made as any)?.added ?? (made as any)?.written ?? 0);
    await admin.from("hard_topics").update({
      taught: true,
      questions_written: Number(row.questions_written ?? 0) + added,
    }).eq("id", id);
    return json({ id, exam: row.exam, chapter, focus: row.words, added, made });
  }

  // scope first: a question off the official topic list is not verified, it is out of scope
  if (body?.mode === "scope") {
    const exam = String(body?.exam ?? "");
    if (!exam) return json({ error: "no exam given" }, 400);
    return json(await scopeExam(admin, exam, { limit: Number(body?.limit ?? 40) }));
  }

  // re-judge the provisional questions of one exam against official material
  if (body?.mode === "regate") {
    const exam = String(body?.exam ?? "");
    if (!exam) return json({ error: "no exam given" }, 400);
    // a question off the syllabus is not verified against it: drop it first
    const scope = await scopeExam(admin, exam, { limit: Number(body?.limit ?? 40) });
    // the official material itself, so "verified" means it agrees with the paper — not just that it is answerable
    const { data: mat } = await admin.rpc("authority_material", { p_exam: exam, p_limit: 8 });
    const material = (mat ?? []).map((x: any) => String(x.body ?? "")).join("\n\n").slice(0, 4000);
    if (!material) {
      return json({ exam, refused: "no official material text for this exam — nothing was marked verified" });
    }

    const { data: rows } = await admin.rpc("provisional_to_check", { p_exam: exam });
    const list = (rows ?? []) as any[];
    const out: any[] = [];
    for (const q of list) {
      const v = await gateQuestion(admin, { chapter: q.chapter, idx: q.idx, prompt: q.prompt }, material, true);
      // verified when it holds up against the official material; held back when it does not
      const state = v.state === "failed" ? "failed" : "cleared";
      await admin.from("problems").update({
        status: state,
        status_note: v.why.slice(0, 400),
        verified_at: new Date().toISOString(),
        verified_against: "official_" + exam,
      }).eq("chapter", q.chapter).eq("idx", q.idx);
      out.push({ chapter: q.chapter, idx: q.idx, state });
    }
    return json({ exam, checked: out.length,
                  verified: out.filter((r) => r.state === "cleared").length,
                  held: out.filter((r) => r.state === "failed").length, rows: out });
  }

  // the golden set: 25 questions from real papers whose answers were verified by hand
  if (body?.mode === "golden") {
    const golden: Array<[string, string, "pass" | "failed"]> = [
      ["SST6-28", "A baby's expected adult height H cm is H = 24 + birth length in cm x 3. Carol was 0.51 m at birth. What is her expected adult height? Options: 225 cm / 201 cm / 177 cm / 153 cm / 73.5 cm", "pass"],
      ["SST6-29", "Find the area of this trapezium: parallel sides 3 cm and 6 cm, height 2 cm. Options: 15 cm2 / 14 cm2 / 12 cm2 / 10 cm2 / 9 cm2", "pass"],
      ["SST6-30", "30.475 is approximately what, to the nearest whole number? Options: 30 / 30.4 / 30.5 / 31 / 34", "pass"],
      ["SST6-31", "160 x 80 = 12800. Using that, find 12.8 divided by 0.016. Options: 8000 / 800 / 80 / 8 / 0.8", "pass"],
      ["SST6-32", "A remote control car costs $40 plus 10% shipping and handling. What is the total cost? Options: $440 / $50 / $44.4 / $44 / $40.4", "pass"],
      ["SST6-33", "In the 12 km by 6 km rectangle, find the area of region QBRC and state what the shape is. Options: 36 km2 parallelogram / 39 km2 parallelogram / 39 km2 trapezium / 78 km2 trapezium / 216 km2 parallelogram", "pass"],
      ["SST6-34", "Using the same diagram, find the area of the region PQRS. Options: 9 km2 / 12 km2 / 18 km2 / 21 km2 / 24 km2", "pass"],
      ["SST6-35", "The sum of five consecutive prime numbers is 221. Find the difference between the smallest and the largest. Options: 8 / 16 / 18 / 19 / 21", "pass"],
      ["SST6-36", "The product of M and 18 is a perfect cube. Find the smallest value of M. Options: 8 / 12 / 64 / 324 / 1000", "pass"],
      ["SST6-37", "Find the volume of the cuboid shown: 12 cm by 18 cm by 5 cm. Options: 1080 cm3 / 60 cm3 / 90 cm3 / 108 cm3 / 540 cm3", "pass"],
      ["S9-3A", "T-shirts cost $8 each. Amy buys one, Becky 3, Colin 5, Dan 7, and Emily as many as Amy, Becky and Colin combined. How much do the five spend?", "pass"],
      ["S9-3B", "Find the sum of all counting numbers less than 25 which are not divisible by 2 or 5.", "pass"],
      ["S9-3C", "In a group of 25 girls, 8 joined athletics, 13 joined maths, 6 joined both. How many joined neither?", "pass"],
      ["S9-3D", "I climb half the steps, then a third of the remaining steps, then an eighth of the rest. What is the smallest possible number of steps?", "pass"],
      ["S9-3E", "ABCD is 15 cm by 8 cm and AE = 12 cm. Find the total shaded area.", "pass"],
      ["S9-4A", "Each of 6 piles has a different number of counters, at least one each. What is the least possible total?", "pass"],
      ["S9-4B", "The ages of Amanda, Brittany and Carly are each prime. Amanda is youngest. Amanda plus Brittany equals Carly. How old is Amanda?", "pass"],
      ["S9-4C", "A bus holds 24 adults or 30 children. 25 children are aboard. What is the largest number of adults who can still get on?", "pass"],
      ["S9-4E", "20 numbers average 20; 60 numbers average 60. What is the average of all 80 together?", "pass"],
      ["S9-4D", "ABCD is a square, DEFG a rectangle, EF = 25 cm, D is the midpoint of CE, and the perimeter of the shaded region is 180 cm. Find AG.", "pass"],
      ["CH-1", "Find the side length of a cube whose volume is 512 cm3.", "pass"],
      ["CH-2", "A small cube is 4 cm x 4 cm x 4 cm. How many fit into a box 16 cm x 20 cm x 30 cm?", "pass"],
      ["CH-3", "A train averages 80 km/h while moving. It departs 8:00 am, arrives 3:30 pm, and stops at three stations for 5 minutes each. What is the total distance?", "pass"],
      ["CH-4", "294 blue, 252 pink and 210 yellow balls are shared equally with none left over. What is the largest possible number of students?", "pass"],
      ["CH-5", "Maggie has 3 square-number scores. The first two have the same three digits. The total is 590. What are the scores?", "pass"],
    ];
    const out: any[] = [];
    for (const [id, q, expect0] of golden) {
      // these fixtures carry no drawing, so a question that names one must be refused
      const namesAFigure = /\b(diagram|figure|region|shaded|shown below|the picture)\b/i.test(q);
      const expect = namesAFigure ? "failed" : expect0;
      const v = await gateQuestion(admin, { chapter: 0, idx: 0, prompt: q }, "", false);
      const noAnswer = /stored answer is missing/i.test(v.why);
      const ok = expect === "failed" ? v.state === "failed" : (v.state !== "failed" || noAnswer);
      out.push({ id, expect, got: v.state, ok, namesAFigure, why: v.why.slice(0, 100) });
    }
    const bad = out.filter((r) => !r.ok);
    return json({ cases: out.length, passed: out.length - bad.length, failed: bad.length, misses: bad });
  }

  // the validation batch: does the gate reject what it must, and pass what it must?
  if (body?.mode === "validate") {
    const cases: Array<[string, "failed" | "pass", string]> = [
      ["Tom has 3 more marbles than Sam. How many does Tom have?", "failed", "a quantity is never given"],
      ["A rectangle is 4 cm by 6 cm. What is its area?", "pass", "complete"],
      ["Look at the diagram below. What is the marked angle?", "failed", "no drawing supplied"],
      ["What is 15% of 80?", "pass", "complete"],
      ["A bag has some red and blue counters. What fraction are red?", "failed", "no numbers at all"],
      ["What is the answer to the previous question?", "failed", "refers to something absent"],
      ["A train travels at 60 km/h for 2 hours. How far does it go?", "pass", "complete"],
      ["A train travels at 60 for 2 hours. How far does it go?", "failed", "no unit on the speed"],
      ["A rectangle has an area of 24 cm² and a width of 4 cm. What is its length?", "pass", "complete"],
      ["How many apples does he have?", "failed", "no data"],
      ["What is 5 + 7?", "pass", "complete"],
      ["A square has a side of 5 cm. What is its perimeter?", "pass", "complete"],
      ["There are 12 more girls than boys. How many girls are there?", "failed", "boys never given"],
      ["A book costs $12. A pen costs $4 less than the book. What do they cost together?", "pass", "complete"],
      ["What is the next number: 2, 4, 8, 16, ?", "pass", "rule is clear"],
      ["What is the next number: 2, 4, 8, ?", "failed", "more than one rule fits"],
      ["A car travels 120 km in 2 hours. What is its average speed?", "pass", "complete"],
      ["A car travels 120 in 2 hours. What is its average speed?", "failed", "distance has no unit"],
      ["Half of a number is 12. What is the number?", "pass", "complete"],
      ["The perimeter of a square is 20 cm. What is the length of one side?", "pass", "complete"],
      ["Round 3.14159 to 2 decimal places.", "pass", "rounding stated"],
      ["Round 3.14159.", "failed", "no rounding stated"],
      ["A cube has 6 faces. How many edges does it have?", "pass", "complete"],
      ["How many edges does it have?", "failed", "no object named"],
      ["A bag has 3 red and 5 blue counters. What fraction are red?", "pass", "complete"],
      ["A shirt costs $40 and is reduced by 25%. What is the new price?", "pass", "complete"],
      ["A shirt costs $40 and is reduced. What is the new price?", "failed", "reduction missing"],
      ["Mia is twice as old as her brother. How old is Mia?", "failed", "brother's age missing"],
      ["Mia is 10 and her brother is 5. Mia is twice as old as her brother. How old will Mia be in 3 years?", "pass", "complete"],
      ["What is 1/4 + 2/4?", "pass", "complete"],
      ["What is 1/4 + 2/3 in simplest form?", "pass", "complete"],
      ["What is the area of a triangle with base 6 cm and height 4 cm?", "pass", "complete"],
      ["What is the area of a triangle with base 6 and height 4?", "failed", "units missing on both"],
      ["A jar holds 750 mL. How many jars are needed for 3 litres?", "pass", "complete"],
      ["How many jars are needed?", "failed", "no volumes given"],
    ];

    const results: any[] = [];
    for (const [q, expect, why] of cases) {
      const v = await gateQuestion(admin, { chapter: 0, idx: 0, prompt: q }, "", false);
      // these are synthetic questions with no stored answer, so "no stored answer" is not a judgement on the question
      const noAnswer = /stored answer is missing/i.test(v.why);
      const ok = expect === "failed" ? v.state === "failed" : (v.state !== "failed" || noAnswer);
      results.push({ q: q.slice(0, 58), expect, got: v.state, ok, why: v.why.slice(0, 90), tested: why });
    }
    const failed = results.filter((r) => !r.ok);
    return json({ cases: results.length, passed: results.length - failed.length,
                  failed: failed.length, misses: failed, all: results });
  }

  // golden questions: the judgement itself, tested against the live model
  if (body?.mode === "selftest") {
    const cases = [
      { q: "Tom has 3 more marbles than Sam. How many does Tom have?", expect: "failed", why: "Sam's count is never given" },
      { q: "A rectangle is 4 cm by 6 cm. What is its area?", expect: "provisional", why: "complete and answerable" },
      { q: "Look at the diagram below. What is the marked angle?", expect: "failed", why: "no diagram is supplied" },
      { q: "What is 15% of 80?", expect: "provisional", why: "complete and answerable" },
      { q: "A bag has some red and blue counters. What fraction are red?", expect: "failed", why: "no numbers at all" },
    ];
    const results = [];
    for (const c of cases) {
      const v = await gateQuestion(admin, { chapter: 0, idx: 0, prompt: c.q, options: null }, "", false);
      results.push({ q: c.q.slice(0, 60), expected: c.expect, got: v.state, ok: v.state === c.expect, why: v.why });
    }
    return json({ selftest: results, passed: results.filter((r) => r.ok).length, of: results.length });
  }

  // a run whose request died is not work in progress
  try { await admin.rpc("reap_stuck_jobs"); } catch (e) { console.error("reap failed:", String((e as Error)?.message ?? e)); }
  // a day of history is enough to answer "did it run", and it keeps the list readable
  try { await admin.rpc("prune_jobs", { p_keep_days: 1 }); } catch (e) { console.error("prune failed:", String((e as Error)?.message ?? e)); }

  const { data: students } = await admin.rpc("students_with_queued");
  const ran: any[] = [];

  for (const student of (students ?? []).slice(0, 5)) {
    const { data: claimed } = await admin.rpc("claim_job", { p_student: student });
    const job = (claimed as any)?.job;
    if (!job) continue;

    const detail: Record<string, unknown> = {};
    let failed = false;

    try {
      if (job.kind === "ingest" || job.kind === "train") {
        detail.train = await callFn("train-coach", { mode: "all" }, student);
        for (const ex of EXAMS) {
          detail["gate_" + ex] = await gateExam(admin, ex, { limit: 20 });
          const { data: hasOfficial } = await admin.rpc("exam_has_official", { p_exam: ex });
          if (hasOfficial) detail["align_" + ex] = await alignExam(admin, ex, { limit: 10 });
        }
      } else if (String(job.kind).startsWith("gate:")) {
        detail.gate = await gateExam(admin, String(job.kind).split(":")[1], { limit: 40 });
      } else if (String(job.kind).startsWith("align:")) {
        const ex = String(job.kind).split(":")[1];
        detail.align = await alignExam(admin, ex, { limit: 25 });
        detail.gate = await gateExam(admin, ex, { limit: 40 });
      } else if (job.kind === "fill") {
        detail.fill = await fillFromMaterial(admin, { perStrand: 3, maxStrands: 6 });
        for (const ex of EXAMS) detail["gate_" + ex] = await gateExam(admin, ex, { limit: 15 });
      } else if (job.kind === "parse_paper") {
        detail.parse = await parsePaper(admin, student, job.payload?.paper_id);
      } else if (job.kind === "verify") {
        for (const ex of EXAMS) detail["gate_" + ex] = await gateExam(admin, ex, { limit: 25 });
      } else {
        detail.skipped = `unknown job kind ${job.kind}`;
      }
    } catch (e) {
      failed = true;
      detail.error = String((e as Error)?.message ?? e);
    }

    await admin.rpc("finish_job", {
      p_id: job.id, p_ok: !failed, p_detail: detail,
      p_error: failed ? String(detail.error ?? "") : null,
    });
    ran.push({ student, kind: job.kind, ok: !failed });
  }

  const { data: left } = await admin.rpc("students_with_queued");
  return json({ ran, stillQueued: (left ?? []).length });
});

async function callFn(name: string, body: unknown, student: string) {
  const { data: token } = await ADMIN().rpc("drain_token");
  const r = await fetch(`${SUPABASE}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "x-quest-student": student,
      "x-quest-drain": token ?? "",
    },
    body: JSON.stringify(body),
  });
  try { return await r.json(); } catch { return { status: r.status }; }
}

async function parsePaper(admin: any, student: string, paperId: number | string) {
  let pages = 0;
  for (let i = 0; i < 40; i++) {
    const { data: next } = await admin.rpc("next_parse_page", { p_paper: paperId });
    const page = (next as any)?.page ?? (next as any)?.page_no ?? null;
    if (!page) break;
    const res = await callFn("parse-page", { paper_id: paperId, page }, student);
    if (res?.error) throw new Error(String(res.error));
    pages++;
  }
  return { pages };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
}
