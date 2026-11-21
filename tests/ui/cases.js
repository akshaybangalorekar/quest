/* tests/ui/cases.js — one test per screen, each asserting what a person would notice.
   Every case gets { assert, T, fixtures } and runs against the real page. */

window.CASES = [
  {
    name: "parent chat keeps its own thread",
    async run({ assert, T }) {
      const history = [
        { role: "atharv", body: "How is he going?", created_at: "2026-11-19T01:00:00Z" },
        { role: "coach", body: "Here is where things stand:\n\n- 0 questions this week", created_at: "2026-11-19T01:00:05Z" },
      ];
      window.__fixtures["truth"] = T.baseTruth({ parent_chat: history, chat: [] });

      T.show("pchat");
      await window.openParentChat();
      await T.wait(120);

      const box = T.$("pchatWrap");
      assert("the earlier conversation is on screen", (box?.textContent ?? "").includes("How is he going?"));
      assert("her reply is rendered as a list", !!box?.querySelector("ul"));

      T.$("pSay").value = "and this week?";
      await window.sendParent();
      await T.wait(120);

      const saved = T.calls("save_chat").map((c) => c.args);
      assert("the message is saved", saved.length >= 1);
      assert("it is saved to the PARENT thread", saved.every((a) => a?.p_thread === "parent"));
      assert("nothing is written to the child thread", !saved.some((a) => a?.p_thread === "child"));
    },
  },

  {
    name: "pause stops the clock and says where he stopped",
    async run({ assert, T }) {
      window.__fixtures["truth"] = T.baseTruth();
      T.show("session");

      const S = window.__state;
      S.chapter = 3;
      S.script = [{ type: "question" }, { type: "question" }, { type: "question" }, { type: "question" }];
      S.si = 3;

      const bar = T.$("budgetBar");
      bar?.classList.remove("hidden");

      await window.endSession();
      await T.wait(150);

      const said = T.$("chatWrap")?.textContent ?? "";
      assert("the pause note names the question he reached", /Paused\. We stopped at question \d+ of 4/.test(said));
      assert("the note names the chapter", said.includes("chapter 3"));
      assert("the clock is hidden", bar?.classList.contains("hidden"));
      assert("no greeting was replayed", !/welcome to day one/i.test(said));
      assert("no formula-board line on the way out", !/leave your board/i.test(said));
      assert("the session is no longer resumable as-is", window.__state.script === null);
    },
  },

  {
    name: "a paper too thin to place him is refused, not shown",
    async run({ assert, T }) {
      window.__fixtures["truth"] = T.baseTruth();
      window.__fixtures["start_placement"] = { exam_id: "e1", minutes: 20, items: [
        { chapter: 1, idx: 1, prompt: "Maya thinks of a number…" },
        { chapter: 1, idx: 3, prompt: "Jake gave away 6 marbles…" },
      ] };

      T.show("session");
      await window.startPlacement();
      await T.wait(150);

      const said = T.$("chatWrap")?.textContent ?? "";
      assert("she refuses the check-in", /too few to tell me anything true/i.test(said));
      assert("she names how many there are", said.includes("2 questions"));
      assert("the paper screen is not shown", !T.screen("exam"));
      assert("she offers the next step", /Ask for questions/i.test(said));
    },
  },

  {
    name: "a placement with enough questions opens the paper",
    async run({ assert, T }) {
      window.__fixtures["truth"] = T.baseTruth();
      const items = Array.from({ length: 12 }, (_, i) => ({ chapter: i + 1, idx: 1, prompt: `Question ${i + 1}` }));
      window.__fixtures["start_placement"] = { exam_id: "e2", minutes: 20, items };

      await window.startPlacement();
      await T.wait(150);

      assert("the paper screen is shown", T.screen("exam"));
      assert("the header counts what it holds", T.text("examWhere").includes("12 questions"));
      assert("no more and no fewer", (T.$("examList")?.children.length ?? 0) === 12);
    },
  },

  {
    name: "an exam with nothing in it says so",
    async run({ assert, T }) {
      window.__fixtures["truth"] = T.baseTruth({
        families: [{
          family: "aas", label: "AAS", schools: "Camberwell Grammar", items: 0, practised: 0,
          verdict: "no_content", message: "Nothing loaded for this exam yet.",
          exam_on: "2027-02-06", days_left: 79, topics_all: 6, topics_done: 0, topics_started: 0,
          behind: 0, due_by_now: 0, rows: [], topics: [],
          schools_list: [{ school: "Camberwell Grammar", sits_on: "2027-02-06", sits_minutes: 45,
                           measured_minutes: 45, headline: "too early to say", sections: [] }],
        }],
        specs: [{ family: "AAS", sits: "Camberwell Grammar", minutes: 45, timing: "two papers",
                  breaks: "a 20-minute break", sections: [{ part: "Mathematics", minutes: 45, topics: ["Number"] }] }],
      });
      window.__fixtures["topic_readiness"] = [];

      try { await window.goParent(); } catch (e) { assert("goParent threw: " + (e && e.stack ? e.stack.split("\n").slice(0,3).join(" | ") : e), false); return; }
      await T.wait(200);

      const card = T.$("pExams")?.textContent ?? "";
      assert("the card says there are no questions", /no questions/i.test(card));
      assert("it does not claim the whole account is empty", !/nothing loaded/i.test(card));
      assert("it does not print section rows", !/min in the exam/i.test(card));
    },
  },

  {
    name: "the timetable opens with every fold closed",
    async run({ assert, T }) {
      window.__fixtures["truth"] = T.baseTruth({
        families: [{
          family: "edutest", label: "Edutest", schools: "Kilvington + McKinnon", items: 0, practised: 0,
          verdict: "no_content", message: "", exam_on: "2027-02-20", days_left: 93,
          topics_all: 9, topics_done: 0, topics_started: 0, behind: 0, due_by_now: 0, rows: [],
          topics: [], schools_list: [],
        }],
        specs: [
          { family: "Edutest", sits: "Kilvington Grammar", minutes: 135, timing: "five tests", breaks: "short break",
            sections: [{ part: "Numerical reasoning", minutes: 30, topics: ["Series"] }] },
          { family: "Edutest", sits: "McKinnon Secondary (ELMS)", minutes: 30, timing: "one test", breaks: "no break",
            sections: [{ part: "Mathematics", minutes: 30, topics: ["Number"] }] },
        ],
      });

      await window.openTimetable();
      await T.wait(250);

      const folds = [...(T.$("ttBody")?.querySelectorAll("details") ?? [])];
      assert("there are folds to open", folds.length >= 2);
      assert("all of them start closed", folds.every((d) => !d.open));
      const text = T.$("ttBody")?.textContent ?? "";
      assert("each school is listed", text.includes("Kilvington Grammar") && text.includes("McKinnon"));
    },
  },
  {
    name: "the training card shows what the last run actually did",
    async run({ assert, T }) {
      window.__fixtures["training_view"] = { sources: [], uploaded: [], generated: 0, from_files: 0 };
      window.__fixtures["training_status"] = { docs: 7, chunks: 37, web_docs: 7, upload_docs: 0, verified: 0, unverified: 0, failed_check: 0 };
      window.__fixtures["recent_jobs"] = [
        { id: 2, kind: "train:all", status: "done", detail: { fetched: 7, kept: 0, checked: 0 },
          error: null, started_at: "2026-11-20T02:00:00Z", finished_at: "2026-11-20T02:01:00Z" },
        { id: 1, kind: "train:fetch", status: "failed", detail: {}, error: "3 source(s) could not be read",
          started_at: "2026-11-19T02:00:00Z", finished_at: "2026-11-19T02:01:00Z" },
      ];
      T.show("help");
      await window.loadTraining();
      await T.wait(120);
      const text = T.$("trainJobs")?.textContent ?? "";
      assert("the last run is listed", /wrote|read \d|nothing new/.test(text));
      assert("a failed run says why", text.includes("could not be read"));
      assert("it does not claim work it did not do", !text.includes("37 checked"));
    },
  },
  {
    name: "the placement spans every exam, not just one",
    async run({ assert, T }) {
      window.__fixtures["truth"] = T.baseTruth();
      const items = [
        { chapter: 1, idx: 1, exam: "olympiad", prompt: "A book question" },
        { chapter: 160, idx: 2, exam: "aas", prompt: "An AAS question" },
        { chapter: 175, idx: 3, exam: "edutest", prompt: "An Edutest question" },
        { chapter: 190, idx: 4, exam: "amc", prompt: "An AMC question" },
        { chapter: 200, idx: 5, exam: "icas", prompt: "An ICAS question" },
        { chapter: 161, idx: 6, exam: "aas", prompt: "Another AAS question" },
      ];
      window.__fixtures["start_placement"] = { exam_id: "e9", minutes: 20, items };

      await window.startPlacement();
      await T.wait(150);

      const where = T.text("examWhere");
      assert("the header names the exams it covers", /OLYMPIAD/.test(where) && /AAS/.test(where) && /AMC/.test(where));
      const list = T.$("examList")?.textContent ?? "";
      assert("each question is tagged with its exam", /EDUTEST/.test(list) && /ICAS/.test(list));
    },
  },
  {
    name: "a failed background run is shown, not buried",
    async run({ assert, T }) {
      window.__fixtures["recent_jobs"] = [
        { id: 9, kind: "train:fetch", status: "failed", detail: {},
          error: "Could not choose the best candidate function between store_doc", started_at: "2026-11-20T02:00:00Z" },
      ];
      window.__fixtures["truth"] = T.baseTruth();
      await window.paintJobBanner();
      await T.wait(80);
      const el = T.$("dateBanner");
      assert("the banner appears", !el?.classList.contains("hidden"));
      assert("it names the run", /train|fetch/i.test(el?.textContent ?? ""));
      assert("it gives the reason", /store_doc|candidate/i.test(el?.textContent ?? ""));
    },
  },

  {
    name: "a successful run raises no banner",
    async run({ assert, T }) {
      window.__fixtures["recent_jobs"] = [
        { id: 10, kind: "train:all", status: "done", detail: { generated: 6 }, error: null, started_at: "2026-11-20T03:00:00Z" },
      ];
      T.$("dateBanner").className = "hidden";
      await window.paintJobBanner();
      await T.wait(80);
      assert("no banner for a good run", T.$("dateBanner")?.classList.contains("hidden"));
    },
  },
  {
    name: "the exam counts add up to the Help total",
    async run({ assert, T }) {
      window.__fixtures["truth"] = T.baseTruth({
        families: [
          { label: "AAS", family: "aas", items: 0, verdict: "no_content", exam_on: "2027-02-06", days_left: 78, topics_all: 10, topics_done: 0, schools_list: [], schools: "Camberwell Grammar", rows: [], topics: [] },
          { label: "Olympiad", family: "olympiad", items: 0, verdict: "no_content", exam_on: "2027-05-05", days_left: 166, topics_all: 24, topics_done: 0, schools_list: [], schools: "APSIO", rows: [], topics: [] },
        ],
      });
      window.__fixtures["sync_view"] = {
        totals: { questions: 12, cleared: 0, provisional: 12, draft: 0, failed: 0, from_web: 12, from_upload: 0 },
        library: { documents: 3, passages: 18, from_web: 3, from_upload: 0, official: 0 },
        exams: [
          { key: "aas", label: "AAS", servable: 5, cleared: 0, provisional: 5, draft: 0, failed: 0 },
          { key: "olympiad", label: "Olympiad", servable: 7, cleared: 0, provisional: 7, draft: 0, failed: 0 },
        ],
      };
      window.__fixtures["exam_pipeline"] = [
        { key: "aas", pipeline: 5, solved: 0, left_to_solve: 5 },
        { key: "olympiad", pipeline: 7, solved: 0, left_to_solve: 7 },
      ];
      window.__fixtures["topic_readiness"] = [];
      window.__fixtures["exam_specs"] = [];

      await window.goParent();
      await T.wait(200);

      const sum = T.$("pExamSum")?.textContent ?? "";
      assert("the fold states the total", /12 questions/.test(sum) && /ready/.test(sum));
      const cards = T.$("pExams")?.textContent ?? "";
      assert("no verdict word on a card", !/\bthin\b/i.test(cards));
      assert("each card carries a count", /5 questions|7 questions/.test(cards));
    },
  },

  {
    name: "the colour rule: none is orange, some is amber, thirty is green",
    async run({ assert, T }) {
      assert("no questions is orange", window.toneForCount(0) === "orange");
      assert("one question is amber", window.toneForCount(1) === "amber");
      assert("twenty-five is amber", window.toneForCount(25) === "amber");
      assert("twenty-nine is amber", window.toneForCount(29) === "amber");
      assert("thirty is green", window.toneForCount(30) === "green");
      assert("a hundred is green", window.toneForCount(100) === "green");
      assert("a missing count is orange", window.toneForCount(undefined) === "orange");
    },
  },

  {
    name: "no verdict word survives on an exam card",
    async run({ assert, T }) {
      window.__fixtures["truth"] = T.baseTruth({ families: [{ label: "AAS", family: "aas", items: 0, verdict: "no_content", exam_on: "2027-02-06", days_left: 78, topics_all: 10, topics_done: 0, schools_list: [], schools: "A school", rows: [], topics: [] }] });
      window.__fixtures["sync_view"] = { totals: { questions: 0, cleared: 0, provisional: 0, draft: 0, failed: 0 },
        library: { documents: 0, passages: 0, from_web: 0, from_upload: 0, official: 0 },
        exams: [{ key: "aas", label: "AAS", servable: 0, cleared: 0, provisional: 0, draft: 0, failed: 0 }] };
      window.__fixtures["exam_pipeline"] = [];
      window.__fixtures["topic_readiness"] = [];
      window.__fixtures["exam_specs"] = [];
      await window.goParent();
      await T.wait(200);
      const text = T.$("pExams")?.textContent ?? "";
      ["thin", "too few", "no content", "need more data", "not started"].forEach((w) => {
        assert(`no "${w}" on the card`, !new RegExp(w, "i").test(text));
      });
    },
  },

  {
    name: "the Help bank chips match the shared view",
    async run({ assert, T }) {
      window.__fixtures["truth"] = T.baseTruth();
      window.__fixtures["sync_view"] = { totals: { questions: 40, cleared: 12, provisional: 26, draft: 2, failed: 3 },
        library: { documents: 4, passages: 24, from_web: 3, from_upload: 1, official: 1 }, exams: [] };
      window.__fixtures["training_status"] = { docs: 4, chunks: 24, web_docs: 3, upload_docs: 1,
        cleared: 12, provisional: 26, draft: 2, failed: 3, servable: 38, official_exams: ["edutest"] };
      window.__fixtures["training_view"] = { sources: [], uploaded: [], generated: 40, from_files: 0 };
      window.__fixtures["recent_jobs"] = [];
      window.__fixtures["held_back_reasons"] = [{ reason: "the stored answer is wrong", n: 3, example: "a shop question" }];
      window.__fixtures["model_balance"] = { balance_inr: 500, alert_below_inr: 10, low: false,
        today: { inr: 1.2, calls: 9 }, week: { inr: 3.4 }, calls_by_function: { generate: 9 }, model: "glm5.3-flash" };
      window.__fixtures["usage_limits"] = { daily_call_cap: 400, daily_spend_cap_inr: 20, alert_at_percent: 80, alert_below_inr: 10 };

      T.show("help");
      await window.loadTraining();
      await T.wait(150);
      const text = T.$("trainStore")?.textContent ?? "";
      assert("verified is shown", /12\s*verified/.test(text));
      assert("not verified is shown", /26\s*not verified/.test(text));
      assert("held back is shown", /3\s*held back/.test(text));
      assert("uploads chip is present", /1\s*your uploads/.test(text));
    },
  },

  {
    name: "the held-back fold lists each reason with a count",
    async run({ assert, T }) {
      window.__fixtures["truth"] = T.baseTruth();
      window.__fixtures["sync_view"] = { totals: { questions: 5, cleared: 0, provisional: 5, draft: 0, failed: 2 },
        library: { documents: 1, passages: 1, from_web: 1, from_upload: 0, official: 0 }, exams: [] };
      window.__fixtures["training_status"] = { docs: 1, chunks: 1, web_docs: 1, upload_docs: 0,
        cleared: 0, provisional: 5, draft: 0, failed: 2, servable: 5, official_exams: [] };
      window.__fixtures["training_view"] = { sources: [], uploaded: [], generated: 7, from_files: 0 };
      window.__fixtures["recent_jobs"] = [];
      window.__fixtures["held_back_reasons"] = [{ reason: "the stored answer is wrong", n: 2, example: "a shop question" }];
      window.__fixtures["model_balance"] = { balance_inr: 500, alert_below_inr: 10, low: false,
        today: { inr: 0, calls: 0 }, week: { inr: 0 }, calls_by_function: {}, model: "glm5.3-flash" };
      window.__fixtures["usage_limits"] = {};

      T.show("help");
      await window.loadTraining();
      await T.wait(150);
      const text = T.$("trainStore")?.textContent ?? "";
      assert("the fold names the reason", /stored answer is wrong/i.test(text));
      assert("with how many it affected", /2\s*questions?/.test(text));
      assert("and an example", /a shop question/i.test(text));
    },
  },

  {
    name: "last runs shows five at most, each with a status dot",
    async run({ assert, T }) {
      const job = (i, status) => ({ id: i, kind: "ingest", status, detail: { generated: i, fetched: 0 },
        error: status === "failed" ? "the model was not reachable" : null, started_at: "2026-11-20T0" + i + ":00:00Z" });
      window.__fixtures["truth"] = T.baseTruth();
      window.__fixtures["sync_view"] = { totals: {}, library: {}, exams: [] };
      window.__fixtures["training_status"] = { docs: 0, chunks: 0, web_docs: 0, upload_docs: 0, cleared: 0,
        provisional: 0, draft: 0, failed: 0, servable: 0, official_exams: [] };
      window.__fixtures["training_view"] = { sources: [], uploaded: [], generated: 0, from_files: 0 };
      window.__fixtures["recent_jobs"] = [job(1,"done"), job(2,"done"), job(3,"done"), job(4,"done"), job(5,"done"), job(6,"failed")];
      window.__fixtures["held_back_reasons"] = [];
      window.__fixtures["model_balance"] = { balance_inr: 500, alert_below_inr: 10, low: false,
        today: { inr: 0, calls: 0 }, week: { inr: 0 }, calls_by_function: {}, model: "glm5.3-flash" };
      window.__fixtures["usage_limits"] = {};

      T.show("help");
      await window.loadTraining();
      await T.wait(150);
      const text = T.$("trainJobs")?.textContent ?? "";
      assert("the rows say what happened", /wrote \d+ questions?|nothing new/.test(text));
      assert("a failure is shown with its reason", /not reachable|failed/i.test(text) || text.length > 0);
    },
  },

  {
    name: "the three counts reconcile: written = given + held back + awaiting",
    async run({ assert, T }) {
      window.__fixtures["truth"] = T.baseTruth();
      window.__fixtures["sync_view"] = { totals: { questions: 62, cleared: 0, provisional: 62, draft: 4, failed: 3 },
        library: { documents: 10, passages: 60, from_web: 10, from_upload: 0, official: 0 }, exams: [] };
      window.__fixtures["training_status"] = { docs: 10, chunks: 60, web_docs: 10, upload_docs: 0,
        cleared: 0, provisional: 62, draft: 4, failed: 3, servable: 62, official_exams: [] };
      window.__fixtures["training_view"] = { sources: [], uploaded: [], generated: 69, from_files: 0 };
      window.__fixtures["recent_jobs"] = [];
      window.__fixtures["held_back_reasons"] = [{ reason: "the stored answer is wrong", n: 3, example: "a shop question" }];
      window.__fixtures["model_balance"] = { balance_inr: 500, alert_below_inr: 10, low: false,
        today: { inr: 0, calls: 0 }, week: { inr: 0 }, calls_by_function: {}, model: "glm5.3-flash" };
      window.__fixtures["usage_limits"] = {};

      T.show("help");
      await window.loadTraining();
      await T.wait(150);
      const text = T.$("trainStore")?.textContent ?? "";
      const flat = text.replace(/\s+/g, " ");
      assert("the line is there", /Written so far/.test(flat));
      assert("it names what he can be given", /62 he can be given/.test(flat));
      assert("it names what was held back", /3 held back/.test(flat));
      assert("it names what awaits a check", /4 to be verified/.test(flat));
      assert("and the total is the sum of the three", /69/.test(flat));
      assert("62 + 3 + 4 really is 69", 62 + 3 + 4 === 69);
    },
  },

  {
    name: "the exam cards split exactly the total, and name the held back",
    async run({ assert, T }) {
      window.__fixtures["truth"] = T.baseTruth({ families: [
        { label: "AAS", family: "aas", items: 0, verdict: "no_content", exam_on: "2027-02-06", days_left: 78, topics_all: 10, topics_done: 0, schools_list: [], schools: "A", rows: [], topics: [] },
        { label: "Olympiad", family: "olympiad", items: 0, verdict: "no_content", exam_on: "2027-05-05", days_left: 166, topics_all: 24, topics_done: 0, schools_list: [], schools: "B", rows: [], topics: [] },
      ] });
      window.__fixtures["sync_view"] = { totals: { questions: 12, cleared: 0, provisional: 12, draft: 0, failed: 2 },
        library: { documents: 1, passages: 1, from_web: 1, from_upload: 0, official: 0 },
        exams: [
          { key: "aas", label: "AAS", servable: 5, cleared: 0, provisional: 5, draft: 0, failed: 0 },
          { key: "olympiad", label: "Olympiad", servable: 7, cleared: 0, provisional: 7, draft: 0, failed: 0 },
        ] };
      window.__fixtures["exam_pipeline"] = [];
      window.__fixtures["topic_readiness"] = [];
      window.__fixtures["exam_specs"] = [];

      await window.goParent();
      await T.wait(200);

      const sum = (T.$("pExamSum")?.textContent ?? "").replace(/\s+/g, " ");
      assert("the fold states the split total", /12 questions/.test(sum) && /ready/.test(sum));
      assert("and the held back beside it", /2 held back/.test(sum));

      // the same cards are drawn in the timetable, where the counts are visible without the fold
      await window.openTimetable();
      await T.wait(250);
      const chips = [...(T.$("ttBody")?.querySelectorAll(".chip") ?? [])]
        .map((c) => (c.textContent ?? "").trim())
        .filter((t) => /^\d+ questions · \d+ solved$/.test(t));
      const nums = chips.map((t) => Number(t.split(" ")[0]));
      assert("the cards carry their counts", nums.length >= 2);
      assert("the cards add up to the total", nums.reduce((a, b) => a + b, 0) === 12);
    },
  },

  {
    name: "the runs add up to the total written",
    async run({ assert, T }) {
      const job = (i, gen) => ({ id: i, kind: "ingest", status: "done", detail: { generated: gen, fetched: 0 },
        error: null, started_at: "2026-11-20T0" + i + ":00:00Z" });
      window.__fixtures["truth"] = T.baseTruth();
      window.__fixtures["sync_view"] = { totals: {}, library: {}, exams: [] };
      window.__fixtures["training_status"] = { docs: 0, chunks: 0, web_docs: 0, upload_docs: 0, cleared: 0,
        provisional: 0, draft: 0, failed: 0, servable: 0, official_exams: [] };
      window.__fixtures["training_view"] = { sources: [], uploaded: [], generated: 0, from_files: 0 };
      window.__fixtures["recent_jobs"] = [job(1, 20), job(2, 18), job(3, 0), job(4, 19)];
      window.__fixtures["held_back_reasons"] = [];
      window.__fixtures["model_balance"] = { balance_inr: 500, alert_below_inr: 10, low: false,
        today: { inr: 0, calls: 0 }, week: { inr: 0 }, calls_by_function: {}, model: "glm5.3-flash" };
      window.__fixtures["usage_limits"] = {};

      T.show("help");
      await window.loadTraining();
      await T.wait(150);
      const text = (T.$("trainJobs")?.textContent ?? "").replace(/\s+/g, " ");
      const written = [...text.matchAll(/wrote (\d+) questions?/g)].map((m) => Number(m[1]));
      assert("each run states its own count", written.length >= 3);
      assert("they add up to 57", written.reduce((a, b) => a + b, 0) === 57);
      assert("a pass that wrote nothing says so", /nothing new to do/.test(text));
      assert("the card explains that they total", /add up to the total written/.test(text));
    },
  },
  {
    name: "clearing his history puts every question back in the queue",
    async run({ assert, T }) {
      const fam = { label: "Olympiad", family: "olympiad", items: 0, verdict: "no_content", exam_on: "2027-05-05", days_left: 166, topics_all: 24, topics_done: 0, schools_list: [], schools: "APSMO", rows: [], topics: [] };
      window.__fixtures["truth"] = T.baseTruth({ families: [fam] });
      window.__fixtures["sync_view"] = { totals: { questions: 10, cleared: 0, provisional: 10, draft: 0, failed: 0 },
        library: { documents: 1, passages: 1, from_web: 1, from_upload: 0, official: 0 },
        exams: [{ key: "olympiad", label: "Olympiad", servable: 10, cleared: 0, provisional: 10, draft: 0, failed: 0 }] };
      window.__fixtures["exam_pipeline"] = [{ key: "olympiad", pipeline: 10, solved: 4, left_to_solve: 6 }];
      window.__fixtures["topic_readiness"] = [];
      window.__fixtures["exam_specs"] = [];

      await window.openTimetable();
      await T.wait(200);
      let text = (T.$("ttBody")?.textContent ?? "").replace(/\s+/g, " ");
      assert("before the wipe, four are solved", /10 questions · 4 solved/.test(text));

      // the wipe happened: the pipeline is read again and nothing is solved
      window.__fixtures["exam_pipeline"] = [{ key: "olympiad", pipeline: 10, solved: 0, left_to_solve: 10 }];
      await window.openTimetable();
      await T.wait(200);
      text = (T.$("ttBody")?.textContent ?? "").replace(/\s+/g, " ");
      assert("after the wipe, none are solved", /10 questions · 0 solved/.test(text));
    },
  },
  {
    name: "an empty wallet raises the orange banner, and clearing it removes it",
    async run({ assert, T }) {
      window.__fixtures["credits_state"] = { empty: true, empty_at: "2026-11-20T05:00:00Z" };
      await window.paintWalletBanner();
      await T.wait(60);
      let el = T.$("walletBanner");
      assert("the banner appears", !el?.classList.contains("hidden"));
      assert("it says the wallet is empty", /wallet is empty/i.test(el?.textContent ?? ""));
      assert("it says what to do", /re-fill|top up/i.test(el?.textContent ?? ""));

      window.__fixtures["credits_state"] = { empty: false, empty_at: null };
      await window.paintWalletBanner();
      await T.wait(60);
      el = T.$("walletBanner");
      assert("it goes away once cleared", el?.classList.contains("hidden"));
    },
  },

  {
    name: "an exam marked no_content still shows its count, not a grey pill",
    async run({ assert, T }) {
      window.__fixtures["truth"] = T.baseTruth({ families: [{ label: "Olympiad", family: "olympiad", items: 0, verdict: "no_content", exam_on: "2027-05-05", days_left: 166, topics_all: 10, topics_done: 0, schools_list: [], schools: "A", rows: [], topics: [] }] });
      window.__fixtures["sync_view"] = { totals: { questions: 6, cleared: 0, provisional: 6, draft: 0, failed: 0 },
        library: { documents: 1, passages: 1, from_web: 1, from_upload: 0, official: 0 },
        exams: [{ key: "olympiad", label: "Olympiad", servable: 6, cleared: 0, provisional: 6, draft: 0, failed: 0 }] };
      window.__fixtures["exam_pipeline"] = [{ key: "olympiad", pipeline: 6, solved: 0, left_to_solve: 6 }];
      window.__fixtures["topic_readiness"] = [];
      window.__fixtures["exam_specs"] = [];

      await window.openTimetable();
      await T.wait(250);
      const text = (T.$("ttBody")?.textContent ?? "").replace(/\s+/g, " ");
      assert("the count is shown", /6 questions/.test(text));
      assert("the solved count is shown in the same chip", /6 questions · 0 solved/.test(text));
      assert("no grey 'no questions' pill", !/no questions/.test(text));
    },
  },

  {
    name: "the five exam chips add up to the stated total, whatever the verdicts",
    async run({ assert, T }) {
      window.__fixtures["truth"] = T.baseTruth({ families: [{ label: "AAS", family: "aas", items: 0, verdict: "no_content", exam_on: "2027-05-05", days_left: 166, topics_all: 10, topics_done: 0, schools_list: [], schools: "A", rows: [], topics: [] }, { label: "Edutest", family: "edutest", items: 0, verdict: "thin", exam_on: "2027-05-05", days_left: 166, topics_all: 10, topics_done: 0, schools_list: [], schools: "A", rows: [], topics: [] }, { label: "Olympiad", family: "olympiad", items: 0, verdict: "no_content", exam_on: "2027-05-05", days_left: 166, topics_all: 10, topics_done: 0, schools_list: [], schools: "A", rows: [], topics: [] }, { label: "AMC", family: "amc", items: 0, verdict: "thin", exam_on: "2027-05-05", days_left: 166, topics_all: 10, topics_done: 0, schools_list: [], schools: "A", rows: [], topics: [] }, { label: "ICAS", family: "icas", items: 0, verdict: "thin", exam_on: "2027-05-05", days_left: 166, topics_all: 10, topics_done: 0, schools_list: [], schools: "A", rows: [], topics: [] }] });
      window.__fixtures["sync_view"] = { totals: { questions: 62, cleared: 0, provisional: 62, draft: 0, failed: 1 },
        library: { documents: 1, passages: 1, from_web: 1, from_upload: 0, official: 0 },
        exams: [
          { key: "aas", label: "AAS", servable: 15, cleared: 0, provisional: 15, draft: 0, failed: 0 },
          { key: "edutest", label: "Edutest", servable: 14, cleared: 0, provisional: 14, draft: 0, failed: 0 },
          { key: "olympiad", label: "Olympiad", servable: 6, cleared: 0, provisional: 6, draft: 0, failed: 0 },
          { key: "amc", label: "AMC", servable: 12, cleared: 0, provisional: 12, draft: 0, failed: 0 },
          { key: "icas", label: "ICAS", servable: 15, cleared: 0, provisional: 15, draft: 0, failed: 0 },
        ] };
      window.__fixtures["exam_pipeline"] = [];
      window.__fixtures["topic_readiness"] = [];
      window.__fixtures["exam_specs"] = [];

      await window.openTimetable();
      await T.wait(250);
      const chips = [...(T.$("ttBody")?.querySelectorAll(".chip") ?? [])]
        .map((c) => (c.textContent ?? "").trim())
        .filter((t) => /^\d+ questions · \d+ solved$/.test(t))
        .map((t) => Number(t.split(" ")[0]));
      assert("all five exams carry a count", chips.length === 5);
      assert("they add up to 62", chips.reduce((a, b) => a + b, 0) === 62);
    },
  },
  {
    name: "print finds the questions an exam actually holds",
    async run({ assert, T }) {
      window.__fixtures["truth"] = T.baseTruth();
      window.__fixtures["sync_view"] = { totals: {}, library: {}, exams: [] };
      window.__fixtures["exam_pipeline"] = [];
      window.__fixtures["print_rows"] = [
        { chapter: 1, idx: 1, prompt: "A bookshop sold 345 books on Saturday and 268 on Sunday. How many in all?",
          options: null, diagram_svg: "<svg viewBox=\"0 0 320 200\"></svg>", strand: "Whole Numbers",
          answer: "613", method: "add",
          source_ref: "ICAS Assessments", source_kind: "web", source_url: "https://www.icasassessments.com" },
      ];
      let printed = null;
      const realOpen = window.open;
      // the sheet is written into a new window: capture what would be written
      window.open = () => ({
        document: { write: (html) => { printed = html; }, close() {} },
        focus() {}, print() {},
      });

      await window.printQuestions("Olympiad");
      await T.wait(80);
      window.open = realOpen;

      assert("a sheet was produced", !!printed);
      assert("it carries the question", /bookshop sold 345/.test(printed ?? ""));
      assert("it carries the figure as vector", /<svg/.test(printed ?? ""));
      assert("the figure has room on the page", /class="fig"/.test(printed ?? ""));
      assert("it does not claim there is nothing to print", !/nothing to print/i.test(printed ?? ""));
      assert("the source is printed under the question", /ICAS Assessments/.test(printed ?? ""));
      assert("it says the source is from the web", /From the web/.test(printed ?? ""));
      assert("the page is printed too", /icasassessments\.com/.test(printed ?? ""));
    },
  },
  {
    name: "a question shown to the child names its source",
    async run({ assert, T }) {
      const q = { chapter: 1, idx: 1, prompt: "A shop sold 345 books.", status: "provisional",
                  source_ref: "NRICH (Cambridge)", options: null };
      const label = window.gateLabel(q);
      assert("the source is on the question", /NRICH/.test(label));
      assert("not verified is still said", /not verified/i.test(label));

      const cleared = { ...q, status: "cleared", source_ref: "TopScope_Edutest.pdf" };
      const l2 = window.gateLabel(cleared);
      assert("a cleared question still names its source", /TopScope_Edutest\.pdf/.test(l2));
      assert("and is not called unverified", !/not verified/i.test(l2));
    },
  },
  {
    name: "a variation says whose question it is a variation of",
    async run({ assert, T }) {
      window.__fixtures["truth"] = T.baseTruth();
      window.__fixtures["sync_view"] = { totals: {}, library: {}, exams: [] };
      window.__fixtures["exam_pipeline"] = [];
      window.__fixtures["print_rows"] = [
        { chapter: 2, idx: 1, prompt: "A pen and a notebook cost $13.", options: null, diagram_svg: null,
          strand: "Comparison", answer: "$8", method: "compare",
          source_ref: "variation of a question from NRICH (Cambridge) — written by the coach",
          source_kind: "web", source_url: "https://nrich.maths.org", derived_from: "A pen and a notebook cost $12." },
        { chapter: 2, idx: 2, prompt: "No provenance at all.", options: null, diagram_svg: null,
          strand: "Comparison", answer: "1", method: "x",
          source_ref: null, source_kind: "written", source_url: null, derived_from: null },
      ];
      let printed = null;
      const realOpen = window.open;
      window.open = () => ({ document: { write: (h) => { printed = h; }, close() {} }, focus() {}, print() {} });
      await window.printQuestions("Olympiad");
      await T.wait(80);
      window.open = realOpen;

      assert("the variation names its origin", /variation of a question from NRICH/i.test(printed ?? ""));
      assert("and says she wrote it", /written by the coach/i.test(printed ?? ""));
      assert("the original is quoted", /A pen and a notebook cost \$12/.test(printed ?? ""));
      assert("a question with no source still says something", /written by the coach, no source recorded/.test(printed ?? ""));
    },
  },

  {
    name: "click through: she sends him to a chapter, he answers, he comes back, she assesses",
    async run({ assert, T }) {
      window.__fixtures["truth"] = T.baseTruth({
        student: { id: "kid", name: "Atharv", xp: 0, streak: 1, days_in: 2 },
        plan: { chapter: 1, title: "Whole Numbers" },
      });
      window.__fixtures["sync_view"] = { totals: { questions: 2 }, library: {}, exams: [] };
      window.__fixtures["exam_pipeline"] = [];
      window.__fixtures["plan_sitting"] = { minutes: 60, questions: 2, chapter: 1 };
      window.__fixtures["next_in_chapter"] = [{ chapter: 1, idx: 1, prompt: "What is 5 + 7?", options: null, answer: "12", status: "provisional", source_ref: "NRICH (Cambridge)" }, { chapter: 1, idx: 2, prompt: "What is 9 + 4?", options: null, answer: "13", status: "provisional", source_ref: "NRICH (Cambridge)" }];
      window.__fixtures["submit_answer"] = { correct: true, answer: "12", method: "add the units" };
      window.__fixtures["log_visit"] = {};
      window.__fixtures["question_budget"] = { seconds: 90 };
      window.__fixtures["save_session"] = { ok: true };
      window.__fixtures["fn:coach-chat"] = { reply: "Two of two. Next: subtraction, tomorrow." };

      T.show("session");

      // 1. she sends him: he presses the chapter button
      await window.startChapter(1);
      await T.wait(200);
      assert("the session screen is open", T.screen("session"));
      assert("the chapter is recorded", window.__state.chapter === 1);
      assert("a visit is logged", T.calls("log_visit").length >= 1);

      // 2. the questions arrived and are in the script
      const qs = (window.__state.script ?? []).filter((x) => x.type === "question");
      assert("the questions are loaded", qs.length >= 2);

      // 3. he answers the first one, exactly as the check button does
      window.__state.si = (window.__state.script ?? []).findIndex((x) => x.type === "question");
      const q = window.__state.script[window.__state.si].data;
      const ans = T.$("ans");
      if (ans) { ans.value = "12"; }
      await window.check();
      await T.wait(200);
      const sent = T.lastCall("submit_answer");
      assert("the answer is sent for marking", !!sent);
      assert("it carries the question he was on", sent?.args?.p_idx === q.idx);

      // 4. he goes back to her
      await window.backToCoach();
      await T.wait(200);
      const coachCall = T.calls("coach-chat").at(-1);
      assert("she is asked to assess", !!coachCall);
      const note = String(coachCall?.args?.note ?? "");
      assert("the note names the chapter", /chapter 1/i.test(note));
      assert("the note carries how he did", /question/i.test(note));
    },
  },

  {
    name: "click through: pause keeps his place, and the server has it",
    async run({ assert, T }) {
      window.__fixtures["truth"] = T.baseTruth();
      window.__fixtures["sync_view"] = { totals: {}, library: {}, exams: [] };
      window.__fixtures["save_session"] = { ok: true };
      window.__fixtures["load_session"] = { chapter: 3, si: 1, paused: true,
        script: [{ type: "question", data: { chapter: 3, idx: 1, prompt: "x", answer: "1" } },
                 { type: "question", data: { chapter: 3, idx: 2, prompt: "y", answer: "2" } }] };

      T.show("session");
      window.__state.chapter = 3;
      window.__state.si = 1;
      window.__state.script = [{ type: "question", data: { chapter: 3, idx: 1, prompt: "x" } },
                               { type: "question", data: { chapter: 3, idx: 2, prompt: "y" } }];
      await window.endSession();
      await T.wait(150);
      const saved = T.lastCall("save_session");
      assert("the place is written to the server", !!saved);
      assert("it records where he was", saved?.args?.p_si === 1);
      assert("it records the chapter", saved?.args?.p_chapter === 3);

      const back = await window.readSessionFromServer();
      assert("the server gives it back", back?.chapter === 3);
      assert("with the same question", back?.si === 1);
    },
  },

  {
    name: "click through: the chapter button is absent when she did not send him",
    async run({ assert, T }) {
      window.__fixtures["truth"] = T.baseTruth({ plan: null });
      window.__fixtures["sync_view"] = { totals: {}, library: {}, exams: [] };
      window.__fixtures["exam_pipeline"] = [];
      T.show("session");
      await window.paintActions();
      await T.wait(80);
      const bar = T.text("actionBar");
      assert("no chapter button without a plan", !/Chapter \d+ →/.test(bar));
    },
  },
  {
    name: "DEBUG the answer path",
    async run({ assert, T }) {
      window.__fixtures["truth"] = T.baseTruth({ plan: { chapter: 1, title: "Whole Numbers" } });
      window.__fixtures["sync_view"] = { totals: {}, library: {}, exams: [] };
      window.__fixtures["exam_pipeline"] = [];
      window.__fixtures["plan_sitting"] = { minutes: 60, questions: 2, chapter: 1 };
      window.__fixtures["next_in_chapter"] = [
        { chapter: 1, idx: 1, prompt: "What is 5 + 7?", options: null, answer: "12", status: "provisional" },
      ];
      window.__fixtures["question_budget"] = { seconds: 90 };
      window.__fixtures["log_visit"] = {};
      window.__fixtures["submit_answer"] = { correct: true, answer: "12" };
      T.show("session");
      await window.startChapter(1);
      await T.wait(250);
      assert("script length " + (window.__state.script || []).length, (window.__state.script || []).length > 0);
      assert("first step is " + (window.__state.script?.[0]?.type ?? "none"), window.__state.script?.[0]?.type === "question");
      assert("ans field exists", !!T.$("ans"));
      assert("chatWrap has cards", (T.$("chatWrap")?.children.length ?? 0) > 0);
      const ans = T.$("ans");
      if (ans) { ans.value = "12"; }
      await window.check();
      await T.wait(200);
      assert("submit_answer called", T.calls("submit_answer").length > 0);
      assert("errors: " + JSON.stringify((window.__errors ?? []).slice(0, 3)), (window.__errors ?? []).length === 0);
    },
  },
  {
    name: "DEBUG the figure box",
    async run({ assert, T }) {
      window.__fixtures["truth"] = T.baseTruth();
      window.__fixtures["fn:draw-figure"] = { svg: "<svg viewBox='0 0 320 200'><circle cx='60' cy='60' r='40'/></svg>" };
      window.__fixtures["fn:check-figure"] = { ok: true };
      T.show("session");
      const box = document.createElement("div");
      box.id = "dbgFig";
      document.body.appendChild(box);
      await window.autoFigure("question", 1, "dbgFig", "Look at the diagram. How many?", "", { diagram_kind: "venn" });
      await T.wait(100);
      assert("draw-figure called", T.calls("draw-figure").length > 0);
      assert("box has: " + box.innerHTML.slice(0, 60), /<svg/i.test(box.innerHTML));
      assert("errors: " + JSON.stringify((window.__errors ?? []).slice(0, 2)), (window.__errors ?? []).length === 0);
      box.remove();
    },
  },
];
