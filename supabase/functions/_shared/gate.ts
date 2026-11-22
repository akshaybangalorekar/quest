// _shared/gate.ts — the last thing that happens before a question is served.
//
// Every question is judged against the official material for its exam: does it carry every diagram,
// number and piece of information it needs, and are its choices correct? It is solved as part of that.
// Only a question that passes is served as cleared. Where an exam has no official material yet, a
// passing question is served but marked provisional — and once official material exists, nothing for
// that exam may remain provisional.

import { ask, jsonIn } from "./mod.ts";

const GATE = (official: string) => `You are the last check before a question is given to an 11-year-old.

${official
  ? `The official material for this exam is below. The question must match its scope, style and level.
${official}`
  : `There is no official material for this exam yet, so judge the question on its own merits.`}

For the question you are shown, check all of these:
1. Does it carry every diagram, table or figure it refers to? A question that says "the diagram below" with no
   diagram is broken.
2. Does it give every number and fact needed to answer it? Nothing unnamed, nothing missing.
3. If it measures anything — length, area, mass, time, money, volume — is the unit stated? A triangle with
   "base 6 and height 4" has no answer, because 6 what? Treat a missing unit on a measured quantity as NO.
4. Do its multiple-choice options make sense — exactly one correct, the rest believable?
5. Solve it yourself. Is there exactly one answer, and is the stored answer that answer?
6. If a drawing is shown to you, check it against the question: every label, length, angle and value the question
   names must appear, nothing may be false, and bars or shapes must be in proportion. A drawing that misleads is
   as bad as no drawing.

Reply with JSON only:
{"cleared":"YES","why":"","answer":"the answer you get","options_ok":"YES","figure_ok":"YES"}`;

export type GateVerdict = { state: "cleared" | "provisional" | "failed" | "draft"; why: string };

export async function gateQuestion(
  admin: any,
  q: { chapter: number; idx: number; prompt: string; options?: string[] | null; answer?: string | null },
  official: string,
  examHasOfficial: boolean,
): Promise<GateVerdict> {
  const text = String(q.prompt ?? "").trim();
  if (!text) return { state: "failed", why: "empty question" };

  const pointsAtFigure = /\b(picture|diagram|figure|table|chart|graph|shown|below)\b/i.test(text);
  const { data: row } = await admin.from("problems")
    .select("diagram_svg, diagram_url, diagram_box").eq("chapter", q.chapter).eq("idx", q.idx).maybeSingle();
  const hasFigure = !!(row?.diagram_svg || row?.diagram_url || row?.diagram_box);

  if (pointsAtFigure && !hasFigure) return { state: "failed", why: "it refers to a drawing that is not there" };

  const figure = row?.diagram_svg ? String(row.diagram_svg).slice(0, 2500) : "";
  const shown = `${text}` +
    `${Array.isArray(q.options) && q.options.length ? `\nOptions: ${q.options.join(" / ")}` : ""}` +
    `${figure ? `\n\nThe drawing that will be shown with it (SVG):\n${figure}` : ""}`;
  const asked = `Question: ${shown}\nStored answer: ${q.answer ?? "(none)"}`;
  let v = jsonIn(await ask(GATE(official), asked, 0, 800));
  if (!v) {
    // one more try, saying exactly what shape is wanted — a silent retry beats a wrong verdict
    v = jsonIn(await ask(GATE(official) + "\n\nReply with JSON only, no other words.",
      asked, 0, 800));
  }
  if (!v) return { state: "draft", why: "the checker did not answer — it will be tried again" };

  const cleared = String(v.cleared).toUpperCase() === "YES" && String(v.options_ok ?? "YES").toUpperCase() === "YES"
    && String(v.figure_ok ?? "YES").toUpperCase() === "YES";
  if (!cleared) return { state: "failed", why: String(v.why ?? "it did not pass the check") };

  // no official material: served, but honestly labelled provisional
  return examHasOfficial
    ? { state: "cleared", why: "" }
    : { state: "provisional", why: "no official material for this exam yet" };
}

/** run the gate over an exam's unchecked questions */
export async function gateExam(admin: any, exam: string, opts: { limit?: number } = {}) {
  const limit = opts.limit ?? 25;
  const hasOfficial = !!(await admin.rpc("exam_has_official", { p_exam: exam }))?.data;

  const { data: material } = await admin.rpc("authority_material", { p_exam: exam, p_limit: 5 });
  const official = (material ?? []).map((x: any) => String(x.body ?? "")).join("\n\n").slice(0, 3000);

  const { data: rows } = await admin.rpc("exam_questions", { p_exam: exam });
  const pending = (rows ?? []).filter((r: any) => !r.status || r.status === "draft").slice(0, limit);

  const counts = { cleared: 0, provisional: 0, failed: 0 };

  for (const r of pending) {
    const { data: full } = await admin.from("problems")
      .select("chapter, idx, prompt, options").eq("chapter", r.chapter).eq("idx", r.idx).maybeSingle();
    const { data: ans } = await admin.from("problem_answers")
      .select("answer_key").eq("chapter", r.chapter).eq("idx", r.idx).maybeSingle();

    const verdict = await gateQuestion(admin, { ...full, answer: ans?.answer_key }, official, hasOfficial);
    await admin.rpc("set_question_status", {
      p_chapter: r.chapter, p_idx: r.idx, p_status: verdict.state, p_note: verdict.why || null,
    });

    counts[verdict.state]++;
  }

  // official material exists, so nothing for this exam may stay provisional: it is checked again
  if (hasOfficial) {
    const { data: provisional } = await admin.from("problems")
      .select("chapter, idx, prompt, options").eq("status", "provisional")
      .in("chapter", (rows ?? []).map((r: any) => r.chapter)).limit(20);

    for (const q of provisional ?? []) {
      const { data: ans } = await admin.from("problem_answers")
        .select("answer_key").eq("chapter", q.chapter).eq("idx", q.idx).maybeSingle();
      const v = await gateQuestion(admin, { ...q, answer: ans?.answer_key }, official, true);
      await admin.rpc("set_question_status", {
        p_chapter: q.chapter, p_idx: q.idx, p_status: v.state, p_note: v.why || null,
      });
      counts[v.state]++;
    }
  }

  return { exam, official: hasOfficial, checked: pending.length, ...counts };
}
