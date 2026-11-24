// draw-figure — the coach drawing on the board.
//
// Deploy:  supabase functions deploy draw-figure
// Secret:  SARVAM_API_KEY (already set)
//
// POST { chapter, kind: "example" | "question", n?, idx?, question?, hint? }
//   -> { svg, cached, checked }
//
// It draws one figure for one question, in colour, at a decent size, then checks
// its own work: a second pass reads the question against the drawing and answers
// yes or no. A drawing that fails the check is thrown away and nothing is stored,
// so the app falls back to the real page crop. A wrong picture is worse than the
// original page.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ask } from "./_shared/mod.ts";

const MODEL = "glm5.3-flash";
const ENDPOINT = "https://api.sarvam.ai/v2/chat/completions";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROMPT = `You are drawing a teaching figure for a maths question, as an SVG.

This drawing is what the student will look at, so it must be right, and it must show ONE idea.

STEP 1 — should there be a picture at all?
- If the idea is spatial, comparative or sequential (fractions, place value, area, angles, number lines,
  arrays, Venn sets, cube stacks, ratio bars), draw it.
- If the idea is a single static fact or an algebraic manipulation, reply with exactly: NONE
- If the question refers to a drawing that already exists in its own page, reply with exactly: NONE
  (that drawing is cut from the page instead — never redrawn).
- If words alone would explain it better, reply with exactly: NONE

STEP 2 — use a template, do not invent geometry
  T1 fraction circle   parts, filled
  T2 bar model         parts[], total
  T3 number line hop   start, step, steps, direction
  T4 area grid         rows, cols
  T5 place value       ones, into (ten|hundred)
  T6 angle sweep       degrees
  T7 transformation    slide|flip|turn
  T8 comparison bars   a, b, difference
  T9 Venn sets         a, b, both, neither
  T10 cube stack       layers[]  (cubes drawn as isometric stacks, counted exactly)
  T11 ratio table      pairs[][]
  T12 clock face       hh, mm
If none of these fits, reply with exactly: NONE — never draw an approximation.

STEP 3 — fill it with the question's own numbers, then check the maths before drawing
- Equal parts must be equal: n parts means 360/n degrees each, every one identical.
- Bars and stacks in proportion: one unit is a constant width or a constant number of cubes.
- Tick spacing uniform and proportional to the step.
- Every value the question names appears as a label; nothing else is labelled.
- Nothing drawn twice, nothing miscounted, no part shaded twice.

STEP 4 — draw it
- viewBox "0 0 480 340"; width="100%"; every element inside the viewBox (nothing clipped, nothing off-canvas).
- role="img", with <title> and <desc>. The <desc> states the MATHS, not the look:
  "one circle split into six equal parts, five shaded" — never "a colourful circle".
- Palette only: ink #14304A, muted #6B7F92, accent #7EC8E3, #F4A261, #8CC084, #FFD166, #B9A7E0,
  error #EF6F6C, paper #FFFFFF, ghost #EAF3F8. One accent per meaning, and that meaning does not change
  inside the figure.
- Structure stroke 2, the thing being discussed stroke 3. Font 15 for labels, 13 for small ones,
  font-family="system-ui, sans-serif". Flat fills, no gradients, no shadows.
- Motion is allowed only for change over time, 2–4 s, then hold the final state. Never more than two
  moving elements. Never bounce, spin or decorate. Wrap any animation so that
  @media (prefers-reduced-motion: reduce) shows the final state with no motion.
- No title text, no answer, no workings, no watermark.

Reply with the SVG only, starting with <svg and ending with </svg>, or the single word NONE.`;


/* The prose rules above cannot stop a model drifting; these checks can.
   A drawing that fails any of them is not returned at all. */
const PALETTE = ["#14304A", "#6B7F92", "#7EC8E3", "#F4A261", "#8CC084", "#FFD166", "#B9A7E0",
                 "#EF6F6C", "#FFFFFF", "#EAF3F8"];

