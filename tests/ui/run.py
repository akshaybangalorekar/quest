#!/usr/bin/env python3
"""tests/ui/run.py — run the per-screen tests in a real browser.

Each case gets a fresh copy of index.html with the stub and the case list injected, is run
headlessly, and reports PASS/FAIL line by line. Exit code is non-zero if anything fails.

    python3 tests/ui/run.py            # all cases
    python3 tests/ui/run.py pause      # only cases whose name contains "pause"
"""
import json, os, re, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HTML = os.path.join(ROOT, "index.html")
ASSETS = os.path.join(ROOT, "assets")
UI = os.path.join(ROOT, "tests", "ui")

RUNNER = """
<script>
window.__results = [];
// every generated scenario becomes a case, with the same assertion interface
if (Array.isArray(window.__diagrams)) {
  window.CASES = (Array.isArray(window.CASES) ? window.CASES : []).concat(window.__diagrams.map((sc) => ({
    name: sc.name, generated: true,
    run: async ({ assert, T }) => {
      window.__fixtures["truth"] = T.baseTruth();
      window.__fixtures["sync_view"] = { totals: { questions: 1 }, library: {}, exams: [] };
      window.__fixtures["exam_pipeline"] = [];
      window.__fixtures["fn:draw-figure"] = { svg: "<svg viewBox='0 0 320 200'><circle cx='60' cy='60' r='40'/></svg>" };
      window.__fixtures["fn:check-figure"] = { ok: true, why: "" };
      T.show("session");
      document.getElementById("qFig")?.remove();          // no stale box from the case before
      window.__state.script = []; window.__state.si = 0;   // and no stale session either
      window.__state.chapter = 1;
      const el = document.createElement("div");
      el.id = "qFig";
      document.body.appendChild(el);
      const prompt = `Look at the diagram for this ${sc.kind} (${sc.layout}, from a ${sc.format}). How many are in both?`;
      await window.autoFigure("question", 1, "qFig", prompt, "", { diagram_kind: sc.kind, prompt });
      await T.wait(250);
      const fails = [];
      if (T.calls("draw-figure").length === 0) fails.push("the drawer was never asked");
      if (!/<svg/i.test(el.innerHTML)) fails.push("nothing was drawn into the figure box: " + el.innerHTML.slice(0, 40));
      el.remove();
      if (fails.length) fails.forEach((f) => assert(f, false));
      else assert("the figure path holds", true);
    },
  })));
}

if (Array.isArray(window.__uploads)) {
  window.CASES = (Array.isArray(window.CASES) ? window.CASES : []).concat(window.__uploads.map((sc) => ({
    name: sc.name, generated: true,
    run: async ({ assert, T }) => {
      const up = sc.upload || {};
      window.__fixtures["truth"] = T.baseTruth();
      window.__fixtures["sync_view"] = { totals: { questions: 0 }, library: {}, exams: [] };
      window.__fixtures["exam_pipeline"] = [];
      window.__fixtures["save_upload"] = 11;
      let pagesLeft = up.next ? 1 : 0;
      window.__fixtures["next_parse_page"] = () => (pagesLeft-- > 0 ? up.next : null);
      window.__fixtures["parse_progress"] = up.prog ?? { pages_done: 0, pages_total: 1 };
      window.__fixtures["papers_to_read"] = [{ id: 1, title: up.name, pages: up.pages, questions: 0 }];
      window.__fixtures["restart_reading"] = { ok: true };
      window.__fixtures["delete_paper"] = { ok: true };
      window.__fixtures["dismiss_parse_note"] = {};
      window.__fixtures["add_questions"] = { added: 1, enriched: 0, skipped: 0 };
      window.__fixtures["print_rows"] = [];
      window.__fixtures["training_status"] = { docs: 0, chunks: 0, web_docs: 0, upload_docs: 1, cleared: 0,
        provisional: 0, draft: 0, failed: 0, servable: 0, official_exams: [] };
      window.__fixtures["training_view"] = { sources: [], uploaded: [{ id: 1, title: up.name, questions: 0, pages: up.pages }], generated: 0, from_files: 0 };
      window.__fixtures["recent_jobs"] = [];
      window.__fixtures["held_back_reasons"] = [];
      window.__fixtures["model_balance"] = { balance_inr: 100, alert_below_inr: 10, low: false,
        today: { inr: 0, calls: 0 }, week: { inr: 0 }, calls_by_function: {}, model: "glm5.3-flash" };
      window.__fixtures["usage_limits"] = {};
      window.__fixtures["fn:parse-page"] = up.fail
        ? { error: "the page could not be read", detail: "the image was unreadable" }
        : { ok: true, questions: 3, diagrams: 1, answers: 3 };
      T.show("parent");
      const file = new File(["x"], up.name || "B1.pdf", { type: up.mime || "application/pdf" });
      // a file with nothing to read cannot call the reader: drop that expectation for those states
      const steps = up.next ? sc.steps : sc.steps.filter((x) => !String(x).includes("expect:call:parse-page"));
      const fails = await window.__runScenario({ ...sc, steps, wait: 15 }, T, { __FILE__: file, kid: "kid", edutest: "edutest" });
      if (fails.length) fails.forEach((f) => assert(f, false));
      else assert("the upload journey holds", true);
    },
  })));
}

if (Array.isArray(window.__scenarios)) {
  window.CASES = (Array.isArray(window.CASES) ? window.CASES : []).concat(window.__scenarios.map((sc) => ({
    name: sc.name, generated: true,
    run: async ({ assert, T }) => {
      const d = sc.data || {};
      window.__fixtures["truth"] = T.baseTruth(d.dayone ? { student: { id: "kid", name: "A", xp: 0, streak: 0, days_in: 1 } } : {});
      window.__fixtures["sync_view"] = d.sync || { totals: {}, library: {}, exams: [] };
      window.__fixtures["exam_pipeline"] = [];
      window.__fixtures["plan_sitting"] = { minutes: 60, questions: 2, chapter: 1 };
      window.__fixtures["next_in_chapter"] = d.questions || [];
      window.__fixtures["submit_answer"] = { correct: true, answer: "12", method: "add" };
      window.__fixtures["log_visit"] = {};
      window.__fixtures["question_budget"] = { seconds: 90 };
      window.__fixtures["save_session"] = { ok: true };
      window.__fixtures["load_session"] = { chapter: 1, si: 1, paused: true, script: d.questions || [] };
      window.__fixtures["print_rows"] = d.questions || [];
      window.__fixtures["wipe_history"] = { attempts: 0, sessions: 0, mocks: 0 };
      window.__fixtures["wipe_questions"] = { deleted: 0 };
      window.__fixtures["credits_state"] = d.wallet ? { empty: true, empty_at: "2026-11-20T00:00:00Z" } : { empty: false };
      window.__fixtures["may_call_model"] = d.cap ? { allowed: false, reason: "cap" } : { allowed: true };
      window.__fixtures["fn:coach-chat"] = { reply: "next: subtraction" };
      window.__fixtures["training_status"] = { docs: 1, chunks: 1, web_docs: 1, upload_docs: 0, cleared: 0,
        provisional: (d.sync && d.sync.totals && d.sync.totals.questions) || 0, draft: 0, failed: 0, servable: 0, official_exams: [] };
      window.__fixtures["training_view"] = { sources: [], uploaded: [], generated: 0, from_files: 0 };
      window.__fixtures["recent_jobs"] = [];
      window.__fixtures["held_back_reasons"] = [];
      window.__fixtures["model_balance"] = { balance_inr: 100, alert_below_inr: 10, low: false,
        today: { inr: 0, calls: 0 }, week: { inr: 0 }, calls_by_function: {}, model: "glm5.3-flash" };
      window.__fixtures["usage_limits"] = {};
      window.__fixtures["topic_readiness"] = [];
      window.__fixtures["exam_specs"] = [];
      window.__fixtures["list_accounts"] = [];
      T.show("session");
      const fails = await window.__runScenario({ ...sc, wait: 15 }, T);
      if (fails.length) fails.forEach((f) => assert(f, false));
      else assert("the journey holds", true);
    },
  })));
}
window.__done = false;
(async function () {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(1200);
  const only = %FILTER%;
  const batch = %BATCH%;
  const suites = %SUITES%;
  let cases = (window.CASES || []);
  if (batch) { const [i, of] = batch.split("/").map(Number);
    const size = Math.ceil(cases.length / of); cases = cases.slice(i * size, (i + 1) * size); }
  for (const c of cases) {
    // a cached count from the case before is not this case's count
    try {
      window.__fixtures = window.__fixtures || {};
      if (window.__state) { window.__state.examCounts = []; window.__state.examCountsAt = 0; window.__state.TR = null; window.__state.parentLoadedAt = 0; }
    } catch (e) {}
    if (!suites && !batch && c.generated) continue;   // generated suites only run when asked for
    if (only && !c.name.toLowerCase().includes(only)) continue;
    const checks = [];
    const assert = (what, ok) => checks.push({ what, ok: !!ok });
    try {
      await c.run({ assert, T: window.T });
    } catch (e) {
      checks.push({ what: "the case threw: " + (e && e.message ? e.message : e), ok: false });
    }
    window.__results.push({ name: c.name, checks });
  }
  window.__done = true;
  const d = document.createElement("div");
  d.id = "testout";
  d.textContent = JSON.stringify(window.__results);
  document.body.appendChild(d);
})();
</script>
"""


