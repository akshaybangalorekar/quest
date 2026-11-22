// parse-page — read one page of a paper, on the server.
//
// Deploy:  supabase functions deploy parse-page
// Secrets: SARVAM_API_KEY (already set)
//
// POST { paper_id: 12, page: 3 }
//   -> { ok: true, added: 6, unanswered: 2, strand: "Geometry" }
//
// The page image is already in storage — the browser put it there at upload
// time, because a browser is the only thing here that can render a PDF. From
// then on the work is here: the model call, the crop of any figure, and the
// writing of the questions. Closing the browser stops nothing; the next call
// picks up the next unfinished page, from any device.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MODEL = "glm5.3-flash";
const ENDPOINT = "https://api.sarvam.ai/v2/chat/completions";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPT = `This is one page from a school test or workbook. Extract every question on it.

Rules:
- One row per question. Keep the question's own words, shortened to the essentials if it is long.
- If it is multiple choice, put the options in "options" as a list of strings exactly as printed,
  and keep them out of the question text.
- If the question has a figure, keep the words and ALSO give the figure's position in
  "diagram": {"x":0.0,"y":0.0,"w":0.0,"h":0.0} as fractions of the page, top-left corner first.
  This is MANDATORY for any question that refers to a figure: "shown", "below", "above", "at the right",
  "the diagram", "the figure", "the table", "the grid". If you can see where the figure sits on the page, give the
  box. If you cannot, still give your best estimate — the box is used to cut the figure out of the page image, so a
  rough box is far better than none.
  Draw the box generously: every label and arrow that belongs to the figure, nothing of the next
  question. Add "kind":"complex" for charts, tables, maps, Venn diagrams, nets; "simple" for one
  plain shape with a couple of labels. Omit "diagram" when there is no figure on this page.
- If a question says "the diagram below" or "as shown" but the figure is NOT on this page, set
  "figure_on": "next" and still give "diagram" for where you expect it on the following page —
  or omit "diagram" and leave "figure_on":"next" if you cannot tell where it sits.
- One figure can serve several questions: give the same box for each of them.
- Never invent a figure that is not printed on the page.
- Put the answer in "a" only if the page states it, or it is a plain arithmetic fact you are sure of.
  Otherwise leave it empty.
- Never invent a question. Never merge two. Skip headers, instructions and marks like "[2]".

Reply with JSON only:
{"strand":"two or three words naming the topic",
 "rows":[{"q":"...","a":"...","options":["A 12","B 18"],
          "diagram":{"x":0.1,"y":0.3,"w":0.6,"h":0.25,"kind":"complex"}}]}`;


/* the rule lives in _shared/quality.ts, so every writer applies the same one */
async function checkRows(admin: any, paper_id: string, rows: any[]) {
  let ok = 0, held = 0, missed = 0;
  // every question on the page, not the first twelve
  for (const row of rows) {
    const q = String(row.q ?? "").trim();
    if (!q) continue;
    const v = await checkQuestion(q, !!row.diagram);
    const { error } = await admin.from("problems").update(verdictColumns(v))
      .eq("paper_id", paper_id).eq("prompt", q);
    if (error) { missed++; console.error("check write failed:", error.message); }
    v.ok ? ok++ : held++;
  }
  return { ok, held, missed };
}