function validateFigure(svg: string): { ok: boolean; why: string } {
  const s = svg.trim();
  if (!/^<svg[\s>]/i.test(s)) return { ok: false, why: "not an svg" };
  if (!/viewBox=/i.test(s)) return { ok: false, why: "no viewBox" };
  if (!/role=["']img["']/i.test(s)) return { ok: false, why: "no role" };
  if (!/<title>[^<]+<\/title>/i.test(s)) return { ok: false, why: "no title" };
  if (!/<desc>[^<]+<\/desc>/i.test(s)) return { ok: false, why: "no desc" };

  // nothing may be drawn outside the canvas
  const box = s.match(/viewBox=["']\s*([\d.\-]+)[\s,]+([\d.\-]+)[\s,]+([\d.\-]+)[\s,]+([\d.\-]+)/i);
  if (box) {
    const w = Number(box[3]), h = Number(box[4]);
    for (const m of s.matchAll(/\b(cx|x1|x2|x)=["']([\d.\-]+)["']/g)) {
      const v = Number(m[2]);
      if (v < -1 || v > w + 1) return { ok: false, why: `drawn outside the canvas (x=${v})` };
    }
    for (const m of s.matchAll(/\b(cy|y1|y2|y)=["']([\d.\-]+)["']/g)) {
      const v = Number(m[2]);
      if (v < -1 || v > h + 1) return { ok: false, why: `drawn outside the canvas (y=${v})` };
    }
  }

  // the palette is the palette
  for (const m of s.matchAll(/(?:fill|stroke|stop-color)=["'](#[0-9a-fA-F]{6})["']/g)) {
    const c = m[1].toUpperCase();
    if (!PALETTE.includes(c) && c !== "NONE") return { ok: false, why: `colour outside the palette (${c})` };
  }

  // something must actually be drawn
  const shapes = (s.match(/<(rect|circle|path|line|polygon|polyline|ellipse|text)\b/gi) || []).length;
  if (shapes < 3) return { ok: false, why: "the figure is empty" };

  return { ok: true, why: "" };
}

const CHECK = `You are checking a drawing against the question it belongs to.

Answer with one word: YES if the drawing shows every element the question names and nothing false.
NO if a label is missing, a number is wrong, a shape is not what the question says, or a length or
angle is clearly not in proportion.

Be strict. A student will read this drawing instead of the page.`;

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

    let user: any = null;
    const drain = req.headers.get("x-quest-drain") ?? "";
    const whose = req.headers.get("x-quest-student") ?? "";
    if (drain) {
      const { data: expected } = await admin.rpc("drain_token");
      if (!expected || drain !== expected || !whose) return json({ error: "not allowed" }, 403);
      user = { id: whose };
    } else {
      const got = await asUser.auth.getUser();
      user = got.data?.user ?? null;
    }
    if (!user) return json({ error: "not signed in" }, 401);

    const { chapter, kind = "question", n = null, idx = null, question = null } = await req.json();
    if (!chapter) return json({ error: "chapter required" }, 400);

    const table = kind === "example" ? "examples" : "problems";
    const keyCol = kind === "example" ? "n" : "idx";
    const keyVal = kind === "example" ? n : idx;
    if (!keyVal) return json({ error: "which one?" }, 400);

    const { data: row } = await admin.from(table)
      .select(`${keyCol}, prompt, diagram_svg`).eq("chapter", chapter).eq(keyCol, keyVal).single();
    if (!row) return json({ error: "no such item" }, 404);
    if (row.diagram_svg) return json({ svg: row.diagram_svg, cached: true, checked: true });

    const text = String(question ?? row.prompt ?? "");

    // first pass: draw it
    const drawn = await ask([
      { role: "system", content: PROMPT },
      { role: "user", content: `The question:\n\n${text}` },
    ], 0.25, 3000);

    if (!drawn || /^\s*NONE\s*$/i.test(drawn)) return json({ svg: "", note: "not drawable from the words" });
    const start = drawn.indexOf("<svg"), end = drawn.lastIndexOf("</svg>");
    if (start < 0 || end < 0) return json({ svg: "", note: "no figure for this one" });
    const svg = drawn.slice(start, end + 6);
    if (svg.length < 200) return json({ svg: "", note: "the drawing came back empty" });

    // the structural gate: palette, canvas bounds, accessibility, and something actually drawn
    const structural = validateFigure(svg);
    if (!structural.ok) return json({ svg: "", note: `the drawing broke a rule: ${structural.why}`, checked: false });

    // second pass: does it show what the question says?
    const verdict = await ask([
      { role: "system", content: CHECK },
      { role: "user", content: `Question:\n${text}\n\nDrawing (SVG):\n${svg}` },
    ], 0.1, 20);

    const ok = /^\s*YES/i.test(String(verdict ?? ""));
    if (!ok) return json({ svg: "", note: "the drawing did not pass its own check", checked: false });

    await admin.from(table).update({ diagram_svg: svg }).eq("chapter", chapter).eq(keyCol, keyVal);
    return json({ svg, cached: false, checked: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

async function ask(messages: unknown[], temperature: number, maxTokens: number) {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "api-subscription-key": Deno.env.get("SARVAM_API_KEY")!,
    },
    body: JSON.stringify({ model: MODEL, temperature, max_tokens: maxTokens, messages }),
  });
  if (!r.ok) return "";
  const body = await r.json();
  return String(body?.choices?.[0]?.message?.content ?? "");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "content-type": "application/json" },
  });
}