BATCH = os.environ.get("BATCH", "")
SUITES = os.environ.get("SUITES", "")   # SUITES=all includes the 2,040 generated cases   # "0/5" means the first fifth of the scenarios


def build(filter_name: str, out_path: str) -> None:
    html = open(HTML, encoding="utf-8").read()
    inject = (
        '<script src="./tests/ui/harness.js"></script>'
        '<script src="./tests/ui/scenarios.js"></script>'
        '<script src="./tests/ui/uploads.js"></script><script src="./tests/ui/files.js"></script>'
        '<script src="./tests/ui/diagrams.js"></script>'
        '<script src="./tests/ui/cases.js"></script>'
    )
    # the stub has to exist before the app creates its client
    html = html.replace('<script src="./supabase.js"></script>',
                        '<script src="./supabase.js"></script>' + inject, 1)
    runner = RUNNER.replace("%FILTER%", json.dumps(filter_name)).replace("%BATCH%", json.dumps(BATCH)).replace("%SUITES%", json.dumps(SUITES))
    head, sep, tail = html.rpartition("</body>")
    html = head + runner + sep + tail
    open(out_path, "w", encoding="utf-8").write(html)


def run_case(page: str) -> list:
    cmd = [
        "chromium", "--headless=new", "--no-sandbox", "--disable-gpu",
        "--allow-file-access-from-files", "--window-size=1100,800",
        "--virtual-time-budget=60000", "--dump-dom", "file://" + page,
    ]
    out = subprocess.run(cmd, capture_output=True, text=True, timeout=280).stdout
    m = re.search(r'id="testout">(.*?)</div>', out, re.S)
    if not m:
        return [{"name": "the page never finished (too many cases for one run — use BATCH=i/n)",
                 "checks": [{"what": "no result marker: the browser was killed before the run ended", "ok": False}]}]
    return json.loads(m.group(1))


def main() -> int:
    only = (sys.argv[1] if len(sys.argv) > 1 else "").lower()
    with tempfile.TemporaryDirectory() as tmp:
        # the page loads ./assets and ./tests relative to its own folder
        page = os.path.join(ROOT, ".uitest.html")
        build(only, page)
        try:
            results = run_case(page)
        finally:
            os.path.exists(page) and os.remove(page)

    passed = failed = 0
    for case in results:
        ok = all(c["ok"] for c in case["checks"])
        print(("PASS  " if ok else "FAIL  ") + case["name"])
        for c in case["checks"]:
            if not c["ok"]:
                print("        ✗ " + c["what"])
        passed += ok
        failed += (not ok)

    print(f"\n{passed} passed, {failed} failed, {len(results)} cases")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