import { checkQuestion, verdictColumns } from "./_shared/quality.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const asUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const pre: any = await req.clone().json().catch(() => ({}));
    let { data: { user } } = await asUser.auth.getUser();

    // the scheduler has no login of its own: a drain token lets it read a page it owns
    if (!user && pre?.token) {
      const { data: tok } = await admin.from("app_config").select("value").eq("key", "drain_token").maybeSingle();
      if (tok?.value && tok.value === pre.token) {
        // writing questions is a parent's job, so the scheduler acts as the parent who owns the child
        const { data: par } = await admin.from("parents").select("id").limit(1).maybeSingle();
        if (par?.id) user = { id: par.id } as any;
        else {
          const { data: paper } = await admin.from("papers").select("student_id").eq("id", pre.paper_id).maybeSingle();
          if (paper?.student_id) user = { id: paper.student_id } as any;
        }
      }
    }
    if (!user) return json({ error: "not signed in" }, 401);

    const { paper_id, page, chunk } = await req.json();
    if (!paper_id || !page) return json({ error: "paper and page required" }, 400);

    const { data: row } = await admin.from("paper_pages")
      .select("path, done").eq("paper_id", paper_id).eq("page_no", page).maybeSingle();
    if (!row) return json({ error: "no such page", detail: `paper ${paper_id} page ${page}` }, 404);

    const { data: paper } = await admin.from("papers")
      .select("id, exam, student_id, strand_hint").eq("id", paper_id).single();
    if (!paper) return json({ error: "no such paper" }, 404);

    // the page image, straight from storage
    const { data: blob, error: dlErr } = await admin.storage.from("papers").download(row.path);
    if (dlErr || !blob) return json({ error: "could not read the page" }, 400);
    const buf = new Uint8Array(await blob.arrayBuffer());

    // a page can be a picture or a document: send it as what it is, or the model refuses it
    const path = String(row.path ?? "");
    const isText = /(text|html|xml|json)/i.test(String(blob.type ?? "")) || /\.(html?|txt|md|json|xml)$/i.test(path);
    let b64 = "", pageText = "";

    // an HTML document is read as a book: sections, headings, images — not as one blob of text
    if (isText && /<h[1-4][\s>]/i.test(new TextDecoder("utf-8").decode(buf))) {
      const book = readHtmlBook(new TextDecoder("utf-8").decode(buf));
      const { data: stored, error: sErr } = await admin.rpc("store_doc_sections",
        { p_paper: paper_id, p_sections: book });
      if (sErr) return json({ error: sErr.message }, 400);
      await admin.from("paper_pages").update({ done: true })
        .eq("paper_id", paper_id).eq("page_no", page);
      return json({ ok: true, kind: "book", ...(stored ?? {}), page });
    }

    if (isText) {
      // a document is mostly markup: keep the words, drop the tags, and stay inside the model's limit
      pageText = new TextDecoder("utf-8").decode(buf)
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
      const from = Math.max(0, Number((pre as any)?.chunk ?? 0)) * 12000;
      pageText = pageText.slice(from, from + 12000);
      if (pageText.trim().length < 20) return json({ error: "no readable text", detail: "the file has no text in it" }, 400);
    } else {
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      b64 = btoa(bin);
    }

    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "api-subscription-key": Deno.env.get("SARVAM_API_KEY")!,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.1,
        max_tokens: 8000,
        messages: [
          { role: "system", content: PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: `Extract the questions from this ${isText ? "document" : "image"}.

Two things to check before you start:
1. A scanned image may hold ONE page or TWO facing pages. Decide which, from what you can see — do not assume:
   - one page: read it top to bottom, and set "page" to the printed page number if visible, otherwise "single";
   - two facing pages: read the LEFT page fully, then the RIGHT page, and set "page" to "left" or "right"
     (or the printed numbers if you can see both).
   Never merge a question from the left page with a question from the right page, and never split a single page
   in two just because the text is in columns.
2. If the image has no readable text at all, return {"rows": [], "why": "no readable text"} rather than guessing.` },
              ...(isText
                ? [{ type: "text", text: pageText }]
                : [{ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }]),
            ],
          },
        ],
      }),
    });
    if (!r.ok) return json({ error: "could not read that page", detail: (await r.text()).slice(0, 300) }, 422);

    const body = await r.json();
    const raw = body?.choices?.[0]?.message?.content ?? "";
    const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
    if (a < 0 || b <= a) {
      return json({ ok: true, rows: [], why: "no questions found on this page — it may be text, not a paper" });
    }

    let parsed: any = {};
    try { parsed = JSON.parse(raw.slice(a, b + 1)); }
    catch { return json({ ok: true, rows: [], why: "no questions found on this page" }); }

    const rows = (parsed.rows ?? [])
      .map((x: any) => {
        const opts = Array.isArray(x.options)
          ? x.options.map((o: unknown) => String(o ?? "").trim()).filter((o: string) => o)
          : [];
        return {
          q: String(x.q ?? "").trim(),
          ...(String(x.figure_on ?? "") === "next" && x.diagram ? { figure_page: page + 1 } : {}),
          a: String(x.a ?? "").trim(),
          ...(opts.length >= 2 ? { options: opts } : {}),
          ...(x.diagram && typeof x.diagram === "object"
            ? { diagram: x.diagram, diagram_kind: String(x.diagram.kind ?? "complex") }
            : (String(x.figure_on ?? "") === "next" ? { figure_page: page + 1 } : {})),
        };
      })
      .filter((x: any) => x.q.length > 3);

    // a parent can say where these belong; otherwise the reader names the strand
    const strand = String(paper.strand_hint ?? "").trim() || String(parsed.strand ?? "").trim() || "General";

    // write them as this child, so the same rules apply as everywhere else
    const { data: added, error: addErr } = await admin.rpc("add_questions_trusted", {
      p_exam: paper.exam,
      p_strand: strand,
      p_rows: rows,
      p_paper: paper_id,
      p_pages: rows.map(() => page),
    });
    if (addErr) return json({ error: addErr.message }, 400);

    await admin.from("paper_pages").update({ done: true })
      .eq("paper_id", paper_id).eq("page_no", page);

    // the question says which file it came from
    try {
      await asUser.from("problems")
        .update({ source_kind: "upload", source_ref: paper.title })
        .eq("paper_id", paper_id).is("source_ref", null);
    } catch (e) { console.error("provenance failed:", String((e as Error)?.message ?? e)); }

    // official material changes what is true for this exam: re-judge what is already provisional
    try {
      const { data: paper } = await admin.from("papers").select("authority, exam").eq("id", paper_id).maybeSingle();
      const key = String(paper?.authority ?? "").startsWith("official_") ? String(paper.authority).replace("official_", "") : "";
      if (key) await admin.rpc("regate_exam", { p_exam: key });
    } catch (e) { console.error("regate enqueue failed:", String((e as Error)?.message ?? e)); }

    const checked = await checkRows(admin, paper_id, rows);

    // a file is not a topic: fold whatever it created into the holding tab
    try { await admin.rpc("fold_upload_strands"); }
    catch (e) { console.error("fold failed:", String((e as Error)?.message ?? e)); }

    const unanswered = rows.filter((x: any) => !x.a).length;
    return json({ ok: true, added: added?.added ?? 0, improved: added?.improved ?? 0, unanswered,
                  checked_ok: checked.ok, held_back: checked.held, strand, page });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

/* headings become sections; each section keeps its words, its sample and its images */
function readHtmlBook(html: string) {
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");

  // split at every h1..h4, keeping the heading with what follows
  const parts: { name: string; body: string }[] = [];
  const re = /<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const heads: { at: number; end: number; name: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    heads.push({ at: m.index, end: re.lastIndex, name: m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() });
  }
  if (!heads.length) {
    parts.push({ name: "Whole document", body: clean });
  } else {
    if (heads[0].at > 0) parts.push({ name: "Front matter", body: clean.slice(0, heads[0].at) });
    heads.forEach((h, i) => {
      const next = i + 1 < heads.length ? heads[i + 1].at : clean.length;
      parts.push({ name: h.name || `Section ${i + 1}`, body: clean.slice(h.end, next) });
    });
  }

  return parts.map((p) => {
    const imgs = [...p.body.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((x) => x[1]);
    // inline drawings: keep the svg and the caption that explains it
    for (const fig of p.body.matchAll(/<figure[\s\S]*?<\/figure>/gi)) {
      const block = fig[0];
      const svg = block.match(/<svg[\s\S]*?<\/svg>/i);
      const cap = block.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i);
      if (svg) imgs.push("svg:" + (cap ? cap[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) : ""));
    }
    const words = p.body.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    return { name: p.name.slice(0, 120), chars: words.length, images: imgs, sample: words.slice(0, 700) };
  }).filter((x) => x.chars > 20 || x.images.length);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "content-type": "application/json" },
  });
}
