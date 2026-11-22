import * as data from "./data.js?v=3.65.0";

const createClient = window.supabase?.createClient;
if (!createClient) {
  document.getElementById("err").textContent =
    "The app could not load its database library. Check the connection and reload.";
}

/* the phone keyboard changes the visible height: follow it, never fight it */
(function trackViewport() {
  const set = () => {
    const h = window.visualViewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty("--vh", (h / 100) + "px");
    const top = document.querySelector(".top") || document.querySelector("header");
    document.documentElement.style.setProperty("--hdr", (top?.offsetHeight ?? 62) + "px");
    const box = document.getElementById("chatWrap") || document.getElementById("pchatWrap");
    if (box) box.scrollTop = box.scrollHeight;
  };
  set();
  window.addEventListener("resize", set);
  window.visualViewport?.addEventListener("resize", set);
  window.visualViewport?.addEventListener("scroll", set);
})();

/* exam dates are checked against the providers' pages on each login */
async function checkExamDates() {
  try {
    const { data: due } = await sb.rpc("date_check_due", { p_hours: 12 });
    if (due) sb.functions.invoke("exam-watch", { body: {} }).catch(() => {});
    await paintDateBanner();
  } catch (_) {}
}

/* an empty wallet stops every model call: say so at the top, in orange */
async function paintWalletBanner() {
  const el = $("walletBanner");
  if (!el) return;
  try {
    const { data } = await sb.rpc("credits_state");
    if (data?.empty) {
      el.className = "";
      el.innerHTML = `<span><b>Sarvam wallet is empty</b> — no credits available, so she cannot read, write or
        answer until it is topped up. Re-fill at sarvam.ai → Settings → Billing, then press the button.</span>
        <button class="mini" data-action="walletRefilled">I have re-filled it</button>`;
      return;
    }
    el.className = "hidden";
  } catch (e) { console.error("wallet check failed:", e); }
}

/* tell her what is hard: one line and one exam, then she teaches, writes and tests it */
async function renderHard() {
  const box = $("hardBox");
  if (!box) return;
  const { data } = await sb.rpc("hard_list", { p_limit: 10 });
  const rows = data ?? [];
  box.innerHTML = `
    <div class="bar" style="gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <select id="hardExam" style="font:inherit;padding:8px;border:1px solid var(--line);border-radius:10px">
        <option value="">which exam…</option>
        <option value="olympiad">Olympiad</option><option value="amc">AMC</option>
        <option value="edutest">Edutest</option><option value="aas">AAS</option><option value="icas">ICAS</option>
      </select>
      <input id="hardWords" placeholder="what kind of question is hard — for example: comparing two fractions"
             style="flex:1;min-width:220px;font:inherit;padding:8px;border:1px solid var(--line);border-radius:10px">
      <button class="mini" data-action="noteDifficulty">Tell her</button>
    </div>
    ${rows.length ? rows.map((r) => `<div style="padding:6px 0;border-bottom:1px solid var(--line)">
      <div class="chipRow">
        <span class="chip blue"><b>${esc(r.exam ?? "no exam")}</b></span>
        <span class="chip ${r.taught ? "green" : "amber"}">${r.taught ? "taught" : "not taught yet"}</span>
        <span class="chip ${r.questions_written ? "green" : "grey"}"><b>${r.questions_written ?? 0}</b> written</span>
        <span class="chip ${r.tested_in_mock ? "green" : "grey"}">${r.tested_in_mock ? "in a mock" : "not tested"}</span>
        <span class="sub">said by ${esc(r.said_by)}</span>
      </div>
      <div class="sub" style="margin-top:4px">“${esc(r.words)}”</div>
    </div>`).join("") : `<div class="sub">Nothing yet. Tell her what is hard and she will teach it, write it, then test it.</div>`}`;
}

/* every question she set aside, with the reason and the two ways out */
async function renderAmbiguous() {
  const box = $("ambiguousBox");
  if (!box) return;
  const { data, error } = await sb.rpc("ambiguous_questions", { p_limit: 20 });
  if (error) { box.innerHTML = `<div class="sub">Could not load them: ${esc(error.message)}</div>`; return; }
  const rows = data ?? [];
  if (!rows.length) {
    box.innerHTML = `<div class="chipRow"><span class="chip green"><b>0</b> ambiguous</span>
      <span class="sub" style="margin-left:6px">nothing is waiting for you</span></div>`;
    return;
  }
  box.innerHTML = `<div class="chipRow" style="margin-bottom:8px">
      <span class="chip red"><b>${rows.length}</b> ambiguous</span>
      <span class="sub" style="margin-left:6px">held back, never shown to him</span>
    </div>` + rows.map((r) => `
    <div style="padding:8px 0;border-bottom:1px solid var(--line)">
      <div class="sub" style="font-size:13px">${esc(r.prompt)}</div>
      <div class="sub" style="margin-top:4px;opacity:.8">Why: ${esc(String(r.why).slice(0, 180))}</div>
      <div class="sub" style="margin-top:2px;opacity:.7">${esc(r.exam)} · ${esc(r.strand)} · from ${esc(r.source_ref)}</div>
      <div class="bar" style="margin-top:6px">
        <button class="mini" data-action="fixAmbiguous" data-a0="${r.chapter}" data-a1="${r.idx}"
          title="She rewrites it, then it is checked again before he ever sees it.">Ask her to fix it</button>
        <button class="ghost small" style="border-color:#f2c9c9;color:#b8383d" data-action="dropAmbiguous"
          data-a0="${r.chapter}" data-a1="${r.idx}" title="Removes it for good.">Drop it</button>
      </div>
    </div>`).join("");
}

/* the powers he has earned, named from the epics, and the next one within reach */
function paintPowers() {
  const box = $("powerBar");
  if (!box) return;
  const a = S.TR?.attempts ?? {};
  const acc = Number(a.accuracy_7 ?? 0), done = Number(a.last_7 ?? 0), streak = Number(S.TR?.student?.streak ?? 0);
  const powers = [
    { name: "Vajra", epic: "Indra's thunderbolt", got: acc >= 80 && done >= 20, hint: "80% right over 20 questions" },
    { name: "Gandiva", epic: "Arjuna's bow", got: acc >= 90 && done >= 30, hint: "90% right over 30 questions" },
    { name: "Hanuman's leap", epic: "the leap to Lanka", got: streak >= 7, hint: "seven days in a row" },
    { name: "Ekalavya", epic: "focus without help", got: Number(a.solo ?? 0) >= 10, hint: "ten questions finished alone" },
  ];
  const earned = powers.filter((p) => p.got);
  const next = powers.find((p) => !p.got);
  box.innerHTML = `<div class="chipRow">
    ${earned.length
      ? earned.map((p) => `<span class="chip green" title="${esc(p.epic)}"><b>${esc(p.name)}</b></span>`).join("")
      : `<span class="chip grey" title="Earned by doing the work, not by asking">no powers yet</span>`}
    ${next ? `<span class="chip amber" title="${esc(next.epic)} — ${esc(next.hint)}"><b>${esc(next.name)}</b> next</span>` : ""}
  </div>`;
}

/* what the scan is doing right now, at the top of the screen for both of them */
let scanTimer = null;
async function paintScanBanner() {
  const el = $("scanBanner");
  if (!el) return;
  if (!S.isParent) { el.className = "hidden"; return; }
  try {
    const { data: papers } = await sb.rpc("papers_to_read");
    const rows = papers ?? [];

    // a paper still being read comes first: it is the thing a parent is waiting on
    const reading = rows.filter((x) => (x.pages_total ?? 0) > 0 && (x.pages_done ?? 0) < (x.pages_total ?? 0));

    if (reading.length) {
      const one = reading[0];
      const total = one.pages_total ?? 0, done = one.pages_done ?? 0;
      const ticks = Array.from({ length: total }, (_, i) =>
        `<i class="${i < done ? "on" : i === done ? "now" : ""}"></i>`).join("");
      el.className = "";
      const waiting = total - done;
      el.innerHTML = `<div class="scanBar">
        <span class="fileDot reading"></span>
        <span class="scanState">Reading</span>
        <span class="scanName">${esc(one.title)}</span>
        <span class="filePages">${done} of ${total} pages</span>
        <span class="scanFacts">${waiting} to go · ${one.questions ?? 0} questions${one.diagrams ? ` · ${one.diagrams} figures` : ""}</span>
      </div>
      <div class="ticks" style="margin-top:8px">${ticks}</div>`;
      clearTimeout(scanTimer);
      scanTimer = setTimeout(paintScanBanner, 5000);
      return;
    }

    if (rows.length) {
      const q = rows.reduce((a, x) => a + Number(x.questions ?? 0), 0);
      el.className = "";
      el.innerHTML = `<div class="scanBar">
        <span class="fileDot read"></span>
        <span class="scanState">Read</span>
        <span class="scanName">${rows.length} file${rows.length === 1 ? "" : "s"}</span>
        <span class="scanFacts">${q} questions in the bank</span>
        <button class="link" data-action="dismissScanBanner">OK</button>
      </div>`;
      return;
    }

    const { data: counts } = await sb.rpc("question_status_counts");
    const c = counts ?? {};
    const toCheck = Number(c.draft ?? 0), unverified = Number(c.provisional ?? 0);
    const verified = Number(c.cleared ?? 0), held = Number(c.failed ?? 0);
    if (toCheck === 0 && unverified === 0 && verified > 0) {
      el.className = "";
      el.innerHTML = `<div class="scanBar"><span class="fileDot read"></span>
        <span class="scanState">Checked</span>
        <span class="scanName">nothing waiting</span>
        <span class="scanFacts">${verified} verified${held ? ` · ${held} held back` : ""}</span></div>`;
      return;
    }
    el.className = "";
    el.innerHTML = `<div class="scanBar"><span class="fileDot ${toCheck ? "reading" : "read"}"></span>
      <span class="scanState">${toCheck ? "Checking" : "Idle"}</span>
      <span class="scanName">${toCheck ? toCheck + " questions to check" : "everything read"}</span>
      <span class="scanFacts">${verified} verified · ${unverified} unchecked${held ? ` · ${held} held` : ""}</span></div>`;
  } catch (_) {
    el.className = "hidden";
  }
}

/* a background run that failed must be visible, not buried in Help */
async function paintJobBanner() {
  try {
    const { data } = await sb.rpc("recent_jobs", { p_limit: 1 });
    const j = data?.[0];
    const el = $("dateBanner");
    if (!j || j.status !== "failed" || !el) return;
    el.className = "";
    el.innerHTML = `<span><b>A background run failed</b> — ${esc(String(j.kind).replace("train:", ""))}:
      ${esc(String(j.error ?? "no reason given").slice(0, 140))}. Open Help to see it and run it again.</span>
      <button class="mini" data-action="dismissJobBanner">Got it</button>`;
  } catch (_) {}
}

async function paintDateBanner() {
  const box = $("dateBanner");
  if (!box) return;
  const { data } = await sb.rpc("pending_alerts");
  const rows = data ?? [];
  if (!rows.length) { box.classList.add("hidden"); return; }

  const KIND = { date: "Date", format: "Format", timing: "Timing", topics: "Topics", news: "News" };
  const one = (a) => `<b>${esc(KIND[a.kind] ?? a.kind)}</b> · ${esc(a.exam ?? "")}: ${esc(a.summary)}
    ${a.source ? `<span class="sub" style="opacity:.75"> — ${esc(String(a.source).replace(/^https?:\/\//, "").slice(0, 48))}</span>` : ""}`;

  box.classList.remove("hidden");
  box.innerHTML = `<span>An update about these exams, from the providers' own pages. Confirm anything that matters with the school.</span>
    <ul>${rows.map((a) => `<li>${one(a)}</li>`).join("")}</ul>
    <button class="dBtn" data-action="dismissDateBanner">Got it</button>`;
}

async function dismissDateBanner() {
  $("dateBanner")?.classList.add("hidden");
  try { await sb.rpc("dismiss_alerts"); await sb.rpc("dismiss_date_changes"); } catch (_) {}
}

window.addEventListener("error", (e) => {
  const box = document.getElementById("err");
  if (box && !box.textContent) box.textContent = "Something broke: " + (e.message || "unknown error");
});
window.addEventListener("unhandledrejection", (e) => {
  const box = document.getElementById("err");
  if (box && !box.textContent) box.textContent = "Something broke: " + (e.reason?.message || e.reason || "unknown");
});

const REMEMBER_KEY = "quest.remember";
const LAST_KEY = "quest.lastUser";        // email or short name, filled in for him
const NAMES_KEY = "quest.names";          // { shortname: email } for this device

function readNames() {
  try { return JSON.parse(localStorage.getItem(NAMES_KEY) || "{}"); } catch (_) { return {}; }
}

function rememberUser(typed) {
  try {
    const whole = String(typed ?? "").trim();
    if (!whole) return;
    localStorage.setItem(LAST_KEY, whole);          // exactly what he typed
    const names = readNames();
    const short = whole.split("@")[0].split(".")[0].toLowerCase();
    if (short && !names[short]) { names[short] = whole; localStorage.setItem(NAMES_KEY, JSON.stringify(names)); }
  } catch (_) {}
}

const remember = localStorage.getItem(REMEMBER_KEY) !== "0";
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: remember, autoRefreshToken: remember, detectSessionInUrl: true },
});
data.setClient(sb);
window.data = data;
const $ = (id) => document.getElementById(id);

/* ---------------------------------------------------------------------------
   Actions: markup names an action, this table says what it does.
   No inline handlers, no functions on window for the markup to reach.
--------------------------------------------------------------------------- */
const ACTIONS = {};

export function registerActions(map) {
  Object.assign(ACTIONS, map);
}

window.__actions = ACTIONS;   // read-only view for the checks

function runAction(el) {
  const name = el.dataset.action;
  if (!name) return;
  const fn = ACTIONS[name];
  if (!fn) { console.warn("no action registered for", name); return; }
  try { fn(el); } catch (e) { console.warn("action failed:", name, e?.message ?? e); }
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (el) { e.preventDefault(); runAction(el); }
});

const TITLES = ["Apprentice", "Explorer", "Challenger", "Olympian", "Grandmaster"];
const COACH = "Ananya";   // her name, in one place
const APP_VERSION = "3.65.0";   // bumped on every push; shown at the foot of the page

window.__sb = sb;

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const SESSION_KEY = "quest.session";
const ROUTE_KEY = "quest.route";

function saveSession() {
  if (!S.script || !S.script.length) return;
  // the server keeps the real place: a lost tab or a different device still resumes correctly
  sb.rpc("save_session", {
    p_chapter: S.chapter, p_si: S.si, p_script: S.script,
    p_started: S.startedAt ? new Date(S.startedAt).toISOString() : null,
    p_paused: !!S.paused,
  }).catch(() => {});
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      at: Date.now(), chapter: S.chapter, workMode: S.workMode, si: S.si,
      script: S.script, chat: S.chat.slice(-40), track: S.track,
      done: S.si >= S.script.length,
    }));
  } catch (_) {}
}

function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch (_) {}
  sb.rpc("clear_session").catch(() => {});
}

/* the server copy of where he is, used when this device has never seen the session */
async function readSessionFromServer() {
  try {
    const { data } = await sb.rpc("load_session");
    if (!data || !data.script || !(data.script ?? []).length) return null;
    return { at: Date.now(), chapter: data.chapter, si: data.si, script: data.script,
             paused: data.paused, done: (data.si ?? 0) >= (data.script ?? []).length };
  } catch (_) { return null; }
}

function readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (_) { return null; }
}

/* He picks up where he left off, even the next day. A session is only dropped
   when the topic is finished or when a new chapter starts. */
function restorableSession() {
  const st = readSession();
  if (!st || !st.script?.length) return null;
  const age = Date.now() - (st.at ?? 0);
  if (st.done && age > 24 * 60 * 60 * 1000) return null;   // finished: keep a day, then let go
  return st;
}

function saveRoute() {
  try {
    localStorage.setItem(ROUTE_KEY, JSON.stringify({
      view: S.view, track: S.track, shelf: S.shelf, chapter: S.chapter,
    }));
  } catch (_) {}
}

/* reading progress, visible from any screen */
function paintTopProgress(done, total, label) {
  const wrap = $("topProg"), bar = $("topProgBar"), txt = $("topProgText");
  if (!wrap) return;
  if (!total) { wrap.classList.add("hidden"); return; }
  wrap.classList.remove("hidden");
  const pct = Math.max(4, Math.min(100, Math.round((done / total) * 100)));
  bar.style.width = pct + "%";
  txt.textContent = label ?? `Reading ${done} of ${total}`;
}

/* watch the reading, wherever he is in the app */
let jobWatch = null;
async function checkRunningJob() {
  const { data } = await sb.rpc("parse_progress");
  const job = data ?? null;
  if (!job) { paintTopProgress(0, 0); return; }

  if (job.status === "running" || (job.remaining ?? 0) > 0) {
    const total = job.pages_total || 1;
    paintTopProgress(job.pages_done ?? 0, total,
      total > 1 ? `Reading ${job.pages_done ?? 0} of ${total}` : "Reading…");
    startJobWatch();
    return;
  }

  if ((job.remaining ?? 0) > 0) {
    paintTopProgress(job.pages_done ?? 0, job.pages_total || 1,
      `Reading ${job.pages_done ?? 0} of ${job.pages_total ?? 1} — paused`);
    runServerQueue();
    return;
  }

  paintTopProgress(1, 1, job.status === "failed" ? "Reading failed" : "Reading done");
  setTimeout(() => paintTopProgress(0, 0), 6000);
  stopJobWatch();
  paintNote();
}

function startJobWatch() {
  if (jobWatch) return;
  jobWatch = setInterval(checkRunningJob, 2500);
}

function stopJobWatch() {
  if (jobWatch) { clearInterval(jobWatch); jobWatch = null; }
}

/* a note that follows him across screens */
async function paintNote() {
  const bar = $("noteBar");
  if (!bar) return;
  const { data } = await sb.rpc("parse_note");
  if (!data) { bar.innerHTML = ""; return; }
  const retry = "";
  bar.innerHTML = `<div class="card" style="padding:12px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <div style="flex:1 1 240px"><b>${esc(data.note)}</b></div>
      ${retry}
      <button class="link" data-action="dismissNote" data-a0="${data.id}">OK</button>
    </div>`;

  // a parent keeps it until they say so; a child's screen lets it go after three minutes
  if (!S.isParent) setTimeout(() => { if ($("noteBar")?.textContent) dismissNote(data.id); }, 180000);
  checkExamDates();
  paintPowers();
  paintWalletBanner();
  paintScanBanner();
  paintJobBanner();
  autoTrain();
}

async function dismissNote(id) {
  await sb.rpc("dismiss_parse_note", { p_id: id });
  $("noteBar").innerHTML = "";
}

/* the plan, per exam and per topic, and whether he is ahead of it */
async function openTimetable() {
  // the timetable shows counts, so it re-reads the shared view rather than trusting an old copy
  await loadSync();
  show("timetable");
  const box = $("ttBody");
  box.innerHTML = `<div class="card"><div class="sub">Working out where you are…</div></div>`;
  const { data: trTT } = await sb.rpc("truth");
  const specs = trTT?.specs ?? [];
  const specFor = {};
  (specs ?? []).forEach((x) => { (specFor[x.family] = specFor[x.family] ?? []).push(x); });

  const data = (trTT?.families ?? []).map((f) => ({
    label: f.label, exam_on: f.exam_on, days_left: f.days_left,
    topics_all: f.topics_all, topics_done: f.topics_done, topics_started: f.topics_started,
    behind: f.behind ?? 0, due_by_now: f.due_by_now ?? 0, rows: f.rows ?? [],
  }));
  const error = null;
  if (error) { box.innerHTML = `<div class="card"><div class="sub">${esc(error.message)}</div></div>`; return; }
  const rows = data ?? [];
  if (!rows.length) { box.innerHTML = `<div class="card"><div class="sub">Nothing planned yet.</div></div>`; return; }

  const colour = (st) => st === "done" ? "green" : st === "behind" ? "red"
    : st === "due" ? "amber" : st === "no_date" ? "grey" : "green";

  // which bank answers for which section of the paper
  const SOURCE_SECTION = {
    edutest: "Numerical reasoning",
    elms: "Mathematics",
    aas: "Mathematics",
    icas: "Whole paper",
    amc: "Whole paper",
    book: "Each contest",
    apsmo: "Each contest",
  };

  const topicRow = (t) => `
    <div class="ttRow">
      <span class="dot ${t.preparedness >= 60 ? "green" : t.preparedness > 0 ? "amber" : "grey"}"></span>
      <span class="ttTopic">${esc(String(t.title).split(" · ").pop())}
        <span class="sub">${t.questions ? `${t.questions} questions` : "no questions yet"}</span></span>
      <span class="ttTarget">${t.target_on
        ? new Date(t.target_on).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "—"}</span>
      <span class="bar2" style="width:80px"><i style="width:${t.preparedness}%"></i></span>
    </div>`;

  box.innerHTML = rows.map((x) => {
    const done = x.topics_done ?? 0, all = x.topics_all ?? 0, behind = x.behind ?? 0;
    const due = x.due_by_now ?? 0;
    const verdict = behind > 0 ? `${behind} behind` : done >= due && due > 0 ? "on track" : done > due ? "ahead" : "not started";
    const vcls = behind > 0 ? "red" : done > due ? "green" : due > 0 ? "amber" : "grey";
    const pct = all ? Math.round((done / all) * 100) : 0;
    const examWhen = x.exam_on
      ? new Date(x.exam_on).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
      : "no date";

    const key = String(x.family ?? x.label).toLowerCase();
    const cRow = (S.examCounts ?? []).find((r) => String(r.exam).toLowerCase() === key) ?? {};
    const fallbackX = syncCount(key, "servable") >= 0 ? syncCount(key, "servable") : (x.items ?? 0);
    const examCount = Number(cRow.total ?? fallbackX);   // the whole exam, not just what is servable
    const examReady = Number(cRow.ready ?? fallbackX);
    const pipe = (S.pipeline ?? []).find((p) => String(p.key).toLowerCase() === key) ?? {};
    const solvedCount = Number(cRow.attempted ?? 0);
    const left = Math.max(0, examCount - solvedCount);
    const solved = Number(pipe.solved ?? 0);

    // green: a healthy queue of unsolved questions. amber: thinning. orange: nothing left to practise on.
    const examTone = left === 0 ? "orange" : left < 30 ? "amber" : "green";
    const examTip = left === 0
      ? `${examCount} in the pipeline, all ${solved} solved — nothing left to practise on. She writes more from what she reads, or you upload a paper.`
      : left < 30
        ? `${examCount} in the pipeline · ${solved} solved · ${left} left to solve. Enough for now; it thins as he works through them.`
        : `${examCount} in the pipeline · ${solved} solved · ${left} left to solve. A healthy queue.`;

    const mine = specFor[x.label] ?? [];
    const topics = x.rows ?? [];

    // a school folds away; inside it, one line per section with everything about that section
    const paper = mine.map((y, yi) => {
      const sits = y.sits ?? x.label;
      const sections = (y.sections ?? []).map((sec) => {
        const isFirst = (y.sections ?? [])[0]?.part === sec.part;
        let own = topics.filter((t) => (SOURCE_SECTION[t.source] ?? "Whole paper") === sec.part);
        if (!own.length && isFirst) {
          const claimed = new Set((y.sections ?? []).map((z) => z.part));
          own = topics.filter((t) => !claimed.has(SOURCE_SECTION[t.source] ?? "Whole paper"));
        }
        const syncedChild = syncCount(String(own[0]?.source ?? "").toLowerCase(), "servable");
        const loaded = syncedChild >= 0 ? syncedChild : own.reduce((a, t) => a + (t.questions ?? 0), 0);
        const ready = own.filter((t) => (t.preparedness ?? 0) >= 60).length;
        const names = own.map((t) => String(t.title).split(" · ").pop());
        const shown = names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3} more` : "");
        const pctSec = own.length ? Math.round(own.reduce((a, t) => a + (t.preparedness ?? 0), 0) / own.length) : 0;
        const official = sec.topics ?? [];
        return `<div class="secBlock">
          <div class="secLine">
            <span class="secName">${esc(sec.part)}</span>
            <span class="secMin">${sec.minutes} min</span>
            <span class="secQ">${loaded ? `${loaded} q` : "no questions"}</span>
            <span class="secTopics" title="${esc(names.join(", "))}">${own.length ? `${ready}/${own.length} ready · ${esc(shown)}` : ""}</span>
            <span class="bar2 secBar"><i style="width:${pctSec}%"></i></span>
          </div>
          ${official.length ? `<div class="secChips">${official.map((t) =>
            `<span class="chip">${esc(t)}</span>`).join("")}</div>` : ""}
        </div>`;
      }).join("");

      return `<details class="ttMore">
        <summary>${esc(sits)} — ${y.minutes} min in the exam</summary>
        <div class="ttFormat">
          <b>${esc(y.timing ?? "")}</b>${y.breaks ? ` · ${esc(y.breaks)}` : ""}
          ${y.note ? `<div class="sub" style="margin-top:2px">${esc(y.note)}</div>` : ""}
        </div>
        <div class="secList">${sections}</div>
      </details>`;
    }).join("");


    return `<div class="card ttExam">
      <div class="ttHead">
        <span class="ttName">${esc(x.label)}</span>
        <span class="chip ${toneForCount(left)}"
              title="${examCount} questions · ${solvedCount} attempted · ${left} not attempted yet. ${left === 0 ? "Nothing left to practise on." : left < 30 ? "Thinning: under 30 unsolved." : "A healthy queue."}">
          <b>${examCount}</b> questions · <b>${examReady}</b> ready</span>
        <span class="chip grey" title="${esc(x.label)} sits on ${esc(examWhen)}"><b>${x.days_left ?? 0}</b> days</span>
        <span class="ttMeta" style="margin-left:auto">${done} of ${all} topics</span>
      </div>
      <div class="bar2" style="margin:8px 0 4px"><i style="width:${pct}%"></i></div>
      ${mine.length ? paper : `<details class="ttMore"><summary>the topics</summary>
        <div style="margin-top:6px">${topics.map(topicRow).join("")}</div></details>`}
    </div>`;
  }).join("");
}

async function loadTraining() {
  // Help shows counts, so it re-reads the shared view rather than trusting an older copy
  await loadSync();
  const { data } = await sb.rpc("training_view");
  const v = data ?? {};
  const list = $("trainList"), ups = $("trainUploads");
  if (!list) return;

  const KIND = { official: "Official", popular: "Popular", uploaded: "Uploaded" };
  const rows = v.sources ?? [];
  const when = (d) => {
    if (!d) return "never read";
    const days = Math.round((Date.now() - new Date(d)) / 86400000);
    return days <= 0 ? "read today" : days === 1 ? "read yesterday" : `read ${days} days ago`;
  };
  list.innerHTML = rows.length ? rows.map((x) => `
    <div class="srcRow">
      <span class="dot ${x.passages ? "green" : x.active ? "amber" : "grey"}"></span>
      <span class="srcName">${esc(x.name)}
        <span class="sub" style="display:block">${esc(KIND[x.kind] ?? x.kind)}${x.url ? ` · ${esc(String(x.url).replace(/^https?:\/\//, ""))}` : ""}</span></span>
      <span class="srcWhen">${x.found_by === "coach" ? `<span class="chip" style="font-size:10.5px">found by her</span> ` : ""}${x.passages ? `${x.passages} passages · ${when(x.last_read)}` : when(x.last_read)}</span>
      ${S.isParent ? `<button class="mini" data-id="${x.id}" data-on="${x.active ? "1" : ""}"
          data-action="toggleTrainingSource" data-id="${x.id}" data-on="${x.active ? "1" : ""}">${x.active ? "Pause" : "Resume"}</button>` : ""}
    </div>`).join("") : `<div class="sub">No sources yet.</div>`;

  ups.innerHTML = "";   // the Question bank lists the files; Help does not repeat them

  $("trainAdd").style.display = S.isParent ? "" : "none";

  const { data: st } = await sb.rpc("training_status");
  const k = st ?? {};
  // what the model has cost, in rupees, and what is left
  try {
    const { data: bal } = await sb.rpc("model_balance");
    const { data: limits } = await sb.rpc("usage_limits");
    S.limits = limits ?? {};
    if (bal && $("spendCard")) {
      const rupee = (n) => "₹" + Number(n ?? 0).toFixed(2);
      const perFn = Object.entries(bal.calls_by_function ?? {})
        .map(([k, v]) => `${esc(k)} ${v}`).join(" · ") || "no calls today";
      $("spendCard").innerHTML = `
        <div class="chipRow">
          <span class="chip ${Number(bal.balance_inr) > 0 ? "green" : "orange"}"
                title="Your Sarvam balance as you last entered it. Sarvam has no balance API, so this figure is yours to set.">
            <b>${rupee(bal.balance_inr)}</b> balance</span>
          <span class="chip blue" title="What the model has cost today, from the token counts the API returns.">
            <b>${rupee(bal.today?.inr)}</b> today</span>
          <span class="chip grey" title="The last seven days."><b>${rupee(bal.week?.inr)}</b> this week</span>
          <span class="chip grey" title="Calls made today."><b>${bal.today?.calls ?? 0}</b> calls</span>
        </div>
        <details style="margin-top:8px"><summary style="list-style:none;cursor:pointer">
          <span class="chip grey">how this is worked out</span></summary>
          <div class="sub" style="margin-top:8px">Sarvam publishes no balance endpoint, so this app cannot read your
            wallet — only your dashboard can. What it can do is count: every call records the tokens the API reports,
            and the cost is those tokens at Sarvam's published rate for ${esc(bal.model)} — ₹13.50 per million sent,
            ₹45 per million received. Today by task: ${perFn}.</div>
          <div class="sub" style="margin-top:6px">If Sarvam answers a call with "no credits available", that is recorded
            and shown as an alert, because it is the one balance signal the API gives.</div>
          <div class="sub" style="margin-top:6px">Enter the balance from your dashboard so the low-balance alert can work.</div>
          <div class="bar" style="margin-top:8px">
            <input id="balIn" type="number" step="1" min="0" placeholder="Balance ₹ from your dashboard" style="width:200px">
            <button class="mini" data-action="saveBalance">Update balance</button>
          </div>
          <div class="k" style="margin-top:12px;margin-bottom:4px">Limits</div>
          <div class="bar" style="gap:8px;flex-wrap:wrap">
            <label class="sub">Calls a day <input id="capCalls" type="number" min="0" step="10"
              value="${esc(String(S.limits?.daily_call_cap ?? 400))}" style="width:90px"></label>
            <label class="sub">₹ a day <input id="capSpend" type="number" min="0" step="1"
              value="${esc(String(S.limits?.daily_spend_cap_inr ?? 20))}" style="width:80px"></label>
            <label class="sub">Alert at % of a day <input id="capPct" type="number" min="1" max="100" step="5"
              value="${esc(String(S.limits?.alert_at_percent ?? 80))}" style="width:80px"></label>
            <label class="sub">Alert below ₹ <input id="capBelow" type="number" min="0" step="1"
              value="${esc(String(S.limits?.alert_below_inr ?? 10))}" style="width:80px"></label>
            <button class="mini" data-action="saveLimits">Save limits</button>
          </div>
          <div class="sub" style="margin-top:6px">Used today: ${bal.today?.calls ?? 0} of
            ${esc(String(S.limits?.daily_call_cap ?? 400))} calls · ${rupee(bal.today?.inr)} of
            ${rupee(S.limits?.daily_spend_cap_inr ?? 20)}. Calls stop when either cap is reached.</div>
        </details>`;
    }
    if (bal?.low) {
      const el = $("dateBanner");
      if (el) {
        el.className = "";
        el.innerHTML = `<span><b>Model credit is low</b> — ₹${Number(bal.balance_inr ?? 0).toFixed(2)} left,
          below your ₹${Number(bal.alert_below_inr ?? 10).toFixed(0)} alert. Top up at sarvam.ai and update the
          balance in Help.</span><button class="mini" data-action="dismissJobBanner">Got it</button>`;
      }
    }
  } catch (_) {}

  try { const { data: hb } = await sb.rpc("held_back_reasons"); S.heldBack = hb ?? []; }
  catch (e) { console.error("held back reasons failed:", e); S.heldBack = []; }

  const { data: jobs } = await sb.rpc("recent_jobs", { p_limit: 5 });
  const jobLine = (jobs ?? []).map((j) => {
    const when = new Date(j.started_at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    const d = j.detail ?? {};
    const tone = j.status === "failed" ? "#d64545" : j.status === "running" ? "#e6a817" : "#1f9d55";
    const gen = d.generated ?? d.train?.generated ?? 0;
    const fetched = d.fetched ?? d.train?.fetched ?? 0;
    const parts = [];
    if (gen > 0) parts.push(`wrote ${gen} question${gen === 1 ? "" : "s"}`);
    if (fetched > 0) parts.push(`read ${fetched} new source${fetched === 1 ? "" : "s"}`);
    if (!fetched && gen > 0) parts.push("nothing new to read");
    if (!gen && !fetched) parts.push("nothing new to do");
    const what = j.status === "failed"
      ? esc(String(j.error ?? "stopped without finishing").slice(0, 70))
      : esc(parts.join(" · "));
    return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--line)">
      <span style="width:8px;height:8px;border-radius:50%;background:${tone};flex:none"></span>
      <span class="sub" style="min-width:96px">${esc(when)}</span>
      <span class="sub" style="flex:1">${esc(String(j.kind).replace("train:", ""))}</span>
      <span class="sub">${what}</span></div>`;
  }).join("");
  $("trainJobs").innerHTML = "";   // no run log: the bar below is the status

  // the same shape of card everywhere: a heading, then chips, then one bar
  const chip = (n, label, tone, tip) =>
    `<span class="chip ${tone}" title="${esc(tip ?? `${n} ${label}`)}"><b>${n}</b> ${esc(label)}</span>`;
  const servable = Number(S.sync?.totals?.questions ?? k.servable ?? 0);
  const cleared = Number(k.cleared ?? 0), prov = Number(k.provisional ?? 0);
  const draft = Number(k.draft ?? 0), failed = Number(k.failed ?? 0);
  const total = Math.max(1, cleared + prov + draft + failed);
  const pct = (n) => Math.round((n / total) * 100);

  // from where, and how far the checking has got — nothing else
  const fromFiles = Number(k.upload_questions ?? 0);
  const fromWeb = Math.max(0, Number(k.bank ?? servable + failed + draft) - fromFiles);
  const checked = cleared + prov + failed;
  const written = Math.max(1, checked + draft);
  const donePct = Math.round((checked / written) * 100);
  const leftToCheck = draft;
  const minutes = Math.ceil(leftToCheck / 3);   // the checker takes about three a minute

  $("trainStore").innerHTML = `
    <div class="chipRow">
      <span class="chip grey"><b>${fromFiles}</b> from your files</span>
      <span class="chip grey"><b>${fromWeb}</b> from the web</span>
    </div>

    <div class="k" style="margin:14px 0 6px">${written} questions</div>
    <div style="display:flex;height:8px;border-radius:999px;overflow:hidden;background:#EEF1F5">
      <div style="width:${Math.round(cleared / written * 100)}%;background:#00796B"></div>
      <div style="width:${Math.round(prov / written * 100)}%;background:#8FBFB6"></div>
      <div style="width:${Math.round(failed / written * 100)}%;background:#D81B60"></div>
      <div style="width:${Math.round(draft / written * 100)}%;background:#E8A317"></div>
    </div>
    <div class="chipRow" style="margin-top:8px">
      <span class="chip ${cleared ? "green" : "grey"}"><b>${cleared}</b> verified</span>
      <span class="chip grey"><b>${prov}</b> usable</span>
      <span class="chip ${failed ? "red" : "grey"}"><b>${failed}</b> held back</span>
      ${draft ? `<span class="chip amber"><b>${draft}</b> waiting</span>` : ""}
    </div>
    <div class="sub" style="margin-top:8px">${draft
      ? `Checking the ${draft} still waiting — about ${minutes} minute${minutes === 1 ? "" : "s"}.`
      : cleared < prov
        ? `Verified needs official material for that exam. Only ${(k.official_exams ?? []).length
            ? (k.official_exams ?? []).join(", ") : "no exam"} has any and it has not been read yet, so
            ${prov} questions passed their check but nothing confirms them.`
        : "Everything written has been checked and confirmed where material exists."}</div>`;
}

/* read the sources, keep your uploads, and check the bank */
/* she reads the sources on her own once a day, in the background, so nobody waits */
/* hand the work to the server, then nudge the worker. The request runs to completion
   even if this tab closes, so a half-finished job is no longer possible. */
async function enqueue(kind, payload) {
  try {
    await sb.rpc("enqueue_job", { p_kind: kind, p_payload: payload ?? {} });
    sb.functions.invoke("run-jobs", { body: {} }).catch(() => {});
  } catch (_) {}
}

async function autoTrain() {
  try {
    const { data: due } = await sb.rpc("train_due", { p_hours: 24 });
    if (!due) return;
    await enqueue("ingest");
    setTimeout(() => { if ($("trainList")) loadTraining(); }, 4000);
  } catch (_) {}
}

async function trainNow() {
  $("trainMsg").textContent = "Queued — reading your uploads, the sources, then the bank. This runs on the server, so you can leave this screen.";
  await enqueue("ingest");
  setTimeout(() => { $("trainMsg").textContent = "Running on the server — open Help again in a minute to see the result."; loadTraining(); }, 3000);
  return;
  const { data, error } = await sb.functions.invoke("train-coach", { body: { mode: "all" } });
  if (error) { $("trainMsg").textContent = "Could not train: " + error.message; return; }

  const f = data?.fetched ?? 0, u = data?.uploads ?? 0, v = data?.checked ?? 0;
  const bad = (data?.failed ?? []).length;
  const made = data?.generated ?? 0;
  $("trainMsg").textContent = `Done — kept ${u} upload${u === 1 ? "" : "s"}, read ${f} source${f === 1 ? "" : "s"}, wrote ${made} question${made === 1 ? "" : "s"}` +
    (v ? `, checked ${v} question${v === 1 ? "" : "s"}${bad ? `, held back ${bad}` : ""}.`
       : ", and there were no questions in the bank to check.");
  loadTraining();
}

/* she looks for more places to read, and only what answers is kept */
async function findSources() {
  $("trainMsg").textContent = "Looking for new sources… this takes a minute.";
  const { data, error } = await sb.functions.invoke("train-coach", { body: { mode: "discover" } });
  if (error) { $("trainMsg").textContent = "Could not look: " + error.message; return; }

  const added = data?.added ?? [];
  const proposed = data?.proposed ?? 0;
  $("trainMsg").textContent = added.length
    ? `Added ${added.length} of ${proposed} she suggested: ${added.map((a) => a.name).join(", ")}. They will be read on the next train.`
    : proposed
      ? `She suggested ${proposed}, but none answered or none were maths pages, so nothing was added.`
      : "She had nothing new to suggest.";
  if (added.length) {
    $("trainMsg").textContent += " Reading them now…";
    await sb.functions.invoke("train-coach", { body: { mode: "fetch" } }).catch(() => {});
    $("trainMsg").textContent += " done.";
  }
  loadTraining();
}

async function verifyBank() {
  $("trainMsg").textContent = "Checking the questions…";
  const { data } = await sb.functions.invoke("train-coach", { body: { mode: "verify" } });
  const n = data?.checked ?? 0, bad = (data?.failed ?? []).length;
  if (n === 0) {
    const { data: st } = await sb.rpc("training_status");
    $("trainMsg").textContent =
      `There are no questions in the bank to check yet. ` +
      `She has read ${st?.chunks ?? 0} passages from ${st?.web_docs ?? 0} sites, but reading material is not questions: ` +
      `questions arrive when you add a file or press Generate 20.`;
  } else {
    $("trainMsg").textContent = `Checked ${n} question${n === 1 ? "" : "s"}${bad ? `, held back ${bad} that cannot be answered as written` : ", all sound"}.`;
  }
  loadTraining();
}

async function addTrainingSource() {
  const name = $("trName").value.trim(), url = $("trUrl").value.trim();
  if (!name) { $("trMsg").textContent = "Give it a name."; return; }
  const { error } = await sb.rpc("add_training_source", { p_name: name, p_url: url, p_kind: "popular", p_family: "general" });
  if (error) { $("trMsg").textContent = error.message; return; }
  $("trName").value = ""; $("trUrl").value = ""; $("trMsg").textContent = "Added.";
  loadTraining();
}

async function toggleTrainingSource(id, on) {
  await sb.rpc("set_training_source_active", { p_id: Number(id), p_active: on });
  loadTraining();
}

async function openHelp() {
  // the child's Help explains how to use the app; the library and the bill are the parent's
  const parentBits = [$("trainCard"), $("spendWrap")];
  parentBits.forEach((el) => { if (el) el.style.display = S.isParent ? "" : "none"; });
  show("help");
  loadTraining();
  if ($("helpVer")) $("helpVer").textContent = "Version " + APP_VERSION;
}

/* which exam he is inside, shown beside the title — and nothing on the home screen */
function paintExamTag(view) {
  const tag = $("ctxExam");
  if (!tag) return;
  const inside = ["session", "chapter", "track", "exam", "results"].includes(view ?? S.view);
  const fam = S.track ? (TRACKS.find((t) => t.id === S.track) ?? {}).name : "";
  if (!inside || !fam) { tag.classList.add("hidden"); tag.textContent = ""; return; }
  tag.textContent = " · " + fam;
  tag.classList.remove("hidden");
}

function show(id) {
  S.view = id;
  if (!S.restoring) saveRoute();
  ["boot", "signin", "landing", "track", "session", "chapter", "exam", "results",
   "parent", "pchat", "dash", "journal", "formula", "paper", "help", "timetable"]
    .forEach((m) => { const el = $(m); if (el) el.classList.add("hidden"); });
  const signing = id === "signin";
  document.body.classList.toggle("signing", signing);
  if (!signing) document.body.style.background = "";   // back to plain white
  const want = $(id);
  if (!want) { console.warn("no screen called", id); return; }
  want.classList.remove("hidden");
  paintExamTag(id);
  $("homeBtn")?.classList.toggle("hidden", id === "landing" || id === "signin");
  $("parentBtn")?.classList.toggle("hidden", !S.isParent || id === "parent");
  window.scrollTo(0, 0);
}

const S = {
  track: "olympiad", plan: [], chat: [], qs: [], i: 0,
  chapter: null, chapterTitle: "", startedAt: 0, ticker: null, nudged: 0,
  examId: null, profile: null, readiness: [], ctx: null,
};

/* how each exam is introduced. Anything registered in exam_banks appears,
   whether or not it is listed here — this only supplies the friendly words. */
const TRACK_LOOK = {
  olympiad: { name: "Olympiad", school: "APSMO Division J", note: "The book's twenty-four topics, then the Division J contests from May to September" },
  amc:      { name: "AMC", school: "Australian Maths Competition · 3–5 August 2027", note: "Thirty questions, sixty minutes" },
  aas:      { name: "AAS", school: "Camberwell Grammar", note: "Scholarship test · February 2027" },
  edutest:  { name: "Edutest", school: "Kilvington Grammar · McKinnon Secondary (ELMS)", note: "One paper family · same year level · February and September 2027" },
  icas:     { name: "ICAS", school: "ICAS Mathematics · 23–27 August 2027", note: "Paper D · 40 questions, 60 minutes" },
  elms:     { name: "ELMS", school: "Edutest · McKinnon Secondary College", note: "Enhanced Learning in Maths · early September 2027 · Year 6 standard" },
};

let TRACKS = [
  { id: "olympiad", ...TRACK_LOOK.olympiad },
];

/* rebuilt from the database as soon as we know what exams exist */
function buildTracks(banks) {
  const seen = new Set();
  const out = [];
  const order = ["olympiad", "amc", "apsmo", "aas", "edutest", "icas", "elms"];
  const byFamily = {};
  (banks ?? []).forEach((b) => {
    const fam = (b.family ?? b.kind ?? "").toLowerCase();
    if (!fam) return;
    byFamily[fam] = byFamily[fam] ?? [];
    byFamily[fam].push({ kind: b.kind, exam: b.exam, school: b.school ?? "" });
  });

  Object.entries(byFamily).forEach(([fam, members]) => {
    const look = TRACK_LOOK[fam] ?? { name: fam, school: "", note: "" };
    const schools = members.map((m) => m.school).filter(Boolean);
    out.push({
      id: fam,
      ...look,
      // the family's own line if it has one, otherwise the schools beneath it
      school: look.school || (schools.length ? schools.join(" · ") : ""),
      members,
    });
  });
  out.sort((a, b) => (order.indexOf(a.id) + 99 * (order.indexOf(a.id) < 0)) - (order.indexOf(b.id) + 99 * (order.indexOf(b.id) < 0)));
  if (out.length) TRACKS = out;
  return TRACKS;
}

/* a figure is drawn without being asked for, when the words need one */
function needsFigure(text) {
  const t = String(text ?? "");
  if (/diagram in the paper|see the (diagram|figure)|shown (below|above)|in the figure|as shown/i.test(t)) return true;
  return /\b(diagram|figure|shape|grid|triangle|square|circle|rectangle|polygon|angle|graph|chart|table|number line|shaded|perimeter|area|volume|net|cube|pattern of|sequence of shapes|matches|sticks)\b/i.test(t);
}

/* a question taken from a paper carries that page: the figure is on it */
async function showPaperPage(box, q) {
  if (!box || !q?.paper_id) return false;
  box.innerHTML = `<div class="diagram" style="color:var(--mut);font-size:13px">Fetching the page…</div>`;
  const { data: row } = await sb.from("papers").select("path,title,pages").eq("id", q.paper_id).maybeSingle();
  if (!row) { box.innerHTML = ""; return false; }
  const { data: blob } = await sb.storage.from("papers").download(row.path);
  if (!blob) { box.innerHTML = ""; return false; }
  try {
    const pages = await pdfToImages(blob, 40);
    const want = Math.max(1, Math.min(pages.length, q.paper_page || 1));
    const url = URL.createObjectURL(pages[want - 1]);
    box.innerHTML = `<div class="diagram paperShot">
        <img src="${url}" alt="page ${want} of the paper">
      </div>
      <div class="hint" style="margin-top:4px">${esc(row.title)} · page ${want} of ${pages.length} — the figure is on this page.</div>`;
    return true;
  } catch (_) { box.innerHTML = ""; return false; }
}

/* the figure for a question, in order of what is most trustworthy:
   1. a drawing we made and that passed its own check
   2. our drawing, compared against the real figure — used only if it matches
   3. the real figure, cut out of the uploaded page
   4. the page itself, where the figure sits                                      */
/* the figure as it appears on the page, cropped by CSS — no drawing, no invention */
async function pageCrop(chapter, idx, boxId) {
  const el = document.getElementById(boxId);
  if (!el) return false;
  const { data } = await sb.rpc("figure_crop", { p_chapter: Number(chapter), p_idx: Number(idx) });
  if (!data || !data.path || !data.box) return false;
  const { data: pub } = sb.storage.from("papers").getPublicUrl(data.path);
  const url = pub?.publicUrl;
  if (!url) return false;
  const b = data.box;
  const w = Number(b.w ?? 0), h = Number(b.h ?? 0);
  if (!(w > 0.02 && h > 0.02)) return false;
  el.innerHTML = `<div style="width:100%;max-width:420px;aspect-ratio:${(w * 100).toFixed(1)}/${(h * 100).toFixed(1)};background-image:url('${url}');background-size:${(100 / w).toFixed(2)}% ${(100 / h).toFixed(2)}%;background-position:${(b.x / Math.max(0.0001, 1 - w) * 100).toFixed(2)}% ${(b.y / Math.max(0.0001, 1 - h) * 100).toFixed(2)}%;background-repeat:no-repeat;border:1px solid var(--line);border-radius:10px"></div>`;
  return true;
}

async function autoFigure(kind, key, targetId, prompt, existing, q) {
  const box = $(targetId);
  if (!box) return;

  if (existing) { box.innerHTML = `<div class="diagram">${existing}</div>`; return; }

  const wantsFigure = q?.diagram_url || q?.diagram_box || q?.diagram_kind || needsFigure(prompt);
  const hasRealFigure = !!(q?.diagram_box && q?.paper_id);

  // the real figure, cut from the page it lives on (which may not be the question's page)
  const cut = hasRealFigure ? await cutFromPage(q) : null;

  if (wantsFigure) {
    box.innerHTML = `<div class="diagram" style="color:var(--mut);font-size:13.5px">Drawing the figure…</div>`;
    let svg = "";
    try {
      const { data } = await sb.functions.invoke("draw-figure", {
        body: {
          chapter: S.chapter, kind,
          n: kind === "example" ? key : null,
          idx: kind === "question" ? key : null,
          question: prompt,
        },
      });
      svg = data?.svg ?? "";
    } catch (_) { /* fall through */ }

    if (svg && !cut) { box.innerHTML = `<div class="diagram">${svg}</div>`; return; }

    if (svg && cut) {
      // does our drawing say the same thing as the paper's figure?
      box.innerHTML = `<div class="diagram" style="color:var(--mut);font-size:13.5px">Checking the figure…</div>`;
      let ok = true;
      try {
        const { data } = await sb.functions.invoke("check-figure", {
          body: { question: prompt, svg, crop: cut.b64 },
        });
        ok = data?.match !== false;
      } catch (_) { ok = false; }
      if (ok) { box.innerHTML = `<div class="diagram">${svg}</div>`; return; }
      // our drawing was not faithful: show the paper's own figure
      box.innerHTML = cut.html + `<div class="hint" style="margin-top:4px">The figure as it appears in the paper.</div>`;
      return;
    }

    if (svg) { box.innerHTML = `<div class="diagram">${svg}</div>`; return; }
  }

  if (cut) { box.innerHTML = cut.html; return; }

  if (q?.diagram_url) {
    const { data: signed } = await sb.storage.from("papers").createSignedUrl(q.diagram_url, 3600);
    if (signed?.signedUrl) {
      box.innerHTML = `<div class="diagram figureShot"><img src="${signed.signedUrl}" alt="the figure from the paper"></div>`;
      return;
    }
  }

  if (q?.paper_id) { if (await showPaperPage(box, q)) return; }

  box.innerHTML = "";
}

/* cut the figure out of the page it sits on — the question's page, or the next one */
async function cutFromPage(q) {
  try {
    const { data: row } = await sb.from("papers").select("path,title").eq("id", q.paper_id).maybeSingle();
    if (!row?.path) return null;
    const { data: blob } = await sb.storage.from("papers").download(row.path);
    if (!blob) return null;

    const pages = await pdfToImages(blob, 40);
    const want = Math.max(1, Math.min(pages.length, q.figure_page || q.paper_page || 1));
    const url = URL.createObjectURL(pages[want - 1]);

    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });

    const b = q.diagram_box ?? {};
    const sx = Math.max(0, Math.round((b.x ?? 0.05) * img.naturalWidth));
    const sy = Math.max(0, Math.round((b.y ?? 0.05) * img.naturalHeight));
    const sw = Math.max(40, Math.round((b.w ?? 0.9) * img.naturalWidth));
    const sh = Math.max(30, Math.round((b.h ?? 0.4) * img.naturalHeight));
    const pad = 10;
    const cw = Math.min(img.naturalWidth - sx, sw + pad * 2);
    const ch = Math.min(img.naturalHeight - sy, sh + pad * 2);

    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, sx - pad, sy - pad, cw, ch, 0, 0, cw, ch);
    URL.revokeObjectURL(url);

    const b64 = canvas.toDataURL("image/png").split(",")[1];
    const dataUrl = canvas.toDataURL("image/png");
    return {
      b64,
      html: `<div class="diagram figureShot"><img src="${dataUrl}" alt="the figure from the paper"></div>`,
    };
  } catch (_) { return null; }
}

/* ---------------------------------------------------------- the flight --- */
/* Where he is in the season, drawn: stars, a flight path, planets for the real
   exams, a rocket at today. Everything comes from journey(). */
function journeyChart(j) {
  if (!j) return `<div class="sub">Loading the flight plan…</div>`;

  const W = 720, H = 190, pad = 46;
  const span = Math.max(1, j.days_total - 1);
  const xOf = (d) => {
    const days = (new Date(d) - new Date(j.start)) / 86400000;
    return pad + (W - pad * 2) * Math.max(0, Math.min(1, days / span));
  };
  const yOf = (x) => 104 + Math.sin((x / W) * Math.PI * 1.2) * 14;

  const todayX = xOf(j.today);
  const todayY = yOf(todayX);

  // a fixed sprinkle of stars, so the sky does not twinkle on every render
  let stars = "";
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 70; i++) {
    const sx = 8 + rnd() * (W - 16), sy = 6 + rnd() * (H - 12), r = 0.4 + rnd() * 1.1;
    stars += `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${r.toFixed(1)}" fill="#fff" opacity="${(0.15 + rnd() * 0.5).toFixed(2)}"/>`;
  }

  const exams = (j.milestones ?? []).filter((m) => m.kind === "exam");
  const short = {
    "AAS numerical reasoning": "Camberwell",
    "Edutest numerical reasoning": "Kilvington",
    "AMC Upper Primary": "AMC",
    "APSMO Division J": "Olympiad contest",
    "ICAS Maths": "ICAS",
    "ELMS": "ELMS · McKinnon",
  };

  // work out where each planet and its label goes, and stack labels that would collide
  const placed = exams.map((m) => {
    const x = xOf(m.on), y = yOf(x);
    const days = Math.round((new Date(m.on) - new Date(j.today)) / 86400000);
    return {
      m, x, y, days,
      soon: days <= 60,
      firm: m.status === "confirmed",
      label: short[m.name] ?? String(m.name).replace(/\s*(Upper Primary|Maths|Division J)\s*/gi, " ").trim(),
    };
  });

  // a label is about 6.4px a character at 11.5px; keep a lane free if it fits
  const lanes = [];   // lanes[i] = list of [x1, x2] already used, lane i is offset i*17 from the planet
  const laneFor = (p, width) => {
    const half = width / 2;
    for (let i = 0; i < 6; i++) {
      const side = i % 2 === 0 ? 1 : -1;           // even lanes above, odd below
      const level = Math.floor(i / 2);
      const used = lanes[i] ?? (lanes[i] = []);
      const hit = used.some(([a, b]) => p.x + half > a - 6 && p.x - half < b + 6);
      if (!hit) { used.push([p.x - half, p.x + half]); return { side, level }; }
    }
    return { side: 1, level: 2 };
  };

  const planets = placed.map((p) => {
    const width = Math.max(p.label.length, `${p.days} days`.length) * 6.4;
    const { side, level } = laneFor(p, width);
    const anchor = p.x > W - 80 ? "end" : p.x < 80 ? "start" : "middle";
    const nameY = side > 0 ? p.y - 20 - level * 17 : p.y + 30 + level * 17;
    const daysY = side > 0 ? nameY + 13 : nameY + 13;
    const col = p.soon ? "#ffcf6b" : "#8fd0ff";

    return `
      <g>
        <circle cx="${p.x}" cy="${p.y}" r="${p.soon ? 13 : 10}" fill="${col}" opacity=".18"/>
        <circle cx="${p.x}" cy="${p.y}" r="${p.soon ? 8 : 6}" fill="${col}"/>
        <ellipse cx="${p.x}" cy="${p.y}" rx="${p.soon ? 15 : 12}" ry="4" fill="none" stroke="${col}" stroke-opacity=".5" stroke-width="1.2"
                 transform="rotate(-16 ${p.x} ${p.y})"/>
        <text x="${p.x}" y="${nameY}" fill="${p.firm ? "#dfe6ff" : "#b9c2e8"}" font-size="11.5" text-anchor="${anchor}"
              font-weight="${p.firm ? 700 : 600}" ${p.firm ? "" : 'opacity=".9"'}>${esc(p.label)}${p.firm ? "" : "*"}</text>
        <text x="${p.x}" y="${daysY}" fill="#8f9ac4" font-size="10.5" text-anchor="${anchor}">${p.days} days</text>
      </g>`;
  }).join("");

  const portionPct = Math.max(0, Math.min(100, Number(j.portion_pct) || 0));

  return `
  <div class="flight">
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Flight plan">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#131a3a"/><stop offset="55%" stop-color="#0e1430"/><stop offset="100%" stop-color="#0a0f24"/>
        </linearGradient>
        <linearGradient id="trail" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#6d5ef0" stop-opacity=".25"/>
          <stop offset="${Math.max(4, Math.min(96, (todayX / W) * 100))}%" stop-color="#a99bff" stop-opacity=".95"/>
          <stop offset="100%" stop-color="#6d5ef0" stop-opacity=".2"/>
        </linearGradient>
        <radialGradient id="glow"><stop offset="0%" stop-color="#a99bff" stop-opacity=".55"/>
          <stop offset="100%" stop-color="#a99bff" stop-opacity="0"/></radialGradient>
      </defs>
      <rect x="0" y="0" width="${W}" height="${H}" rx="16" fill="url(#sky)"/>
      ${stars}
      <path d="M ${pad} ${yOf(pad)} ${Array.from({length: 24}, (_, i) => {
        const x = pad + ((W - pad * 2) / 23) * i;
        return "L " + x.toFixed(1) + " " + yOf(x).toFixed(1);
      }).join(" ")}" fill="none" stroke="url(#trail)" stroke-width="2.2" stroke-dasharray="1 7" stroke-linecap="round"/>
      ${planets}
      <circle cx="${todayX}" cy="${todayY}" r="24" fill="url(#glow)"/>
      <g transform="translate(${todayX} ${todayY}) rotate(-45)">
        <path d="M 0 -11 C 4 -5 4 5 0 11 C -4 5 -4 -5 0 -11 Z" fill="#fff"/>
        <path d="M -3 6 L -8 14 L -2 11 Z" fill="#a99bff"/>
        <path d="M 3 6 L 8 14 L 2 11 Z" fill="#a99bff"/>
        <circle cx="0" cy="-2" r="2.4" fill="#4b3fc4"/>
      </g>
      <text x="${todayX}" y="${todayY + 34}" fill="#cfd6f7" font-size="11" text-anchor="middle" font-weight="600">you are here</text>
      <text x="${pad}" y="${H - 12}" fill="#8f9ac4" font-size="10.5">start · ${new Date(j.start).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</text>
      <text x="${W - pad}" y="${H - 12}" fill="#8f9ac4" font-size="10.5" text-anchor="end">${j.days_left} days left</text>
      ${exams.some((m) => m.status !== "confirmed")
        ? `<text x="${pad}" y="20" fill="#6f7aa6" font-size="10">* date not yet published by the school</text>` : ""}
    </svg>

    <div class="flightFoot">
      <div>
        <div class="k" style="margin:0 0 6px">Portion done</div>
        <div class="gauge"><span style="width:${portionPct}%"></span></div>
        <div class="sub" style="margin-top:6px">${j.topics_done ?? 0} of ${j.topics_total ?? 0} topics mastered across ${j.exams ?? 0} exams · ${j.questions ?? 0} questions answered · ${j.accuracy ?? 0}% right</div>
      </div>
      <div style="text-align:right">
        <div class="k" style="margin:0 0 6px">Next paper</div>
        <div class="sub" style="max-width:220px">${esc(j.next_paper?.why ?? "")}</div>
      </div>
    </div>
  </div>`;
}


/* ------------------------------------------------------------- the pad --- */
/* The iPad's own keyboard covers the whole screen, so we bring our own: three
   short rows, half the height, and the question stays visible above it. */
let padTarget = null, padKind = "num", padShift = false;

const PAD_KEYS = {
  num: [
    ["7", "8", "9", "⌫"],
    ["4", "5", "6", "/"],
    ["1", "2", "3", "."],
    ["0", "-", ":", "done"],
  ],
  text: [
    ["q","w","e","r","t","y","u","i","o","p"],
    ["a","s","d","f","g","h","j","k","l"],
    ["z","x","c","v","b","n","m","'"],
  ],
};

/* a laptop has a real keyboard; the pad is for a finger on a tablet */
function onLaptop() {
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const touchPoints = navigator.maxTouchPoints ?? 0;
  return !coarse && touchPoints === 0;      // no finger, so there is a real keyboard
}

function openPad(el, kind) {
  if (onLaptop()) {
    el.readOnly = false;
    el.setAttribute("inputmode", kind === "num" ? "decimal" : "text");
    el.focus();
    return;
  }
  padTarget = el;
  padKind = kind ?? "num";
  $("pad").classList.remove("hidden");
  $("pad").setAttribute("aria-hidden", "false");
  document.body.classList.add("padOpen");
  $("padWho").textContent = kind === "num" ? "Your answer" : "Type to Ananya";
  paintPad();
  // the pad sits at the bottom, so nothing needs to move; just keep the box visible
  const y = window.scrollY;
  setTimeout(() => { if (Math.abs(window.scrollY - y) > 4) window.scrollTo(0, y); }, 80);
}

function closePad() {
  document.body.classList.remove("padOpen");
  $("pad")?.classList.add("hidden");
  $("pad")?.setAttribute("aria-hidden", "true");
  padTarget = null;
}

function paintPad() {
  const rows = PAD_KEYS[padKind].map((row) => row.map((k) => {
    const label = k === "⌫" ? "⌫" : k === "done" ? "Done" : k === " " ? "space" : (padShift && /^[a-z]$/.test(k) ? k.toUpperCase() : k);
    const wide = k === "done" ? " wide" : k === "⌫" ? " del" : "";
    return `<button class="pk${wide}" data-action="padKey" data-a0="${k}">${esc(label)}</button>`;
  }).join(""));

  const extras = padKind === "text"
    ? [`<button class="pk space" data-action="padKey" data-a0=" ">space</button>`,
       `<button class="pk${padShift ? " on" : ""}" data-action="padShift">⇧</button>`,
       `<button class="pk del" data-action="padKey" data-a0="⌫">⌫</button>`,
       `<button class="pk wide" data-action="padDone">Done</button>`]
    : [];

  const body = padKind === "num"
    ? `<div class="pkGrid">${rows.join("")}</div>`
    : rows.map((r) => `<div class="pkRow">${r}</div>`).join("");
  $("padKeys").innerHTML = body + (extras.length ? `<div class="pkRow">${extras.join("")}</div>` : "");
}

function growSay(el) {
  const y = window.scrollY;
  el.style.height = "auto";
  el.style.height = Math.min(140, Math.max(48, el.scrollHeight)) + "px";
  if (window.scrollY !== y) window.scrollTo(0, y);   // the box grows, the page does not move
}

function padKey(k) {
  if (!padTarget) return;
  if (k === "⌫") {
    padTarget.value = padTarget.value.slice(0, -1);
  } else if (k === "done") {
    return padDone();
  } else {
    const ch = padShift && /^[a-z]$/.test(k) ? k.toUpperCase() : k;
    padTarget.value += ch;
    if (padShift) { padShift = false; paintPad(); }
  }
  padTarget.dispatchEvent(new Event("input", { bubbles: true }));
  if (padTarget.id === "say") growSay(padTarget);
}

/* the escape hatch: hand this one field to the iPad's own keyboard */
function useSystemKeyboard() {
  const el = padTarget;
  closePad();
  if (!el) return;
  el.removeAttribute("readonly");
  el.focus();
  el.addEventListener("blur", () => el.setAttribute("readonly", "readonly"), { once: true });
}

function padDone() {
  const el = padTarget;
  closePad();
  if (!el) return;
  if (el.id === "say") sendMe();
  else if (el.id === "ans") check();
  el.blur();
}

/* tapping anywhere else puts the pad away */
document.addEventListener("pointerdown", (e) => {
  if (!$("pad") || $("pad").classList.contains("hidden")) return;
  if (e.target.closest("#pad") || e.target.closest("input") || e.target.closest("#micBtn")) return;
  closePad();
});

/* ---------------------------------------------------------- formatting --- */
/* Turns a method into steps: numbers in a tinted chip, operators in colour,
   one line per step, indented under a small number. */
function rich(text) {
  let t = String(text ?? "").trim();
  if (!t) return "";

  // escape first, then turn numeric entities back into characters so the
  // number highlighter cannot eat "&#39;" and mangle it
  t = esc(t).replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));

  // operators first, then numbers: the tags the second pass adds contain "=" and
  // would otherwise be mangled by the first
  const decorate = (x) => x
    .replace(/([×÷+\-−=≈%])/g, '<span class="op">$1</span>')
    .replace(/(\d{1,2}:\d{2}|\d[\d,\s]*\d|\d)/g, (m) => `<span class="num">${m.trim()}</span>`);

  const parts = t.split(/\s*(?:→|=>|;\s+|\.\s+(?=[A-Z0-9£$]))\s*/).filter(Boolean);
  if (parts.length <= 1) return `<div class="work">${decorate(t)}</div>`;
  return `<ol class="steps">${parts.map((x) => `<li>${decorate(x)}</li>`).join("")}</ol>`;
}



/* everything he might need, in the conversation itself */
function paintActions() {
  const box = $("chatActions");
  if (!box) return;
  const btns = [];
  const c = S.ctx ?? {};

  // a placement only ever appears until he has been placed once
  if (c.placement_due && !S.script?.length) btns.push(`<button class="go small" data-action="startPlacement">Check where I am</button>`);

  // the chapter the coach has just sent him to
  const plan = S.planAction;
  if (plan?.chapter && plan.action === "quest" && !S.script?.length) {
    const t = (TRACKS.find((x) => x.id === S.track) ?? {});
    btns.push(`<button class="go small" data-action="startChapter" data-a0="${plan.chapter}">Chapter ${plan.chapter} →</button>`);
    btns.push(`<button class="ghost small" data-action="skipChapter" data-a0="${plan.chapter}"
      title="Not this one? She will offer two other chapters, then decide.">Skip this chapter</button>`);
  }

  if (c.mock?.due) btns.push(`<button class="go small" data-action="startMock">Paper is due — sit it</button>`);

  if (S.script && S.si < S.script.length) btns.push(`<button class="ghost small" data-action="advance">Skip this one</button>`);
  if (S.chapter && S.script?.length && S.si >= S.script.length) btns.push(`<button class="ghost small" data-action="startQuiz">Chapter quiz</button>`);
  box.innerHTML = btns.join("");
}

/* she sends him to a chapter; when he is done he comes back to her */
async function startChapter(n) {
  await startSolo(n);
  S.returnToCoach = true;
}

async function backToCoach() {
  S.returnToCoach = false;
  const done = (S.script ?? []).slice(0, S.si).filter((x) => x.type === "question").length;
  const right = (S.script ?? []).slice(0, S.si).filter((x) => x.type === "question" && x.data?.lastOk).length;
  show("session");
  const note = `He has just finished chapter ${S.chapter} on his own — ${done} questions. Assess how he did and tell him what is next, in two or three lines.`;
  const reply = await callCoach({ mode: "reply", note });
  if (reply) bubble("coach", reply, replySpoken);
  S.script = []; S.si = 0;
  paintActions();
}


/* --------------------------------------------------------------- mic --- */
/* Two ways to speak. Answering: he says "submit" and it is marked. Thinking
   aloud: the microphone stays open, and every time he pauses she answers him —
   no word needed, because he is talking to her, not answering. */
const MAX_LISTEN_MS = 5 * 60 * 1000;
const THINK_QUIET_MS = 2500;

let micArmed = false, listening = false, recog = null;
let heard = "";
let thinkMode = false, thinkBuf = "", thinkTimer = null;

const SUBMIT_WORDS = /\b(submit|send it|send|done|finished|that'?s it)\b[.!]?\s*$/i;

function paintMic() {
  const m = $("micBtn"), st = $("micState");
  if (m) {
    m.innerHTML = listening ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>` : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round"><path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z"/>
        <path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>`;
    m.classList.toggle("on", !!listening);
    m.title = listening ? (thinkMode ? "Stop thinking aloud" : "Stop listening") : "Tap to talk";
  }
  if (st) {
    const show = listening;
    st.style.display = show ? "" : "none";
    st.textContent = show
      ? (thinkMode ? "Listening — think out loud, I will answer each pause." : "Listening — say “submit” when finished.")
      : "";
  }
}

function isStandalone() {
  return window.navigator.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)")?.matches === true;
}

/* Ask iOS for the microphone first. In a home-screen app the permission prompt
   only appears for a real capture request, so this is the one thing that can
   unblock it — and if it is refused, we say which setting to change. */
async function askForMic() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) return "unavailable";
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());     // we only wanted the permission
    return "granted";
  } catch (e) {
    const name = e?.name ?? "";
    if (name === "NotAllowedError" || name === "SecurityError") return "denied";
    if (name === "NotFoundError") return "no-mic";
    return "failed";
  }
}

function micHelp(why) {
  const open = `<a href="${location.href}" target="_blank" rel="noopener">Open it in Safari</a>`;
  const steps =
    "On the iPad, two settings have to allow it: " +
    "<b>Settings → Privacy &amp; Security → Microphone → Safari</b> on, and " +
    "<b>Settings → Safari → Settings for Websites → Microphone → Ask</b>. " +
    "If it was ever refused, also clear the site: Settings → Safari → Advanced → Website Data → " +
    "remove akshaybangalorekar.github.io, then try again.";

  if (why === "denied") {
    return `The microphone is switched off for this site on this device. ${steps}`;
  }
  if (why === "no-mic") return "I cannot find a microphone on this device.";
  if (why === "silent") {
    return isStandalone()
      ? `No prompt appeared. iOS only asks once, and it does not ask inside a home-screen app. ${steps} Or ${open} and use the mic there.`
      : `No prompt appeared. ${steps}`;
  }
  if (why === "unavailable") {
    return `This device will not offer a microphone here. ${open} and the mic will work there — or type instead.`;
  }
  return `The microphone would not start. ${steps}`;
}

function startListening(asThink) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    $("micState").innerHTML = `This browser cannot listen. ${micHelp("unavailable")}`;
    openPad($("say"), "text");
    return;
  }
  if (listening) { if (asThink && !thinkMode) { thinkMode = true; paintMic(); } return; }

  $("micState").textContent = "Asking for the microphone…";
  const silent = setTimeout(() => {
    if (!listening) $("micState").innerHTML = micHelp("silent");
  }, 6000);
  askForMic().then((state) => {
    clearTimeout(silent);
    if (state === "denied" || state === "no-mic" || state === "unavailable") {
      $("micState").innerHTML = micHelp(state);
      if (state === "unavailable") openPad($("say"), "text");
      return;
    }
    beginRecognition(asThink);
  });
}

function beginRecognition(asThink) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;
  thinkMode = !!asThink;
  recog = new SR();
  recog.lang = "en-AU";
  recog.interimResults = true;
  recog.continuous = true;
  recog.maxAlternatives = 1;

  heard = thinkMode ? "" : $("say").value;
  listening = true; paintMic();

  recog.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) heard = (heard + " " + r[0].transcript).replace(/\s+/g, " ").trim();
      else interim += r[0].transcript;
    }
    const whole = (heard + " " + interim).replace(/\s+/g, " ").trim();

    if (thinkMode) {
      thinkBuf = whole;
      $("micState").textContent = whole ? `I am listening — “${whole.slice(-70)}”` : "I am listening.";
      clearTimeout(thinkTimer);
      thinkTimer = setTimeout(flushThink, THINK_QUIET_MS);
      return;
    }

    $("say").value = whole;
    growSay($("say"));
    $("say").scrollTop = $("say").scrollHeight;
    if (SUBMIT_WORDS.test(whole)) {
      const clean = whole.replace(SUBMIT_WORDS, "").trim();
      $("say").value = clean;
      stopListening(false);
      if (clean) sendMe();
    }
  };

  recog.onstart = () => { $("micState").textContent = "Listening — go ahead."; };

  // say plainly why it did not work, instead of going quiet
  recog.onerror = (e) => {
    const why = e?.error ?? "";
    const said = {
      "not-allowed": "I am not allowed to use the microphone. On the iPad: Settings → Safari → Microphone, allow it, then tap Talk again.",
      "service-not-allowed": "The microphone is blocked for this site. Check Settings → Safari → Microphone.",
      "audio-capture": "I cannot find a microphone on this device.",
      "no-speech": "I did not hear anything. Tap Talk, then speak.",
      "network": "The microphone needs a working connection.",
      "aborted": "",
    }[why] ?? ("The microphone stopped: " + why);
    stopListening(true);
    if (said) $("micState").textContent = said;
  };
  recog.onend = () => {
    if (!listening) return;
    try { recog.start(); } catch (_) { /* it will restart on the next tap */ }
  };

  try {
    recog.start();
  } catch (e) {
    listening = false; paintMic();
    $("micState").textContent = "The microphone would not start (" + e.message + "). Tap Talk again, or type.";
    return;
  }
  setTimeout(() => { if (listening) stopListening(true); }, MAX_LISTEN_MS);
}

/* every pause in his thinking becomes a turn in the conversation */
async function flushThink() {
  const said = (thinkBuf || "").trim();
  thinkBuf = ""; heard = "";
  if (!said || said.length < 2) return;
  bubble("me", said);
  S.chat.push({ role: "atharv", text: said });
  const think = bubble("think", "…");
  const reply = await callCoach({
    mode: "reply",
    note: "He is thinking aloud in the middle of a question and has just said the above. Answer in one or two short lines that move him one step: name what he has right, then ask the single next question, or give the first line of the method and stop. Never the final answer.",
  });
  think.remove();
  if (reply) { bubble("coach", reply, replySpoken); S.chat.push({ role: "coach", text: reply }); }
  paintMic();
}

function stopListening(keepText) {
  listening = false;
  clearTimeout(thinkTimer);
  try { recog?.stop(); } catch (_) {}
  recog = null;
  if (!keepText) heard = "";
  thinkBuf = "";
  paintMic();
}

function toggleMic() {
  micArmed = true;
  if (listening) { stopListening(true); return; }
  startListening(false);          // his words are written into the box; it is never focused
}

function startThinking() {
  micArmed = true;
  startListening(true);
}

/* ---------------------------------------------------------------- art --- */
function warliTile() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
    <rect width="160" height="160" fill="#8c3b1e"/>
    <g stroke="#f6efe3" fill="none" stroke-width="2" stroke-linecap="round" opacity=".95">
      <path d="M80 62 L68 96 L92 96 Z" fill="#f6efe3" stroke="none"/>
      <circle cx="80" cy="52" r="6" fill="#f6efe3" stroke="none"/>
      <path d="M68 96 L62 120 M92 96 L98 120 M70 72 L58 82 M90 72 L102 82"/>
      <path d="M18 18 l10 12 l-10 12 l-10 -12 Z" fill="#f6efe3" opacity=".22" stroke="none"/>
      <path d="M142 18 l10 12 l-10 12 l-10 -12 Z" fill="#f6efe3" opacity=".22" stroke="none"/>
      <path d="M18 142 l10 12 l-10 12 l-10 -12 Z" fill="#f6efe3" opacity=".22" stroke="none"/>
      <path d="M142 142 l10 12 l-10 12 l-10 -12 Z" fill="#f6efe3" opacity=".22" stroke="none"/>
      <circle cx="80" cy="132" r="3" fill="#e8b23a" stroke="none"/>
    </g>
  </svg>`;
}

function madhubaniTile() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
    <rect width="160" height="160" fill="#f7f1e3"/>
    <g stroke="#1b3a6b" stroke-width="2" fill="none" opacity=".95">
      <path d="M52 80 C64 66 96 66 108 80 C96 94 64 94 52 80 Z" fill="#e8b23a"/>
      <path d="M108 80 L122 68 L122 92 Z" fill="#c0392b"/>
      <circle cx="66" cy="77" r="2.4" fill="#1b3a6b"/>
      <path d="M72 72 C80 77 80 83 72 88"/>
      <circle cx="30" cy="30" r="4" fill="#c0392b" stroke="none"/>
      <circle cx="130" cy="30" r="4" fill="#c0392b" stroke="none"/>
      <circle cx="30" cy="130" r="4" fill="#c0392b" stroke="none"/>
      <circle cx="130" cy="130" r="4" fill="#c0392b" stroke="none"/>
      <path d="M20 140 q10 -14 20 0" stroke="#c0392b"/>
    </g>
  </svg>`;
}

function paintArt() {
  const day = Math.floor(Date.now() / 86400000);
  const warli = day % 2 === 0;
  const svg = warli ? warliTile() : madhubaniTile();
  const uri = "url(\"data:image/svg+xml," + encodeURIComponent(svg) + "\")";

  const band = $("artBand");
  band.style.background = (warli ? "#8c3b1e" : "#f7f1e3");
  band.style.backgroundImage = uri;
  band.style.backgroundSize = "160px 160px";
  band.style.backgroundRepeat = "repeat";
  band.innerHTML = `<div class="frame" style="border-color:${warli ? "#f6efe3" : "#c0392b"}"></div>
                    <div class="frame inner" style="border-color:${warli ? "#e8b23a" : "#1b3a6b"}"></div>`;
  if (document.body.classList.contains("signing")) {
    document.body.style.background = warli ? "#8c3b1e" : "#f7f1e3";
  }
  const foot = document.querySelector(".authFoot");
  if (foot) {
    foot.style.color = warli ? "rgba(255,255,255,.82)" : "rgba(27,58,107,.75)";
    foot.style.textShadow = warli ? "0 1px 2px rgba(0,0,0,.3)" : "none";
  }
}

/* --------------------------------------------------------------- auth --- */
/* what the device is actually running, so a stale copy is visible at a glance */
async function paintDiag() {
  const box = $("diag");
  if (!box) return;
  let sw = "none";
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    sw = reg ? (reg.active ? "active" : "installing") : "not registered";
  } catch (_) { sw = "blocked"; }
  let sess = "none";
  try {
    const { data } = await sb.auth.getSession();
    sess = data?.session ? "signed in" : "none";
  } catch (_) { sess = "unknown"; }
  const ios = (navigator.userAgent.match(/OS (\d+)[._](\d+)/) || []);
  const iosVer = ios[1] ? `iOS ${ios[1]}.${ios[2] ?? 0}` : "not iOS";
  const mode = isStandalone() ? "home-screen app" : "browser tab";
  box.innerHTML = `Version <b>${APP_VERSION}</b> · ${iosVer} · ${mode}<br>offline cache: ${sw} · session: ${sess}` +
    `<br>If this is not the version I told you about, tap the button below.`;
}

/* drop the offline copy and load the newest file from the site */
/* ask for the microphone on its own, and report exactly what came back */
async function testMic() {
  const out = $("micTest");
  if (!out) return;
  out.textContent = "Asking…";
  const state = await askForMic();
  const words = {
    granted: "The microphone works on this device.",
    denied: "Refused. " + micHelp("denied"),
    "no-mic": "No microphone found.",
    unavailable: "This browser does not offer a microphone to pages.",
    failed: "The request failed. " + micHelp("failed"),
  };
  out.innerHTML = words[state] ?? state;
}

async function freshCopy() {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch (_) {}
  location.replace(location.pathname + "?v=" + Date.now());
}

async function signIn() {
  const btn = document.querySelector("#signin button.go");
  $("err").textContent = "";
  if (!createClient) { $("err").textContent = "The app has no database library loaded. Reload the page."; return; }
  const typed = $("email").value.trim(), password = $("pw").value;
  if (!typed || !password) { $("err").textContent = "Type your name and the password."; return; }

  const wantRemember = $("remember")?.checked !== false;
  localStorage.setItem(REMEMBER_KEY, wantRemember ? "1" : "0");
  if (btn) { btn.disabled = true; btn.textContent = "Signing in…"; }
  const waitNote = setTimeout(() => {
    if (btn?.disabled) $("err").textContent = "Still working — the server is slow to answer.";
  }, 3000);

  let error = null;
  try {
    if (typed.includes("@")) {
      const res = await sb.auth.signInWithPassword({ email: typed, password });
      error = res.error;
    } else {
      // a short name: look up the account, then sign in the ordinary way.
      // No function in the middle, so there is nothing to wait on.
      const { data: found, error: lookErr } = await sb.rpc("login_email", { p_name: typed.toLowerCase() });
      if (lookErr) {
        error = { message: "Could not check that name. Check the connection and try again." };
      } else if (!found) {
        error = { message: `There is no one called “${typed}” here. Check the name, or use your full email address.` };
      } else {
        const res = await sb.auth.signInWithPassword({ email: found, password });
        error = res.error;
      }
    }
  } catch (e) {
    error = { message: "Could not reach the server: " + (e?.message ?? e) };
  }
  if (!error && !typed) error = { message: "Type your name first." };
  clearTimeout(waitNote);
  if ($("err").textContent.startsWith("Still working")) $("err").textContent = "";

  if (error) {
    if (btn) { btn.disabled = false; btn.textContent = "Sign in"; }
    $("err").textContent = /invalid|credentials|do not match/i.test(error.message)
      ? "That name and password do not match. Check the password, or use “Forgot the password?”."
      : error.message;
    return;
  }
  rememberUser(typed);
  if (!wantRemember) sessionStorage.setItem("quest.mem-only", "1");
  start();
}

async function forgotPassword() {
  const email = $("email").value.trim();
  if (!email) { $("err").textContent = "Type the email first, then press it again."; return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  $("err").textContent = "";
  $("signHint").textContent = error
    ? "Could not send it: " + error.message
    : "If that address has an account, a reset link is on its way. Open it on this device.";
}

async function saveNewPassword() {
  const pw = $("newPw").value;
  if (pw.length < 6) { $("newPwErr").textContent = "Six characters at least."; return; }
  const { error } = await sb.auth.updateUser({ password: pw });
  if (error) { $("newPwErr").textContent = error.message; return; }
  $("newPwErr").textContent = "";
  $("newPassCard").classList.add("hidden");
  start();
}
async function signOut() { await sb.auth.signOut(); location.reload(); }
$("appTitleText").textContent = "Quest Coach";

async function start() {
  // a watchdog: if the app is still on the boot card after ten seconds,
  // put a screen up rather than leaving "One moment…" for ever
  const watchdog = setTimeout(() => {
    if (!$("boot") || $("boot").classList.contains("hidden")) return;
    try { goLanding(); } catch (_) { show("signin"); }
    const note = $("err");
    if (note) note.textContent = "The app was slow to start. Tap Start, and if that fails, reload.";
  }, 10000);

  try {
    await bootInner();
  } catch (e) {
    try { goLanding(); } catch (_) { show("signin"); }
    const note = $("err");
    if (note) note.textContent = "Something went wrong starting up: " + (e?.message ?? e);
  } finally {
    clearTimeout(watchdog);
  }
}

async function bootInner() {
  if (location.hash.includes("type=recovery")) {
    show("signin");
    $("newPassCard").classList.remove("hidden");
    return;
  }
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { show("signin"); $("signOut").style.display = "none"; return; }
  $("signOut").style.display = "inline-block";
  try { await loadContext(); } catch (e) { console.warn("context load failed:", e?.message); }
  const { data: isP } = await sb.rpc("is_parent");
  S.isParent = !!isP;
  $("appTitleText").textContent = S.isParent ? "Quest Coach · parent" : "Quest Coach";
  $("parentBtn")?.classList.toggle("hidden", !S.isParent);
  if (S.isParent) { await loadParent(); goParent(); return; }

  let route = null;
  try { route = JSON.parse(localStorage.getItem(ROUTE_KEY) || "null"); } catch (_) {}
  if (route && route.view === "track" && route.track) {
    S.restoring = true;
    await openTrack(route.track);
    S.restoring = false;
    return;
  }
  // a reset on any device must win over the conversation saved on this one
  const { data: ctx } = await sb.rpc("coach_context");
  const resetStamp = ctx?.reset_at ?? null;
  const lastStamp = (() => { try { return localStorage.getItem("quest.resetAt"); } catch (_) { return null; } })();

  if (resetStamp && resetStamp !== lastStamp) {
    clearSession();
    try { localStorage.setItem("quest.resetAt", resetStamp); } catch (_) {}
    try { localStorage.removeItem(ROUTE_KEY); } catch (_) {}
  }

  // never placed? then today starts with the placement, not an old chat —
  // and he still gets a screen to look at
  if (ctx?.placement_due) { clearSession(); goLanding(); return; }

  if (restorableSession()) {
    bubble("coach", "You stopped partway last time — tap Resume and we will carry on from where you were.");
    resumeSession();
    return;
  }

  if (route && route.view === "chapter" && route.chapter) {
    S.restoring = true;
    await openChapter(route.chapter);
    S.restoring = false;
    return;
  }
  goLanding();
}

async function loadBanks() {
  // the family is what folds two banks into one card: it must be fetched
  const { data: banks } = await sb.from("exam_banks")
    .select("exam, kind, family, school, chapter_from, chapter_to").order("chapter_from");
  const { data: counts } = await sb.from("chapters").select("n, source, practice");
  const byKind = {};
  (counts ?? []).forEach((c) => { byKind[c.source] = (byKind[c.source] ?? 0) + (c.practice ?? 0); });
  const data = (banks ?? []).map((b) => ({ ...b, count: byKind[b.kind] ?? 0 }));
  buildTracks(data);
}

/* keep 20 untried questions in front of him, in the exams the coach writes for */
let toppingUp = false;
async function keepBankAhead() {
  if (toppingUp) return;
  toppingUp = true;
  try {
    const { data: trTop } = await sb.rpc("truth");
    const short = trTop?.topup_needed ?? [];
    for (const want of short) {
      const { data: made, error } = await sb.functions.invoke("make-questions", {
        body: { exam: want.exam, count: want.want ?? 20 },
      });
      await sb.rpc("log_topup", {
        p_exam: want.exam, p_asked: want.want ?? 20, p_made: made?.added ?? 0,
        p_reason: error ? error.message : "fewer than 20 left to try",
      });
    }
  } catch (_) { /* quietly try again next time */ }
  toppingUp = false;
}

async function loadContext() {
  await loadBanks();
  const { data: fresh } = { data: (S.TR ?? {}).freshness ?? null };
  S.freshness = fresh ?? [];
  await checkReset();
  checkRunningJob();
  runServerQueue();                     // which exams exist decides which cards appear
  const { data } = await sb.rpc("coach_context");
  S.ctx = data ?? {};
  const { data: prof } = await sb.from("profiles").select("*").limit(1).maybeSingle();
  S.profile = prof;
  const { data: plan } = await sb.from("plan_days").select("*").eq("day", todayISO()).order("seq");
  S.plan = plan ?? [];
  const { data: ready } = await sb.from("v_exam_readiness").select("*");
  S.readiness = ready ?? [];
}

/* -------------------------------------------------------------- parent -- */
const BANK_FAMILY = {
  "AAS numerical reasoning": "AAS",
  "AMC Upper Primary": "AMC",
  "APSMO Division J": "Olympiad",
  "Olympiad book": "Olympiad",
  "Edutest numerical reasoning": "Edutest",
  "ELMS": "Edutest",
  "ICAS Maths": "ICAS",
};

const FAMILY_EXAM = {
  "Olympiad": "Olympiad book",
  "Edutest": "ELMS",
  "AAS": "AAS numerical reasoning",
  "ICAS": "ICAS Maths",
  "AMC": "AMC Upper Primary",
};

/* write more questions for one exam, on demand */
/* after any write, the screen that shows the result is re-read */
async function afterWrite(where) {
  lastRefresh = 0;                       // the throttle must not swallow our own change
  if (where === "parent" && S.isParent) return goParent();
  if (where === "track" && S.track) return paintTrackCard(S.track);
  if (where === "help") return loadTraining();
}

async function generateFor(fam, count, btn) {
  const exam = FAMILY_EXAM[fam] ?? fam;
  if (btn) { btn.disabled = true; btn.textContent = "Writing…"; }

  // the non-maths sections of this exam get their own questions too
  let extra = 0;
  try {
    const { data: chs } = await sb.from("chapters").select("n, subject, source").neq("subject", "maths").limit(80);
    const mine = (chs ?? []).filter((c) => String(c.source ?? "").toLowerCase() === String(fam).toLowerCase());
    for (const c of mine.slice(0, 8)) {
      const r = await sb.functions.invoke("make-questions", { body: { chapter: c.n, count: 3 } });
      extra += r?.data?.added ?? 0;
    }
  } catch (_) {}

  const { data, error } = await sb.functions.invoke("make-questions", { body: { exam, count } });
  // whatever it wrote is checked against official material before it can be served
  await sb.rpc("enqueue_job", { p_kind: `gate:${String(exam).toLowerCase()}`, p_payload: {} }).catch(() => {});
  const added = (data?.added ?? 0) + extra;
  const figs = data?.figures ?? 0;
  await sb.rpc("log_topup", {
    p_exam: exam, p_asked: count, p_made: added,
    p_reason: error ? error.message : `asked for from the parent screen, ${figs} with a figure`,
  });
  if (btn) {
    btn.disabled = false;
    btn.textContent = added ? `Added ${added}${figs ? ` · ${figs} with a figure` : ""}` : "Nothing added";
  }
  lastRefresh = 0;
  setTimeout(() => goParent(), 900);
}

/* a printable sheet of what is in an exam, so a parent can see what he is doing */
async function printQuestions(fam) {
  // the questions for this exam, read the same way every other count is read
  const key = String(fam ?? "").toLowerCase().replace(/[^a-z]/g, "") === "olympiad" ? "olympiad"
    : String(fam ?? "").toLowerCase().includes("edutest") ? "edutest"
    : String(fam ?? "").toLowerCase().includes("aas") ? "aas"
    : String(fam ?? "").toLowerCase().includes("icas") ? "icas"
    : String(fam ?? "").toLowerCase().includes("amc") ? "amc" : String(fam ?? "").toLowerCase();

  const { data: rows, error } = await sb.rpc("print_rows", { p_exam: key });
  if (error) { alert("Could not read the questions: " + error.message); return; }
  if (!rows?.length) { alert(`There is nothing to print for ${fam} yet — the bank holds no questions for it.`); return; }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(fam)} — questions</title>
    <style>
      body{font-family:system-ui,sans-serif;margin:32px;color:#111;line-height:1.5}
      h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:22px 0 8px;color:#444;
        border-bottom:1px solid #ddd;padding-bottom:4px}
      .q{margin:0 0 10px;page-break-inside:avoid}
      .n{color:#777;font-size:12px}
      .tag{font-size:10px;color:#7a5405;background:#fdf3dc;border:1px solid #f0dfae;border-radius:999px;padding:1px 6px;margin-left:4px}
      .src{font-size:10.5px;color:#666;margin:2px 0 6px}
      .fig{margin:8px 0 4px;page-break-inside:avoid}
      .fig svg{max-width:320px;height:auto}
      @media print{.fig svg{max-width:260px}}
      .opt{color:#333;font-size:13px;margin-left:14px}
      .src{font-size:11px;color:#888}
      .key{margin-top:26px;border-top:1px solid #ccc;padding-top:10px;font-size:12px;color:#333}
</style></head><body>
    <h1>${esc(fam)} — the questions in the bank</h1>
    <div class="src">Printed ${new Date().toLocaleDateString("en-AU")} · ${rows.length} questions</div>
    ${[...new Set(rows.map((r) => r.chapter))].map((n) => `
      <h2>${esc((rows.find((r) => r.chapter === n)?.strand) ?? ("Chapter " + n))}</h2>
      ${rows.filter((r) => r.chapter === n).map((r, i) => `
        <div class="q"><span class="n">${i + 1}.</span> ${esc(r.prompt)}
          <span class="tag">${r.status === "cleared" ? "verified" : r.status === "provisional" ? "not verified" : r.status === "failed" ? "held back" : "unchecked"}</span>
          ${r.diagram_svg ? `<div class="fig">${r.diagram_svg}</div>` : ""}
          <div class="src">${r.derived_from
            ? `${esc(r.source_ref ?? "variation")} — original: “${esc(String(r.derived_from).slice(0, 70))}”`
            : `${r.source_kind === "upload" ? "From your file" : "From the web"}: ${esc(r.source_ref ?? "written by the coach, no source recorded")}`}${r.source_url && !r.derived_from ? ` — ${esc(r.source_url)}` : ""}</div>
          ${Array.isArray(r.options) ? r.options.map((o) => `<div class="opt">${esc(o)}</div>`).join("") : ""}
          ${r.paper_id ? `<div class="src">from an uploaded paper</div>` : `<div class="src">written by the coach</div>`}
        </div>`).join("")}`).join("")}
    <div class="key"><b>Answers</b><br>${rows.map((r, i) =>
      `${i + 1}. ${esc(r.answer ?? "—")}`).join(" · ")}</div>
    </body></html>`;

  const w = window.open("", "_blank");
  if (!w) { alert("Your browser blocked the print window. Allow pop-ups for this site."); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

/* three wipes: everything, the files, or the coach's own questions */
async function wipe(kind) {
  // the two wipes in Start again replaced every old path; this stays only as a guard
  console.warn("the old wipe path was called with:", kind);
  const msg = $("resetMsg");
  if (msg) msg.textContent = "Use Start again: wipe his history, or wipe the questions.";
}



/* a parent can ask for the mock early; printing questions never sets one */
async function askForEarlyMock() {
  if (!confirm("Ask the coach to set a paper now? She will only do it if she thinks he is ready.")) return;
  const { data, error } = await sb.functions.invoke("coach-chat", {
    body: { mode: "decide", note: "parent asks for an early mock", forceMock: true, track: S.track },
  });
  if (error || data?.error) { alert(data?.error ?? error?.message ?? "That did not work."); return; }
  await goParent();
}

/* a parent sets the date the moment the school publishes it */
/* the name you sign in with, and the password, changed from here */
async function loadAlertTo() {
  const box = $("alertToList");
  if (!box) return;
  const { data } = await sb.rpc("list_alert_recipients");
  const rows = data ?? [];
  box.innerHTML = rows.length
    ? rows.map((r) => `<div class="upRow"><span class="upName">${esc(r.email)}</span>
        <button class="mini" data-mail="${esc(r.email)}" data-action="removeAlertTo" data-mail="${esc(r.email)}">Remove</button></div>`).join("")
    : `<div class="sub">No addresses yet.</div>`;
}

async function addAlertTo() {
  const v = $("alertTo").value.trim();
  if (!v) return;
  const { error } = await sb.rpc("add_alert_recipient", { p_email: v });
  if (error) { $("alertToMsg").textContent = error.message; return; }
  $("alertTo").value = ""; $("alertToMsg").textContent = "Added.";
  loadAlertTo();
}

async function testAlertEmail() {
  $("alertToMsg").textContent = "Sending…";
  const { data, error } = await sb.functions.invoke("exam-watch", { body: { mode: "test" } });
  if (error) { $("alertToMsg").textContent = "Could not reach the mail service: " + error.message; return; }
  if (data?.sent) {
    const bad = (data.failed ?? []).map((f) => f.to);
    $("alertToMsg").textContent = `Sent to ${(data.to ?? []).join(", ")}.` +
      (bad.length ? ` Not to ${bad.join(", ")} — ${data.failed[0].detail ?? "refused"}` : "");
  } else {
    const first = (data?.failed ?? [])[0];
    $("alertToMsg").textContent = first
      ? `Not sent — ${first.detail ?? "refused"}`
      : `Not sent — ${data?.reason ?? "the mail key is not set yet"}.`;
  }
}

async function removeAlertTo(email) {
  await sb.rpc("remove_alert_recipient", { p_email: email });
  loadAlertTo();
}

async function loadAccount() {
  const { data } = await sb.rpc("my_account");
  if ($("accName") && data?.name) $("accName").value = data.name;
}

async function saveName() {
  const name = $("accName").value.trim().toLowerCase();
  const { error } = await sb.rpc("set_username", { p_name: name });
  $("accMsg").textContent = error ? error.message : `Done — sign in as “${name}” from now on.`;
  if (!error) { try { localStorage.setItem(LAST_KEY, name); } catch (_) {} }
}

/* the papers, and a way to read one again when it failed */
let papersPoll = null;
async function loadPapersToRead() {
  if (papersPoll) { clearTimeout(papersPoll); papersPoll = null; }
  const box = $("pPapers");
  if (!box) return;
  const { data } = (S.TR?.uploads ? { data: S.TR.uploads } : await sb.rpc("papers_to_read"));
  const rows = data ?? [];
  if (!rows.length) {
    box.innerHTML = `<div class="sub">No files yet. Add a PDF, a photo or a page of questions and it will
      be saved first, then read page by page.</div>`;
    return;
  }
  if (rows.some((r) => r.status === "failed" || (r.pages_total ?? 0) > (r.pages_done ?? 0))) {
    /* folded by default: a parent opens it when they want it */
  }
  box.innerHTML = rows.map((r) => {
    const left = (r.pages_total ?? 0) - (r.pages_done ?? 0);
    const total = r.pages_total ?? 0;
    const done = r.pages_done ?? 0;
    const finished = total > 0 && left === 0 && r.status !== "failed";
    const state = r.status === "failed" ? "stopped" : finished ? "read" : total === 0 ? "not read" : "reading";

    // one tick per page: read, reading, or waiting. No sentences.
    const ticks = total
      ? Array.from({ length: total }, (_, i) =>
          `<i class="${i < done ? "on" : i === done && state === "reading" ? "now" : ""}"></i>`).join("")
      : `<i class="now"></i>`;
    const inFile = Number(r.figures_in_file ?? 0);
    const attached = Number(r.diagrams ?? 0);
    const facts = [
      r.questions ? `${r.questions} questions` : null,
      attached ? (inFile > attached ? `${attached} of ${inFile} figures` : `${attached} figures`) : (inFile ? `0 of ${inFile} figures` : null),
      (r.questions ?? 0) > (r.answers ?? 0) ? `${r.questions - r.answers} unanswered` : null,
    ].filter(Boolean).join(" · ");

    return `<div class="fileRow">
      <div class="fileTop">
        <span class="fileDot ${state}"></span>
        <span class="fileName">${esc(r.title)}</span>
        <span class="filePages">${total ? `${done}/${total}` : "—"}</span>
      </div>
      <div class="ticks">${ticks}</div>
      ${facts ? `<div class="fileFacts">${facts}</div>` : ""}
      <div class="bar" style="gap:6px;margin-top:10px">
        <button class="ghost small" style="border-color:#f2c9c9;color:#b8383d" data-action="deletePaper" data-a0="${r.id}">Delete</button>
      </div>
    </div>`;
  }).join("");

  // if anything is still being read, look again shortly so the row moves
  if (rows.some((r) => (r.pages_total ?? 0) > (r.pages_done ?? 0) || r.status === "running")) {
    papersPoll = setTimeout(loadPapersToRead, 4000);
    paintScanBanner();   // the top bar follows the reading, not just the job queue
  }
}

/* read the rest of a paper, or all of it, from the parent view */
async function retryReading(paperId, all) {
  const { data: pages } = await sb.rpc("papers_to_read");
  const row = (pages ?? []).find((p) => p.id === paperId);
  if (!row) return;

  // no page images yet? make them here, then hand the reading to the server
  if ((row.pages_total ?? 0) === 0) { await preparePages(paperId); }

  const { error } = await sb.rpc("restart_reading", { p_paper: paperId, p_all: !!all });
  if (error) { alert(error.message); return; }

  paintTopProgress(0, 1, "Reading…");
  runServerQueue();
  loadPapersToRead();
}

/* remove a sample: the file, its pages and the questions that came from it */
async function deletePaper(paperId) {
  if (!confirm("Delete this file and everything that came from it — its questions, answers and any record of him answering them? This cannot be undone.")) return;

  // the files go first, then the records: nothing is left behind either way
  if (paperId === null || paperId === undefined || Number.isNaN(Number(paperId))) {
    alert("That file has no id, so nothing was deleted. Reload the page and try again.");
    return;
  }
  const { data: paths } = await sb.rpc("paper_objects", { p_id: Number(paperId) });
  const { data, error } = await sb.rpc("delete_paper", { p_id: Number(paperId) });
  if (error) {
    // never a blind delete: say which file failed and why, and leave everything in place
    alert(`Could not delete that file: ${error.message}\nNothing was removed.`);
    console.error("delete_paper failed", { paperId, error });
    return;
  }

  const files = [...(paths ?? [])];
  for (let i = 0; i < files.length; i += 100) {
    await sb.storage.from("papers").remove(files.slice(i, i + 100)).then(() => {}, () => {});
  }

  const bits = [];
  if (data?.questions_removed) bits.push(`${data.questions_removed} questions`);
  if (data?.answers_removed) bits.push(`${data.answers_removed} answers`);
  if (data?.attempts_removed) bits.push(`${data.attempts_removed} answers he gave`);
  if (!bits.length) bits.push("nothing left behind");

  await loadPapersToRead();

  const box = $("pPapers");
  if (box) {
    const note = document.createElement("div");
    note.className = "upRow";
    note.style.borderColor = "#cfe6d5";
    note.style.background = "#f6fbf7";
    note.innerHTML = `<span class="upName">Deleted</span><span class="upState">removed ${esc(bits.join(" · "))}</span>`;
    box.prepend(note);
    setTimeout(() => note.remove(), 9000);
  }
}

/* turn the stored original back into page images, so the server can read them */
async function preparePages(paperId) {
  const { data: row } = await sb.from("papers").select("*").eq("id", paperId).maybeSingle();
  if (!row) return;
  const { data: b64 } = await sb.rpc("upload_bytes", { p_id: paperId });
  if (!b64) { alert("That file could not be read back."); return; }
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const file = new File([bytes], row.title || "paper.pdf", { type: row.mime || "application/pdf" });

  const { data: owner } = await sb.rpc("my_student_id");
  const pages = await pdfToImages(file, 40);
  paintTopProgress(0, pages.length, `Saving page 0 of ${pages.length}`);
  for (let i = 0; i < pages.length; i++) {
    const path = `${owner}/page-${paperId}-${i + 1}.jpg`;
    const up = await sb.storage.from("papers").upload(path, pages[i], { upsert: true, contentType: "image/jpeg" });
    if (up.error) { alert(`Page ${i + 1} could not be stored: ${up.error.message}`); return; }
    await sb.from("paper_pages").upsert({ paper_id: paperId, page_no: i + 1, path }, { onConflict: "paper_id,page_no" });
    paintTopProgress(i + 1, pages.length, `Saving page ${i + 1} of ${pages.length}`);
  }
}

/* the topics costing him marks, worst first — the same list she is given */
async function loadTough() {
  const card = $("toughCard"), box = $("pTough");
  if (!card || !box) return;
  const data = (S.TR ?? {}).tough_topics ?? [];
  const rows = data ?? [];
  if (!rows.length) { card.style.display = "none"; return; }
  card.style.display = "";
  const cls = (v) => v === "struggling" ? "red" : v === "shaky" ? "amber"
    : v === "slow" ? "amber" : v === "coping" ? "ok" : "grey";
  box.innerHTML = rows.map((r) => `
    <div class="upRow">
      <span class="upName">${esc(String(r.title).split(" · ").pop())}</span>
      <span class="upState">${r.correct}/${r.tries} right · ${r.accuracy}%${
        r.avg_seconds ? ` · ${r.avg_seconds}s a question` : ""} ·
        <span class="pill ${cls(r.verdict)}">${esc(r.verdict)}</span></span>
    </div>`).join("");
}

/* what he has asked her for, and what came of it */
async function loadRequests() {
  const card = $("reqCard"), box = $("pRequests");
  if (!card || !box) return;
  const { data } = await sb.from("question_topups")
    .select("exam, asked_for, made, reason, at").order("at", { ascending: false }).limit(8);
  const rows = data ?? [];
  if (!rows.length) { card.style.display = "none"; return; }
  card.style.display = "";
  box.innerHTML = rows.map((r) => {
    const when = new Date(r.at).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
    const who = /asked for more questions/i.test(r.reason ?? "") ? "He asked the coach" : "You asked";
    return `<div class="upRow"><span class="upName">${esc(who)} · ${esc(r.exam)}</span>
      <span class="upState">${esc(when)} · asked ${r.asked_for} · added ${r.made}</span></div>`;
  }).join("");
}

/* the adults who can see this child */
async function loadParents() {
  const box = $("parentList");
  if (!box) return;
  const rows = (S.TR ?? {}).accounts?.accounts ?? [];
  if (!rows.length) { box.textContent = "Nobody linked yet."; return; }

  const kid = (S.TR ?? {}).child ?? {};

  box.innerHTML = rows.map((a) => {
    const work = a.is_child
      ? `${kid.questions_answered ?? 0} questions answered · ${kid.right ?? 0}% right · ` +
        `${kid.chapters_mastered ?? 0} topics mastered · ${kid.sessions ?? 0} sessions`
      : a.sees_child ? "Can see this child" : "No access to this child";
    return `<div class="acctRow">
      <div style="flex:1 1 200px">
        <div><b>${esc(a.name ?? a.email)}</b>${
          a.is_you ? `<span class="pill ok" style="margin-left:6px">signed in here</span>` : ""}${
          a.role === "child" ? `<span class="pill grey" style="margin-left:6px">child</span>` : ""}</div>
        <div class="sub">${esc(work)}</div>
      </div>
      ${a.is_you ? "" : `<button class="ghost small" style="border-color:#f2c9c9;color:#b8383d"
          data-del="${a.user_id}" data-kid="${a.role === "child" ? "1" : ""}">Delete</button>`}
    </div>`;
  }).join("");

  box.querySelectorAll("[data-del]").forEach((btn) => {
    btn.onclick = () => startDeleteAccount(btn.dataset.del, btn.dataset.kid === "1");
  });
}

/* deleting a child needs the child's own password; deleting a parent does not */
async function startDeleteAccount(userId, isChild) {
  let password = "";
  if (isChild) {
    const data = (S.TR ?? {}).child ?? {};
    const k = data ?? {};
    const msg = `This deletes ${k.name ?? "the child"}'s account and everything recorded under it:\n\n` +
      `${k.questions_answered ?? 0} questions answered, ${k.right ?? 0}% right\n` +
      `${k.chapters_mastered ?? 0} topics mastered, ${k.sessions ?? 0} sessions, ${k.tests ?? 0} tests\n\n` +
      `This cannot be undone. Type the child's password to go ahead.`;
    password = prompt(msg) ?? "";
    if (!password) return;
  } else if (!confirm("Delete this parent account? It cannot be undone.")) {
    return;
  }

  const { data, error } = await sb.functions.invoke("manage-student", {
    body: { action: "delete-account", user_id: userId, password },
  });
  if (error || data?.error) { alert(data?.error ?? error?.message ?? "That did not work."); return; }
  loadParents();
}

async function removeParent(parentId) { startDeleteAccount(parentId, false); }

/* add a child, or remove one */
async function loadChildren() {
  const { data } = { data: S.TR ?? {} };
  const kids = data?.student ? [{ name: data.student, id: data.student_id }] : [];
  if ($("kidList")) {
    $("kidList").textContent = kids.length
      ? `Looking after: ${kids.map((k) => k.name).join(", ")}`
      : "No child linked yet — add one below.";
  }
}

async function createChild() {
  const name = $("newKidName").value.trim();
  const email = $("newKidEmail").value.trim();
  const password = $("newKidPw").value;
  $("newKidMsg").textContent = "Creating…";
  const { data, error } = await sb.functions.invoke("manage-student", {
    body: { action: "create", name, email, password },
  });
  if (error || data?.error) {
    $("newKidMsg").textContent = data?.error ?? error?.message ?? "That did not work.";
    return;
  }
  $("newKidMsg").textContent = `Created. ${name} signs in as ${email} — or set a short name under “Your account”.`;
  $("newKidName").value = ""; $("newKidEmail").value = ""; $("newKidPw").value = "";
}

/* the account list above does the deleting now */
async function deleteChild() {
  const { data } = { data: S.TR ?? {} };
  if (data?.student_id) startDeleteAccount(data.student_id, true);
}

/* a parent sets the child's password, for when it is forgotten */
async function saveChildPassword() {
  const pw = $("kidPw").value;
  if (pw.length < 8) { $("kidMsg").textContent = "Use at least 8 characters."; return; }
  $("kidMsg").textContent = "Setting it…";
  const { data, error } = await sb.functions.invoke("set-child-password", { body: { password: pw } });
  if (error || data?.error) {
    $("kidMsg").textContent = data?.error ?? error?.message ?? "That did not work.";
    return;
  }
  $("kidPw").value = "";
  $("kidMsg").textContent = "Done. He can sign in with his name and that password now.";
}

async function savePassword() {
  const pw = $("accPw").value;
  if (pw.length < 8) { $("accMsg").textContent = "Use at least 8 characters."; return; }
  const { error } = await sb.auth.updateUser({ password: pw });
  $("accMsg").textContent = error ? error.message : "Password changed.";
  if (!error) $("accPw").value = "";
}

/* the pencil turns the date into a picker, in place */
function editDate(id, exam, current) {
  const cell = $("dl" + id)?.parentElement;
  if (!cell) return;
  cell.innerHTML = `<input type="date" value="${current ?? ""}" style="font:inherit;padding:5px 7px;border:1px solid var(--line);border-radius:9px">`;
  const input = cell.querySelector("input");
  input.onchange = () => setExamDate(exam, input.value);
  input.focus();
}

async function setExamDate(exam, value) {
  if (!exam || !value) return;
  const { error } = await sb.rpc("set_exam_date", { p_exam: exam, p_on: value, p_confirmed: true });
  if (error) { alert(error.message); return; }
  await loadParent();
  goParent();
}

async function loadSync() {
  try {
    const { data } = await sb.rpc("sync_view");
    S.sync = data ?? null;
    const { data: pipe } = await sb.rpc("exam_pipeline");
    S.pipeline = pipe ?? [];
  } catch (e) { console.error("sync_view failed:", e); S.sync = null; }
  return S.sync;
}

/* the count for one exam, from the shared view; -1 means "the view has not loaded yet" */
function syncCount(key, field) {
  const ex = (S.sync?.exams ?? []).find((x) => String(x.key).toLowerCase() === String(key).toLowerCase());
  return ex ? Number(ex[field] ?? 0) : -1;
}

async function ensureExamCounts() {
  if ((S.examCounts ?? []).length) return S.examCounts;
  try { const { data } = await sb.rpc("exam_counts"); S.examCounts = data ?? []; }
  catch (e) { S.examCounts = []; console.error("exam_counts failed:", e); }
  return S.examCounts;
}

async function loadParent() {
  await loadSync();
  const { data } = await sb.rpc("truth");
  S.TR = data ?? {};
  S.studentId = data?.student?.id ?? S.studentId ?? null;
  S.pctx = data ?? {};
  S.schoolReadiness = (data?.families ?? []).map((f) => ({
    exam: f.label, school: f.schools, sits_on: f.exam_on, headline: f.verdict,
    sits_minutes: 0, measured_minutes: 0, sections: [], calendar_name: "",
  }));
  loadAccount();
  loadChildren();
  loadParents();
  loadPapersToRead();
}

const BANK_LABEL = {
  "Olympiad book": "Olympiad topics",
  "APSMO Division J": "APSMO Division J",
  "AAS numerical reasoning": "AAS · Camberwell Grammar",
  "Edutest numerical reasoning": "Edutest · Kilvington",
  "ICAS Maths": "ICAS · Maths",
  "ELMS": "ELMS · Edutest, McKinnon",
};

async function goParent() {
  await loadParent();
  Promise.resolve({ data: (S.TR ?? {}).journey, error: null }).then(({ data, error }) => {
    if (!$("pFlight")) return;
    if (error) {
      $("pFlight").innerHTML = `<div class="sub">The flight plan could not load: ${esc(error.message)}</div>`;
      return;
    }
    $("pFlight").innerHTML = journeyChart(data);
  }).catch((e) => {
    if ($("pFlight")) $("pFlight").innerHTML = `<div class="sub">The flight plan could not load: ${esc(e.message)}</div>`;
  });
  show("parent");
  S.view = "parent";
  const c = S.pctx ?? {};
  const me = (await sb.auth.getUser()).data?.user?.email ?? "";
  $("pWho").textContent = me ? `Parent view · signed in as ${me}` : "Parent view";
  $("pChild").textContent = `${c.student?.name ?? "your child"} — how it is going`;
  const a = c.attempts ?? {}, se = c.sessions ?? {}, st = c.student ?? {};
  $("pSummary").textContent =
    `${a.total ?? 0} questions answered in all · ${a.last_7 ?? 0} this week · ` +
    `${a.accuracy_7 ?? 0}% right this week · ${se.last_7 ?? 0} sessions logged · ` +
    `${(st.xp ?? 0).toLocaleString()} XP · streak ${st.streak ?? 0} days`;

  const words = { ready: "Enough to judge", too_early: "Just started",
                  in_progress: "Building up", thin: "Too few to judge",
                  no_content: "No questions yet" };

  // one source of truth: every number below comes from a single read of the truth function
  const TR = S.TR ?? {};
  const rows = TR.families ?? [];
  if (!TR.exam_counts) {
    try { const res = await sb.rpc("exam_counts"); TR.exam_counts = res?.data ?? []; }
    catch (e) { TR.exam_counts = []; console.error("exam_counts failed:", e); }
  }
  S.examCounts = TR.exam_counts ?? [];
  const banks = TR.content?.banks ?? [];
  const specs = TR.specs ?? [];
  const topicMap = {};
  for (const f of rows) {
    const { data } = await sb.rpc("topic_readiness", { p_family: String(f.family) });
    topicMap[f.family] = data ?? [];
  }

  const cls = (v) => v === "solid" ? "ok" : v === "needs work" ? "red"
    : v === "partly measured" ? "amber" : "grey";

  const SOURCE_SECTION = {
    edutest: "Numerical reasoning", elms: "Mathematics", aas: "Mathematics",
    icas: "Whole paper", amc: "Whole paper", book: "Each contest", apsmo: "Each contest",
  };

  $("pExams").innerHTML = rows.map((f) => {
    const fam = f.label;
    // the count comes from the shared view, so this card and the child's agree
    const syncKey = String(f.family ?? fam).toLowerCase();
    const cRow2 = (S.examCounts ?? []).find((r) => String(r.exam).toLowerCase() === syncKey) ?? {};
    const fallback2 = syncCount(syncKey, "servable") >= 0 ? syncCount(syncKey, "servable") : (f.items ?? 0);
    const examCount = Number(cRow2.total ?? fallback2);
    const examReady = Number(cRow2.ready ?? fallback2);
    const pipeRow = (S.pipeline ?? []).find((p) => String(p.key).toLowerCase() === syncKey) ?? {};
    const pipeTone = examCount === 0 ? "orange" : examCount < 30 ? "amber" : "green";
    const pipeTip = examCount === 0
      ? "No questions for this exam yet — she writes them from what she reads, or from a file you upload."
      : `${examCount} questions for this exam${Number(pipeRow.solved ?? 0) ? ` · ${pipeRow.solved} attempted so far` : ""}. The five exams add up to the total in Help.`;
    const mine = specs.filter((x) => x.family === fam);
    const topics = topicMap[f.family] ?? [];
    const myBanks = (banks ?? []).filter((b) => b && (BANK_FAMILY[b.exam] ?? b.exam) === fam);
    const totalQ = myBanks.reduce((a, b) => a + (b.questions ?? 0), 0);
    const files = myBanks.map((b) => b.from_files).filter(Boolean);

    const when = f.exam_on
      ? new Date(f.exam_on).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
      : "no date";

    const sitsMin = Math.max(0, ...(f.schools_list ?? []).map((x) => x.sits_minutes ?? 0));
    const coveredMin = Math.max(0, ...(f.schools_list ?? []).map((x) => x.measured_minutes ?? 0));
    const pct = sitsMin ? Math.round((coveredMin / sitsMin) * 100) : 0;

    const pipeRowE = (S.pipeline ?? []).find((p) => String(p.key).toLowerCase() === syncKey) ?? {};
    const pipeLeft = Math.max(0, examCount - Number(cRow2.attempted ?? 0));
    const pipeSolved = Number(pipeRowE.solved ?? 0);

    // empty is a flag on the one card, not a second copy of it
    const isEmpty = !totalQ;

    const schools = (f.schools_list ?? []).map((r, i) => {
      const d = r.sits_on
        ? new Date(r.sits_on).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
        : "no date";
      const dd = r.sits_on ? Math.round((new Date(r.sits_on) - new Date()) / 86400000) : null;
      const spec = mine.find((y) => y.sits === r.school) ?? mine[0] ?? {};
      const sections = (spec.sections ?? [{ part: "Whole paper", minutes: r.sits_minutes ?? 0 }]).map((sec) => {
        const own = topics.filter((t) => (SOURCE_SECTION[t.source] ?? "Whole paper") === sec.part && (t.questions ?? 0) > 0);
        const loaded = own.reduce((a2, t) => a2 + (t.questions ?? 0), 0);
        return `<div class="ttSection">
          <div class="ttSectionHead">${esc(sec.part)} <span class="sub">· ${sec.minutes} min in the exam</span>
            <span class="sub" style="float:right">${loaded ? `${loaded} questions` : "none yet"}</span></div>
          ${own.map((t) => `<div class="ttRow">
              <span class="dot ${t.preparedness >= 60 ? "green" : t.preparedness > 0 ? "amber" : "grey"}"></span>
              <span class="ttTopic">${esc(String(t.title).split(" · ").pop())}
                <span class="sub">${t.questions} questions${t.by_coach ? ` · ${t.by_coach} by the coach` : ""}${t.from_files ? ` · ${t.from_files} from files` : ""}</span></span>
              <span class="ttTarget">${t.tried ? `${t.correct}/${t.tried} right` : "not tried"}</span>
              <span class="bar2" style="width:80px"><i style="width:${t.preparedness}%"></i></span>
            </div>`).join("")}
        </div>`;
      }).join("");

      return `<details class="ttMore"><summary>${esc(r.school)} — ${r.sits_minutes ?? 0} min in the exam</summary>
        <div class="ttPaperHead" style="display:none">${esc(r.school)}
          <span class="exDate" id="dl${fam}${i}" style="font-weight:400">${esc(d)}${dd !== null ? ` · ${dd}d` : ""}</span>
          <button class="pencil" title="Change the date" data-action="editDate" data-a0="${fam}${i}" data-a1="${esc(r.school ?? "")}" data-a2="${esc(r.sits_on ?? "")}"
                  data-exam="${esc(r.calendar_name ?? "")}" data-on="${r.sits_on ?? ""}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/>
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
        </div>${sections}</details>`;
    }).join("");

    return `<div class="card ttExam">
      <div class="ttHead">
        <span class="ttName">${esc(fam)}</span>
        <span class="chip ${toneForCount(pipeRow.left_to_solve ?? examCount)}"
              title="${examCount} questions · ${pipeRow.solved ?? 0} solved · ${pipeRow.left_to_solve ?? examCount} left to solve. ${(pipeRow.left_to_solve ?? examCount) === 0 ? "Nothing left to practise on." : (pipeRow.left_to_solve ?? examCount) < 30 ? "Thinning: under 30 unsolved." : "A healthy queue."}">
          <b>${examCount}</b> questions · <b>${examReady}</b> ready</span>
        <span class="chip grey" title="${esc(fam)} sits on ${esc(when)}"><b>${f.days_left ?? 0}</b> days</span>
        <span class="ttMeta" style="margin-left:auto">${coveredMin} of ${sitsMin} min testable</span>
      </div>
      <div class="bar2" style="margin:8px 0 4px"><i style="width:${pct}%"></i></div>
      ${isEmpty ? `<div class="sub" style="margin:8px 0 0">No questions in this exam's bank yet — none uploaded,
        none written. ${sittingLine(f, esc(when))}.</div>` : schools}
      <div class="bar" style="margin-top:10px">
        <button class="mini" data-gen="${esc(fam)}">Generate 20</button>
        <button class="mini" data-print="${esc(fam)}">Print</button>
      </div>
    </div>`;
  }).join("") || `<div class="sub">Nothing loaded yet.</div>`;

  const sumLine = $("pExamSum");
  if (sumLine) {
    const total = (S.examCounts ?? []).reduce((a, r) => a + Number(r.total ?? 0), 0)
                  || (S.sync?.totals?.questions ?? 0);
    const ready = (S.examCounts ?? []).reduce((a, r) => a + Number(r.ready ?? 0), 0)
                  || (S.sync?.totals?.questions ?? 0);
    const heldBack = Number(S.sync?.totals?.failed ?? 0);
    sumLine.innerHTML = `<span class="chip blue" title="Everything written for the five exams. The cards below add up to this."><b>${total}</b> questions</span>
      <span class="chip grey" title="Checked and answerable, so they can be given to him now."><b>${ready}</b> ready</span>` +
      (heldBack ? `<span class="chip red" title="Written but rejected by the check, so not counted above."><b>${heldBack}</b> held back</span>` : "");
  }

  $("pExams").querySelectorAll("[data-gen]").forEach((b) => {
    b.onclick = () => generateFor(b.dataset.gen, 20, b);
  });
  $("pExams").querySelectorAll("[data-print]").forEach((b) => {
    b.onclick = () => printQuestions(b.dataset.print);
  });

}

function strandMode() {
  return document.querySelector('input[name="strandMode"]:checked')?.value ?? "";
}

async function strandModeChanged() {
  const mode = strandMode();
  const pick = $("upStrandPick"), name = $("upStrand"), hint = $("upStrandHint");
  pick.classList.toggle("hidden", mode !== "existing");
  name.classList.toggle("hidden", mode !== "new");
  if (mode === "auto") hint.textContent = "The reader will name the tab from what it finds.";
  if (mode === "existing") hint.textContent = "Pick the tab these questions belong in.";
  if (mode === "new") hint.textContent = "This becomes a new tab under the exam you chose.";

  if (mode === "existing" && !pick.options.length) {
    const exam = $("upBank").value;
    const { data: bank } = await sb.from("exam_banks").select("kind").eq("exam", exam).maybeSingle();
    const { data } = await sb.from("chapters").select("n, title").eq("source", bank?.kind ?? "").order("n");
    pick.innerHTML = (data ?? []).map((c) => `<option value="${esc(c.title)}">${esc(c.title)}</option>`).join("")
      || `<option value="">No tabs yet — make a new one</option>`;
  }
  updateDest();
}

function openUpload() {
  const panel = $("upPanel"), host = $("upHost");
  if (!panel || !host) return;
  host.appendChild(panel);
  panel.classList.remove("hidden");
  // one option per exam family, not per bank: the book's topics and Division J are one Olympiad
  const FAMILIES = [
    { exam: "Olympiad book", label: "Olympiad — book topics and Division J" },
    { exam: "ELMS", label: "Edutest — Kilvington and McKinnon" },
    { exam: "AAS numerical reasoning", label: "AAS — Camberwell Grammar" },
    { exam: "ICAS Maths", label: "ICAS Mathematics" },
    { exam: "AMC Upper Primary", label: "AMC Upper Primary" },
  ];
  const sel = $("upBank");
  if (sel && sel.options.length <= 1) {
    sel.innerHTML = `<option value="">Choose an exam…</option>` +
      FAMILIES.map((f) => `<option value="${esc(f.exam)}">${esc(f.label)}</option>`).join("");
    sel.value = "";
  }
  strandModeChanged();
  updateDest();
  $("upFiles").innerHTML = "";
  panel.scrollIntoView({ block: "center", behavior: "smooth" });
}

function closeUpload() {
  $("upPanel")?.classList.add("hidden");
  loadPapersToRead();
}

/* any file: images and pdf pages go up as pictures, documents are read as words */
/* read a file into base64, so the database can hold the original */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("could not read the file"));
    r.readAsDataURL(file);
  });
}

/* every upload is kept exactly as it arrived, in the database, before parsing */
async function saveOriginal(file, userId, exam) {
  try {
    const b64 = await fileToBase64(file);
    if (!b64) return null;
    const { data, error } = await sb.rpc("save_upload", {
      p_exam: exam,
      p_name: file.name || "upload",
      p_mime: file.type || "application/octet-stream",
      p_b64: b64,
      p_path: "",
    });
    if (error) return null;
    return data ?? null;
  } catch (_) { return null; }
}

/* the file is stored as a paper first, so there is something to open later */
async function keepPaper(file, userId, exam, pages, questions, savedId) {
  try {
    const clean = safeName(file.name || "paper.pdf");
    const path = `${userId}/${Date.now()}-${clean}`;
    const up = await sb.storage.from("papers").upload(path, file, { upsert: true, contentType: file.type || "application/pdf" });
    if (up.error && !savedId) return null;

    if (savedId) {
      // the original is already in the database; this just points at a copy for reading
      await sb.from("papers").update({ path, pages, questions }).eq("id", savedId);
      return savedId;
    }
    const { data } = await sb.from("papers").insert({
      student_id: userId, exam, title: file.name || "Paper", path, pages, questions,
      mime: file.type || null, size_bytes: file.size || null,
    }).select("id").single();
    return data?.id ?? null;
  } catch (_) { return null; }
}

/* one button: save the file with a progress bar, then read it in the background */
/* the Photo button: either his working, or a question he cannot start */
function askPhotoReason() {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "qcard";
    wrap.innerHTML = `<div class="q" style="font-size:16px">What have you sent me?</div>
      <div class="bar">
        <button class="go small" data-a="working">My working, so far</button>
        <button class="ghost small" data-a="stuck">A question I am stuck on</button>
      </div>
      <div class="hint" style="margin-top:8px">If you are in the middle of a question I already know it is your
        working — this is only for when you send something else.</div>`;
    $("chatWrap").appendChild(wrap);
    stickBottom();
    wrap.querySelectorAll("button").forEach((b) => {
      b.onclick = () => { wrap.remove(); resolve(b.dataset.a); };
    });
  });
}

/* choosing a file is not uploading it: show what was chosen, then let them press Upload */
let stagedFiles = [];
function stageFiles(input) {
  stagedFiles = [...(input.files ?? [])];
  input.value = "";
  const box = $("upStaged"), btn = $("uploadBtn");
  if (box) {
    box.innerHTML = stagedFiles.length
      ? `<div class="chipRow">${stagedFiles.map((f) =>
          `<span class="chip blue" title="${esc(f.name)}"><b>${Math.max(1, Math.round(f.size / 1024))} KB</b> ${esc(f.name.slice(0, 40))}</span>`).join("")}</div>
         <div class="sub" style="margin-top:6px">${stagedFiles.length} file${stagedFiles.length === 1 ? "" : "s"} chosen — not uploaded yet.</div>`
      : "";
  }
  if (btn) {
    btn.disabled = !stagedFiles.length;
    btn.textContent = stagedFiles.length ? `Upload ${stagedFiles.length} file${stagedFiles.length === 1 ? "" : "s"}` : "Upload";
    btn.title = stagedFiles.length ? "Send them to the bank and read them." : "Nothing chosen yet.";
  }
}

async function uploadAndRead(input) {
  const files = [...(input.files ?? [])];
  input.value = "";
  if (!files.length) return;

  // official material is the final authority for the exam selected above — and only that exam
  const official = document.querySelector('input[name="authMode"]:checked')?.value === "official";
  const examKey = (() => {
    const e = String($("upBank")?.value ?? "").toLowerCase();
    if (e.includes("edutest") || e.includes("elms")) return "edutest";
    if (e.includes("aas")) return "aas";
    if (e.includes("olympiad") || e.includes("apsmo") || e.includes("book")) return "olympiad";
    if (e.includes("icas")) return "icas";
    if (e.includes("amc")) return "amc";
    return null;
  })();
  S.uploadAuthority = official && examKey ? `official_${examKey}` : null;
  S.uploadAuthorityExam = official ? examKey : null;

  const { data: { user } } = await sb.auth.getUser();
  const exam = $("upBank")?.value || "ELMS";
  const mode = strandMode();
  const strandChoice = mode === "existing" ? ($("upStrandPick")?.value ?? "")
    : mode === "new" ? ($("upStrand")?.value.trim() ?? "") : "";
  const wrap = $("upProgWrap"), bar = $("upProgBar"), txt = $("upProgText");
  wrap.classList.remove("hidden");
  $("upErr").textContent = "";

  const saved = [];
  const list = $("upFiles");
  const lineFor = (name) => {
    const row = document.createElement("div");
    row.className = "upRow";
    row.innerHTML = `<span class="upName">${esc(name)}</span><span class="upState">Saving…</span>`;
    list.appendChild(row);
    return row.querySelector(".upState");
  };

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const state = lineFor(file.name);
    txt.textContent = `Saving ${i + 1} of ${files.length}: ${file.name}…`;
    bar.style.width = String(Math.round(((i + 0.1) / files.length) * 100)) + "%";

    const b64 = await fileToBase64(file).catch(() => "");
    bar.style.width = "45%";
    if (!b64) { txt.textContent = `Could not read ${file.name}.`; continue; }

    let paperId = null, saveNote = "";
    state.textContent = "Saving to the database…";
    const { data: savedId, error } = await sb.rpc("save_upload", {
      p_exam: exam, p_name: file.name, p_mime: file.type || "application/octet-stream",
      p_b64: b64, p_path: "",
    });
    paperId = savedId ?? null;
    if (paperId && S.uploadAuthority) {
      await sb.from("papers").update({ authority: S.uploadAuthority }).eq("id", paperId);
      // every existing question for that exam is reviewed against it
      await sb.rpc("enqueue_job", { p_kind: `align:${S.uploadAuthorityExam}`, p_payload: { paper_id: paperId } });
    }
    bar.style.width = "75%";
    if (!error && paperId) state.textContent = `Saved to the database · file ${paperId}`;
    if (error || !paperId) {
      // too big for the database in one statement: keep the file in storage and go on
      saveNote = " (kept in storage only — too large for the database copy)";
      const { data: made } = await sb.from("papers").insert({
        student_id: (await sb.rpc("my_student_id")).data,
        uploaded_by: user.id, exam, title: file.name,
        mime: file.type || null, size_bytes: file.size || null, path: "",
      }).select("id").single();
      paperId = made?.id ?? null;
      if (!paperId) {
        state.textContent = `Not saved: ${error?.message ?? "unknown"}`;
        state.classList.add("bad");
        continue;
      }
      state.textContent = `Saved in storage only · file ${paperId}`;
    }

    // where the parent said these belong, if they said
    if (strandChoice) await sb.from("papers").update({ strand_hint: strandChoice }).eq("id", paperId);

    // a copy in storage too, so pages can be shown without decoding the database
    const path = `${user.id}/${Date.now()}-${safeName(file.name)}`;
    await sb.storage.from("papers").upload(path, file, { upsert: true, contentType: file.type });
    await sb.from("papers").update({ path, size_bytes: file.size || null, mime: file.type || null }).eq("id", paperId);

    bar.style.width = String(Math.round(((i + 0.9) / files.length) * 100)) + "%";
    state.textContent = `Saved · file ${paperId} · queued for reading`;
    saved.push({ file, paperId });
  }

  bar.style.width = "100%";
  txt.textContent = saved.length === 1
    ? "Saved. Reading it now — you can carry on."
    : `Saved ${saved.length} files. Reading them one after another — you can carry on.`;
  setTimeout(() => { bar.style.width = "0"; wrap.classList.add("hidden"); }, 1200);

  // the reading runs behind all of them, page by page
  for (const { file, paperId } of saved) {
    await readInBackground(file, user.id, exam, paperId, strandChoice);
  }
  runServerQueue();
  loadPapersToRead();
  if (saved.length) {
    $("upProgText").textContent = saved.length === 1
      ? "Saved. Reading it now — the list below shows how far it has got."
      : `Saved ${saved.length} files. Reading them one after another — the list below shows how far they have got.`;
  }
}

/* the reading is the server's job now; this just keeps asking it for the next page */
async function readInBackground(file, userId, exam, paperId, strand = "") {
  const { data: jobId } = await sb.rpc("start_parse_job", { p_paper: paperId, p_exam: exam, p_pages: 0 });
  paintTopProgress(0, 1, "Preparing…");

  try {
    if (fileKind(file) === "pdf") {
      const pages = await pdfToImages(file, 40);
      await sb.rpc("set_job_total", { p_id: jobId, p_total: pages.length });
      const { data: owner } = await sb.rpc("my_student_id");

      // the pages go into storage once; after this the browser is not needed
      for (let i = 0; i < pages.length; i++) {
        const path = `${owner ?? userId}/page-${paperId}-${i + 1}.jpg`;
        const up = await sb.storage.from("papers").upload(path, pages[i], { upsert: true, contentType: "image/jpeg" });
        if (up.error) throw new Error(`page ${i + 1} could not be stored: ${up.error.message}`);
        const rec = await sb.from("paper_pages").upsert({ paper_id: paperId, page_no: i + 1, path }, { onConflict: "paper_id,page_no" });
        if (rec.error) throw new Error(`page ${i + 1} could not be recorded: ${rec.error.message}`);
        paintTopProgress(i + 1, pages.length, `Saving page ${i + 1} of ${pages.length}`);
      }
    } else {
      // a picture stays a picture; anything else is kept as text and read as text
      const isPic = (file.type || "").startsWith("image/");
      const path = `${userId}/page-${paperId}-1.${isPic ? "jpg" : "txt"}`;
      const body = isPic ? file : new Blob([await file.text()], { type: "text/plain" });
      await sb.storage.from("papers").upload(path, body, {
        upsert: true, contentType: isPic ? (file.type || "image/jpeg") : "text/plain",
      });
      await sb.from("paper_pages").upsert({ paper_id: paperId, page_no: 1, path }, { onConflict: "paper_id,page_no" });
      await sb.rpc("set_job_total", { p_id: jobId, p_total: 1 });
    }
  } catch (e) {
    S.lastReadError = e.message;
    await sb.rpc("finish_parse_job", { p_id: jobId, p_added: 0, p_unanswered: 0, p_strand: "", p_pages_done: 0, p_failed: true });
    loadPapersToRead();
    return;
  }

  paintTopProgress(0, 1, "Reading…");
  runServerQueue();
}

/* ask the server to read page after page; never call it done while pages remain */
let queueTimer = null;
async function runServerQueue() {
  if (queueTimer) { clearTimeout(queueTimer); queueTimer = null; }

  for (let guard = 0; guard < 40; guard++) {
    const { data: next } = await sb.rpc("next_parse_page");
    if (!next) break;

    const { data: prog0 } = await sb.rpc("parse_progress");
    if (prog0) {
      paintTopProgress(prog0.pages_done ?? 0, prog0.pages_total || 1,
        `Reading ${prog0.pages_done ?? 0} of ${prog0.pages_total ?? 1}`);
    }

    const { data, error } = await sb.functions.invoke("parse-page", {
      body: { paper_id: next.paper_id, page: next.page_no },
    });

    // the function reports its own failures in the body, with the reason
    if (data?.error) {
      S.lastReadError = data.detail ? `${data.error}: ${String(data.detail).slice(0, 120)}` : data.error;
      queueTimer = setTimeout(runServerQueue, 25000);
      loadPapersToRead();
      return;
    }
    if (error) {
      S.lastReadError = error.message ?? "the reader did not answer";
      queueTimer = setTimeout(runServerQueue, 25000);
      loadPapersToRead();
      return;
    }
    S.lastReadError = "";
  }

  const { data: prog } = await sb.rpc("parse_progress");
  if (prog && (prog.remaining ?? 0) > 0) {
    // there is still work: leave the bar up and come back to it
    paintTopProgress(prog.pages_done ?? 0, prog.pages_total || 1,
      `Reading ${prog.pages_done ?? 0} of ${prog.pages_total ?? 1} — paused`);
    queueTimer = setTimeout(runServerQueue, 20000);
    return;
  }

  paintTopProgress(0, 0);
  loadPapersToRead();
}


/* cut the figure out of the page, and keep it as its own picture */
async function cropDiagram(pageBlob, box, userId) {
  try {
    const url = URL.createObjectURL(pageBlob);
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const sx = Math.round(box.x * img.naturalWidth);
    const sy = Math.round(box.y * img.naturalHeight);
    const sw = Math.max(40, Math.round(box.w * img.naturalWidth));
    const sh = Math.max(30, Math.round(box.h * img.naturalHeight));

    const pad = 12;
    const cw = Math.min(img.naturalWidth - sx, sw + pad * 2);
    const ch = Math.min(img.naturalHeight - sy, sh + pad * 2);

    const canvas = document.createElement("canvas");
    canvas.width = cw * 2; canvas.height = ch * 2;          // twice the size, so it stays sharp
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, sx - pad, sy - pad, cw, ch, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
    URL.revokeObjectURL(url);
    if (!blob) return null;

    const path = `${userId}/fig-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.png`;
    const up = await sb.storage.from("papers").upload(path, blob, { upsert: true, contentType: "image/png" });
    return up.error ? null : path;
  } catch (_) { return null; }
}


async function readPaper(input) {
  const files = [...(input.files ?? [])];
  if (!files.length) return;
  const { data: { user } } = await sb.auth.getUser();
  const exam = $("upBank")?.value || "ELMS";
  const mode = strandMode();
  const strandChoice = mode === "existing" ? ($("upStrandPick")?.value ?? "")
    : mode === "new" ? ($("upStrand")?.value.trim() ?? "") : "";
  const note = $("upProgText");
  $("upErr").textContent = "";
  let added = 0, suggested = "";

  for (const file of files) {
    try {
      const kind = fileKind(file);
      note.textContent = `Saving ${file.name}…`;
      const savedId = await saveOriginal(file, user.id, exam);
      note.textContent = `Reading ${file.name}…`;

      if (kind === "image") {
        added += await extractOne(file, user.id, `${Date.now()}-${safeName(file.name)}`, (st) => { suggested = suggested || st; });
        await keepPaper(file, user.id, exam, 1, 1, savedId);
      } else if (kind === "pdf") {
        const pages = await pdfToImages(file, 40);
        const before = added;
        S.pendingPages = [];
        S.pendingPaperTitle = file.name;
        for (let i = 0; i < pages.length; i++) {
          note.textContent = `Reading ${file.name}, page ${i + 1} of ${pages.length}…`;
          S.pendingPage = i + 1;
          added += await extractOne(pages[i], user.id, `${Date.now()}-p${i + 1}.jpg`, (st) => { suggested = suggested || st; });
        }
        S.pendingPaper = await keepPaper(file, user.id, exam, pages.length, added - before, savedId);
      } else if (kind === "text") {
        await keepPaper(file, user.id, exam, 1, 0, savedId);
        const text = await file.text();
        added += await extractText(text, (st) => { suggested = suggested || st; });
      } else if (kind === "html") {
        await keepPaper(file, user.id, exam, 1, 0, savedId);
        const html = await file.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        doc.querySelectorAll("script,style").forEach((n) => n.remove());
        added += await extractText(doc.body?.innerText ?? "", (st) => { suggested = suggested || st; });
      } else if (kind === "docx") {
        const mammoth = await import("https://esm.sh/mammoth@1.8.0/mammoth.browser.js");
        const buf = await file.arrayBuffer();
        const out = await mammoth.extractRawText({ arrayBuffer: buf });
        added += await extractText(out.value, (st) => { suggested = suggested || st; });
      } else {
        throw new Error("that file type is not readable — try pdf, an image, or text");
      }
    } catch (e) {
      $("upErr").textContent = `${file.name}: ${e.message}`;
    }
  }

  if (suggested && !$("upStrand").value.trim()) $("upStrand").value = suggested;
  updateDest();
  note.textContent = added
    ? `${added} question${added === 1 ? "" : "s"} read. Check them above, then press Add.`
    : "Nothing was read from those files.";
  input.value = "";
}

function safeName(n) { return n.replace(/[^a-z0-9.]/gi, "").slice(-40) || "file"; }

function fileKind(f) {
  const t = (f.type || "").toLowerCase();
  const n = (f.name || "").toLowerCase();
  if (t.startsWith("image/")) return "image";
  if (t === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".docx")) return "docx";
  if (n.endsWith(".html") || n.endsWith(".htm") || t === "text/html") return "html";
  if (n.endsWith(".md") || n.endsWith(".txt") || n.endsWith(".csv") || n.endsWith(".json") ||
      t.startsWith("text/")) return "text";
  return "unknown";
}

document.addEventListener("change", (e) => {
  if (e.target && (e.target.id === "upStrandPick" || e.target.name === "strandMode" || e.target.name === "authMode")) updateDest();
});

function updateDest() {
  const exam = $("upBank")?.value ?? "";
  const mode = document.querySelector('input[name="strandMode"]:checked')?.value ?? "";
  const picked = mode === "existing" ? ($("upStrandPick")?.value ?? "") : "";
  const typed = mode === "new" ? ($("upStrand")?.value.trim() ?? "") : "";
  const auth = document.querySelector('input[name="authMode"]:checked')?.value ?? "";

  // three questions must be answered before a file can go in
  const strandOk = mode === "existing" ? !!picked : mode === "new" ? !!typed : false;
  const ready = !!exam && strandOk && !!auth;

  const btn = $("pickBtn");
  if (btn) {
    btn.disabled = !ready;
    btn.title = !exam ? "Choose an exam first."
      : !mode ? "Say whether these questions join a tab or start a new one."
      : !strandOk ? (mode === "existing" ? "Choose which tab these questions go into."
                                         : "Name the new tab.")
      : !auth ? "Say whether the file is official or unofficial."
      : "Choose the files to add.";
  }

  const dest = $("upDest");
  if (dest) {
    const where = mode === "existing" ? (picked || "a tab not chosen yet")
      : (typed || "a tab not named yet");
    dest.textContent = `Going into: ${BANK_LABEL[exam] ?? (exam || "no exam chosen")} · ${where}` +
      (auth ? ` · ${auth}` : "");
  }
  const hint = $("authHint");
  if (hint) hint.style.opacity = auth ? "0.55" : "1";
}

async function extractOne(blob, uid, name, onStrand) {
  const path = `${uid}/${name}`;
  const up = await sb.storage.from("papers").upload(path, blob, { upsert: true, contentType: blob.type || "image/jpeg" });
  if (up.error) throw new Error(up.error.message);
  return await callExtract({ path }, onStrand);
}

async function extractText(text, onStrand) {
  if (!text || text.trim().length < 20) throw new Error("no readable text in it");
  return await callExtract({ text: text.slice(0, 60000) }, onStrand);
}

async function callExtract(body, onStrand) {
  // retired: reading a page is ingest's job now, so this hands over instead of duplicating it
  await sb.rpc("enqueue_job", { p_kind: "ingest", p_payload: {} }).catch((e) => console.error("queue failed", e));
  const data = { retired: true }, error = null;
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  const rows = data?.rows ?? [];
  if (data?.strand) onStrand(data.strand);
  // keep the page this page's rows came from, so the question can show it later
  if (rows.length && S.pendingPage != null) {
    for (let i = 0; i < rows.length; i++) S.pendingPages.push(S.pendingPage);
  }
  if (rows.length) {
    const box = $("upRows");
    box.value = (box.value ? box.value.trim() + "\n" : "") +
      rows.map((r) => `${r.q} | ${r.a ?? ""}`).join("\n");
    // multiple choice options travel beside the text, not inside it
    S.pendingOptions = S.pendingOptions ?? [];
    for (const r of rows) S.pendingOptions.push(Array.isArray(r.options) ? r.options : null);
  }
  return rows.length;
}

async function pdfToImages(file, maxPages) {
  const pdfjs = await import("https://esm.sh/pdfjs-dist@4.6.82/build/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "https://esm.sh/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs";
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const out = [];
  const n = Math.min(doc.numPages, maxPages);
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i);
    // scale so the page is about 1400 px wide: legible for the model, small enough to send
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2.5, 1400 / base.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    out.push(blob);
  }
  return out;
}

async function solveBlanks() {
  const exam = $("upBank").value;
  $("upErr").textContent = "Working them out…";
  // retired: the gate owns this now
  await sb.rpc("enqueue_job", { p_kind: `gate:${String(exam).toLowerCase()}`, p_payload: {} })
    .catch((e) => console.error("queue failed", e));
  const data = { retired: true }, error = null;
  if (error || data?.error) {
    $("upErr").textContent = "The solver could not run: " + (error?.message || data?.error);
    return;
  }
  const n = (data.solved ?? []).length;
  $("upErr").textContent = "";
  $("upDone").className = "fb right";
  $("upDone").innerHTML = n
    ? `<b>${n} answer${n === 1 ? "" : "s"} worked out</b>
       <div class="m">${data.solved.map((x) => `Ch${x.chapter} Q${x.idx}: ${esc(x.answer)}${x.confident ? "" : " (unsure)"}`).join("<br>")}</div>
       <div class="m" style="margin-top:8px">These were written by the coach, so they are marked unverified.</div>`
    : `<b>Nothing left to solve</b><div class="m">Every question in this exam already has an answer.</div>`;
}

async function submitUpload() {
  const rows = $("upRows").value.split("\n").map((line) => {
    const [q, ...rest] = line.split("|");
    return { q: (q ?? "").trim(), a: rest.join("|").trim() };
  }).filter((r) => r.q);
  if (!rows.length) { $("upErr").textContent = "Nothing to add — put one question per line."; return; }

  $("upErr").textContent = "";
  // what he pasted is an upload as well, so keep it as it was typed
  if (!$("upRows").dataset.savedFor) {
    try {
      const pasted = new File([$("upRows").value], `pasted-${Date.now()}.txt`, { type: "text/plain" });
      const savedId = await saveOriginal(pasted, (await sb.auth.getUser()).data.user.id, $("upBank").value);
      if (savedId) $("upRows").dataset.savedFor = String(savedId);
    } catch (_) {}
  }

  // attach any options the reader found, in the same order as the rows
  const opts = S.pendingOptions ?? [];
  const rowsWithOptions = rows.map((r, i) => (opts[i]?.length >= 2 ? { ...r, options: opts[i] } : r));

  const { data, error } = await sb.rpc("add_questions", {
    p_exam: $("upBank").value, p_strand: $("upStrand").value.trim() || "General", p_rows: rowsWithOptions,
    p_paper: S.pendingPaper ?? null,
    p_pages: (S.pendingPages ?? []).length === rows.length ? S.pendingPages : null,
  });
  S.pendingPaper = null; S.pendingPages = []; S.pendingPage = null; S.pendingOptions = [];
  if (error) { $("upErr").textContent = error.message; return; }
  $("upDone").className = "fb right";
  const dupes = data.skipped_duplicates ?? 0;
  const fixed = data.improved ?? 0;
  $("upDone").innerHTML = `<b>${data.added} question${data.added === 1 ? "" : "s"} added</b>` +
    (dupes ? ` · <b>${dupes} already there${fixed ? `, ${fixed} improved with their options and page` : ", skipped"}</b>` : "") +
    `<div class="m">into ${esc(data.strand)}. The readiness panel has already updated.</div>
     <div class="bar"><button class="ghost small" data-action="solveBlanks">Work out the missing answers</button></div>`;
  $("upRows").value = "";
  delete $("upRows").dataset.savedFor;
  loadPapersToRead();
}

/* from the chat, a parent can drop in a paper or a photo of one */
function addFromChat() {
  const f = $("upFile");
  if (f) { f.click(); return; }
  openHelp();
}

function parentDictate() {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = $("pMic");
  if (!Rec) { btn.disabled = true; btn.title = "This browser cannot listen"; return; }
  if (S.pMicOn) { S.pMic?.stop(); return; }
  const r = new Rec();
  r.lang = "en-AU"; r.interimResults = true; r.continuous = true;
  r.onresult = (e) => {
    let said = "";
    for (let i = e.resultIndex; i < e.results.length; i++) said += e.results[i][0].transcript;
    $("pSay").value = said.trim();
  };
  r.onend = () => { S.pMicOn = false; btn.classList.remove("on"); };
  r.onerror = () => { S.pMicOn = false; btn.classList.remove("on"); };
  S.pMic = r; S.pMicOn = true; btn.classList.add("on");
  r.start();
}

async function openParentChat() {
  show("pchat");
  await loadChat("pchatWrap", true);
}

/* the whole conversation, kept for good, read from the one place */
async function loadChat(boxId, parentSide) {
  const box = $(boxId);
  if (!box) return;
  const { data } = await sb.rpc("truth");
  const history = (parentSide ? data?.parent_chat : data?.chat) ?? [];
  box.innerHTML = "";
  if (!history.length) {
    const hello = parentSide
      ? "Hello. Ask me anything about how he is going — what he has done this week, which technique is costing him marks, or what to add next."
      : "Hello — good to see you. Ready when you are.";
    if (parentSide) pBubble("coach", hello); else bubble("coach", hello);
    return;
  }
  history.forEach((m) => {
    const role = m.role === "atharv" ? "me" : "coach";
    if (parentSide) {
      const d = document.createElement("div");
      d.className = "msg " + role;
      d.innerHTML = formatCoachHtml(m.body);
      box.appendChild(d);
    } else {
      bubble(role, m.body);
    }
  });
  box.scrollTop = box.scrollHeight;
}

/* every message is kept, not just the last few */
async function keepChat(role, body, thread) {
  try {
    const { error } = await sb.rpc("save_chat", {
      p_role: role, p_body: body, p_thread: thread ?? "child",
    });
    if (error) console.warn("the message was not saved:", error.message);
  } catch (e) { console.warn("the message was not saved:", e?.message); }
}

function pBubble(role, text) {
  const d = document.createElement("div");
  d.className = "msg " + role;
  d.innerHTML = role === "coach" ? (formatCoachHtml(text) || esc(text)) : esc(text);
  $("pchatWrap").appendChild(d);
  stickBottom();
  return d;
}

async function askParent(text) {
  keepChat("atharv", text, "parent");
  pBubble("think", "…");
  const { data, error } = await sb.functions.invoke("coach-chat", {
    body: {
      mode: "parent",
      messages: [{ role: "atharv", content: text }],
      note: `${text}\n\n(Continue our conversation. Do not greet me as a stranger.)`,
    },
  });
  document.querySelector("#pchatWrap .msg.think")?.remove();
  const said = data?.reply ?? data?.say ?? "";
  if (said) keepChat("coach", said, "parent");
  if (error || data?.error) { pBubble("coach", "I could not reach the coach. Try again in a moment."); return; }
  pBubble("coach", said || "I could not reach the coach. Try again in a moment.");
}

async function sendParent() {
  const box = $("pSay");
  const text = box.value.trim();
  if (!text) return;
  box.value = "";
  S.forceScroll = true;
  pBubble("me", text);
  await askParent(text);
}

async function scanContent() {
  const btn = $("scanBtn");
  btn.disabled = true;
  $("contentMsg").textContent = "Reading the bank…";
  $("contentList").innerHTML = ""; $("applyBar").style.display = "none";

  // retired: checking and correcting belong to the gate and the aligner
  const data = { items: [] }, error = null;
  btn.disabled = false;
  if (error || data?.error) { $("contentMsg").textContent = "Could not check: " + (error?.message || data?.error); return; }

  const props = data.proposals ?? [];
  $("contentMsg").textContent = props.length
    ? `${props.length} of ${data.checked} checked need a change.`
    : `All ${data.checked} checked came back right.`;

  $("contentList").innerHTML = props.map((p, i) => `
    <div class="trick" style="align-items:flex-start">
      <input type="checkbox" data-i="${i}" checked style="width:22px;height:22px;flex:0 0 22px;margin-top:2px">
      <div>
        <div class="tt">Ch${p.chapter} Q${p.idx} · ${esc(p.verdict)}</div>
        <div class="tp">${esc(p.prompt).slice(0, 160)}</div>
        <div class="sub" style="margin-top:6px">stored: <b>${esc(p.was || "—")}</b> → proposed: <b>${esc(p.answer || "—")}</b></div>
        <div class="sub">${esc(p.why || "")}</div>
        <div class="te">${esc(p.method || "")}</div>
      </div>
    </div>`).join("");
  $("applyBar").style.display = props.length ? "flex" : "none";
  window.__proposals = props;
}

async function applyContent() {
  const props = window.__proposals ?? [];
  const picked = [...document.querySelectorAll("#contentList input:checked")]
    .map((el) => props[Number(el.dataset.i)]).filter(Boolean);
  if (!picked.length) { $("contentMsg").textContent = "Nothing ticked."; return; }

  $("contentMsg").textContent = "Applying…";
  const data = { applied: 0 }, error = null;
  if (error || data?.error) { $("contentMsg").textContent = "Could not apply: " + (error?.message || data?.error); return; }
  $("contentMsg").textContent = `${data.applied} corrected, and logged in content_changes.`;
  $("contentList").innerHTML = ""; $("applyBar").style.display = "none";
}

async function resetProgress() {
  const first = confirm(
    "Reset all progress for Atharv?\n\n" +
    "This deletes every attempt, test score, badge, streak, chat message and weekly note, " +
    "and sets his XP back to zero.\n\n" +
    "The timetable and the question bank stay. This cannot be undone.");
  if (!first) return;

  const word = prompt("Type RESET (in capitals) to confirm.");
  if (word !== "RESET") { $("resetMsg").textContent = "Nothing was deleted."; return; }

  const { data, error } = await sb.rpc("reset_progress", { p_confirm: "RESET" });
  if (error) { $("resetMsg").textContent = error.message; return; }
  $("resetMsg").textContent =
    `Done. ${data.attempts} attempts, ${data.tests} tests, ${data.badges} badges and ` +
    `${data.sessions} sessions removed. XP back to zero.`;
  await goParent();
}

async function parentWeekly() {
  openParentChat();
  pBubble("me", "Give me this week's summary.");
  pBubble("think", "…");
  const { data, error } = await sb.functions.invoke("coach-chat", { body: { mode: "parent-weekly" } });
  document.querySelector("#pchatWrap .msg.think")?.remove();
  const said = data?.reply ?? data?.say ?? "";
  if (said) keepChat("coach", said, "parent");
  pBubble("coach", error || data?.error ? "The coach is unavailable right now." : data.reply);
}

/* ------------------------------------------------------------- landing -- */
function goHome() {
  if (S.isParent) return goParent();
  return goLanding();
}

/* picking up exactly where he stopped */
function resumeSession() {
  const st = restorableSession();
  if (!st) return false;
  S.restoring = true;
  S.track = st.track ?? S.track;
  S.chapter = st.chapter; S.workMode = st.workMode ?? "quest";
  S.script = st.script; S.si = st.si ?? 0; S.chat = st.chat ?? [];
  $("chatWrap").innerHTML = "";
  show("session");
  S.chat.forEach((m) => bubble(m.role === "atharv" ? "me" : "coach", m.text));
  if (S.si < S.script.length) {
    const step = S.script[S.si];
    if (step.type === "example") showExample(step.data); else showQuestion(step.data);
  } else {
    paintActions();
  }
  S.restoring = false;
  // a resumed chapter keeps its clock: it was already running when he left
  if (S.script?.length) startBudget(S.sitting?.minutes ?? 60);
  return true;
}

/* when the tab comes back into view, re-read whatever screen is showing.
   Nothing is cached in the page, so this is a re-read, not an invalidation. */
let lastRefresh = 0;
async function refreshVisible() {
  const now = Date.now();
  if (now - lastRefresh < 15000) return;         // at most once every fifteen seconds
  lastRefresh = now;
  try {
    if (S.isParent && !$("parent").classList.contains("hidden")) { await goParent(); return; }
    if (!$("track").classList.contains("hidden") && S.track) { await paintTrackCard(S.track); return; }
    if (!$("timetable").classList.contains("hidden")) { await openTimetable(); return; }
    if (!$("help").classList.contains("hidden")) { await loadTraining(); return; }
    if (!$("pchat").classList.contains("hidden")) { await loadChat("pchatWrap", true); return; }
  } catch (_) {}
}

document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshVisible(); });
window.addEventListener("focus", refreshVisible);

function goLanding() {
  show("landing");
  const c = S.ctx ?? {};
  $("hello").textContent = `Hello, ${c.name ?? "there"}`;
  const lane = S.plan.find((p) => p.lane !== "R");
  $("todayLine").textContent = lane
    ? `Today: ${lane.lane === "Q" ? "quest" : lane.lane === "M" ? "a test" : lane.lane === "D" ? "a drill" : lane.lane}${lane.chapter ? " · chapter " + lane.chapter : ""} · ${lane.minutes} minutes`
    : "Today: pick a topic, or let her choose — nothing is scheduled, so anything counts.";

  const readinessFor = (id) => {
    const t = TRACKS.find((x) => x.id === id);
    const want = (t ? (t.name || "") : id).toLowerCase();
    const hit = S.readiness.find((r) => (r.exam || "").toLowerCase().startsWith(want.slice(0, 4)));
    return hit ? hit.verdict : "no_content";
  };
  const words = { ready: "Enough to judge", too_early: "Just started", in_progress: "Building up",
                  thin: "Too few to judge", no_content: "No questions yet" };

  const fresh = {};
  (S.freshness ?? []).forEach((x) => { fresh[x.family] = x; });

  $("examCards").innerHTML = TRACKS.map((t) => {
    const v = readinessFor(t.id);
    return `<button class="exam" data-action="openTrack" data-a0="${t.id}">
      <h3>${t.name}</h3>
      <div class="school">${t.school}</div>
      <div class="state">
        <span class="pill ${v === "ready" ? "ok" : v === "no_content" ? "grey" : "amber"}">${words[v] ?? v}</span>
        ${freshPill(fresh[t.id])}
      <div class="sub" style="margin-top:8px">${t.note}</div></div>
    </button>`;
  }).join("");

  const f = S.ctx?.focus;
  if (f && $("focusLine")) {
    $("focusLine").textContent = f.primary_exam
      ? (f.primary_exam === "Olympiad"
          ? "This week Ananya is building technique — nothing is close yet."
          : `This week Ananya is working towards ${f.primary_exam} — its exam is the nearest one.`)
      : "";
  }

  $("coachLabel").textContent = `Your coach, ${COACH}`;
  askCoachWhatNow();

  const done = (c.today_attempts ?? []).length;
  const right = (c.today_attempts ?? []).filter((a) => a.ok).length;
  $("weekLine").textContent =
    `${done ? `${done} answered today, ${right} right` : "Nothing answered yet today"} · ` +
    `streak ${c.streak ?? 0} days · ${(c.xp ?? 0).toLocaleString()} XP`;
}

/* when he last worked on this exam: a fact, not a score */
function freshPill(f) {
  if (!f) return "";
  const word = f.state === "today" ? "practised today"
    : f.state === "yesterday" ? "practised yesterday"
    : f.state === "recent" ? `${f.days_since} days ago`
    : f.state === "slipping" ? `${f.days_since} days ago — slipping`
    : f.state === "cold" ? `${f.days_since} days ago — cold`
    : "not started";
  const cls = f.state === "today" || f.state === "yesterday" ? "ok"
    : f.state === "recent" ? "amber"
    : f.state === "slipping" || f.state === "cold" ? "red" : "grey";
  return `<span class="pill ${cls}" style="margin-left:6px">${esc(word)}</span>`;
}

async function askCoachWhatNow() {
  const say = $("coachSay"), go = $("coachGo");
  const f = S.ctx?.focus;
  if (f && $("focusLine")) {
    $("focusLine").textContent = f.primary_exam
      ? (f.primary_exam === "Olympiad"
          ? "This week Ananya is building technique — nothing is close yet."
          : `This week Ananya is working towards ${f.primary_exam} — its exam is the nearest one.`)
      : "";
  }

  $("coachLabel").textContent = `Your coach, ${COACH}`;
  say.textContent = "Thinking about today…";
  go.disabled = true;
  const { data, error } = await sb.functions.invoke("coach-chat", { body: { mode: "decide", track: S.track } });
  if (error || data?.error || !data?.plan) {
    // fall back to the timetable rather than leaving him with nothing
    const lane = (S.plan ?? []).find((p) => p.lane !== "R");
    S.planAction = lane
      ? { action: lane.lane === "M" ? (lane.chapter ? "quiz" : "paper") : lane.lane === "D" ? "drill" : "quest",
          chapter: lane.chapter ?? null, minutes: lane.minutes ?? 30 }
      : { action: "quest", chapter: null, minutes: 30 };   // no rest days: an unplanned day is still a day to work
    say.textContent = lane
      ? `Today is ${S.planAction.action === "quest" ? "a quest on chapter " + lane.chapter : S.planAction.action}. Ready?`
      : "Nothing is scheduled today. Say the word and we start — a chapter, a drill, or a paper.";
  } else {
    S.planAction = data.plan;
    say.textContent = data.reply;
  }
  $("coachWhy").textContent = `${S.planAction.action === "paper" ? "A full paper" : S.planAction.action === "quiz" ? "A chapter quiz" : S.planAction.action === "drill" ? "Drill on what you got wrong" : "Chapter " + S.planAction.chapter} · about ${S.planAction.minutes} minutes`;
  go.disabled = false;
  const { data: openP } = await sb.rpc("open_paper").catch(() => ({ data: null }));
  if (openP && (openP.items ?? []).length) {
    go.textContent = "Resume the paper you stopped →";
    go.dataset.mode = "paper";
    S.openPaper = openP;
    $("coachWhy").textContent = `${openP.items.length} questions · ${openP.kind}`;
    go.disabled = false;
    return;
  }

  const half = restorableSession() && !S.ctx?.placement_due;
  go.textContent = half ? "Resume where you left off →"
    : S.planAction.action === "rest" ? "Nothing to start" : "Start →";
  go.dataset.mode = half ? "resume" : "plan";
}

async function checkReset() {
  const { data: ctx } = await sb.rpc("coach_context");
  const stamp = ctx?.reset_at ?? null;
  let last = null;
  try { last = localStorage.getItem("quest.resetAt"); } catch (_) {}
  if (stamp && stamp !== last) {
    clearSession();
    try { localStorage.setItem("quest.resetAt", stamp); } catch (_) {}
    return true;
  }
  return false;
}

function runCoachPlan() {
  if (S.openPaper) { S.openPaper = null; return resumePaper(); }   // a stopped paper comes first
  if (restorableSession()) return resumeSession();     // never throw away a half-finished session
  const p = S.planAction;
  if (!p) return;
  if (p.action === "mock") return startMock();
  if (p.action === "placement") return startPlacement();
  if (p.action === "paper") return startTest(null, 60);
  if (p.action === "quiz") return startTest(p.chapter || currentChapter(), 20);
  if (p.action === "drill") return startSession(null, "drill");
  if (p.action === "rest") return;
  return startSession(p.chapter || null);
}



async function openDash() {
  show("dash");
  {
    const { data: trD } = await sb.rpc("truth");
    S.TR = trD ?? S.TR;
  await ensureExamCounts();
    const j = trD?.journey ?? S.TR?.journey ?? null;
    if ($("dashFlight")) $("dashFlight").innerHTML = journeyChart(j);
  }
  const { data, error } = { data: (S.TR ?? {}).progress ?? null, error: null };   // dashboard is its own read
  if (error || !data) { $("dashHead").textContent = "Could not load the numbers."; return; }
  const d = data;
  const behind = (d.planned_questions || 0) - (d.done_questions || 0);
  $("dashHead").textContent = `Day ${d.days_in} · ${d.chapters_mastered} of 24 chapters mastered`;
  $("dashSub").textContent = behind > 10
    ? `${behind} questions behind the plan — not a crisis, but worth a longer session.`
    : behind < -10
      ? `${-behind} questions ahead of the plan.`
      : "On plan.";

  const pct = Math.max(0, Math.min(100, Math.round(100 * (d.done_questions || 0) / Math.max(1, d.planned_questions || 1))));
  $("planBar").innerHTML = barRow("Questions done", `${d.done_questions} of ${d.planned_questions}`, pct, "var(--acc)");

  const started = d.chapters_started || 0, cleared = d.chapters_cleared || 0, mastered = d.chapters_mastered || 0;
  $("chapBar").innerHTML =
    barRow("Mastered", `${mastered}`, Math.round(mastered / 24 * 100), "var(--ok)") +
    barRow("Cleared", `${cleared}`, Math.round(cleared / 24 * 100), "#7fc3a3") +
    barRow("Started", `${started}`, Math.round(started / 24 * 100), "var(--acc)");

  const words = { ready: "enough to judge", too_early: "just started", in_progress: "building up",
                  thin: "too few to judge", no_content: "no questions yet" };
  $("examBars").innerHTML = (d.exams || []).map((e) => {
    const p = Math.min(100, e.items ? Math.round(100 * e.practised / e.items) : 0);
    return barRow(`${esc(e.exam)} · ${e.items} loaded`, `${e.practised} practised · ${e.mastered} mastered · ${words[e.verdict] ?? e.verdict}${e.verdict === "thin" ? ` (${e.items} of 30)` : ""}`, p,
      e.verdict === "ready" ? "var(--ok)" : e.verdict === "in_progress" ? "var(--acc)" : "var(--amber)");
  }).join("") || `<div class="sub">No exams registered.</div>`;

  const weeks = d.weeks || [];
  $("weekBars").innerHTML = `<div style="display:flex;gap:10px;align-items:flex-end;height:110px">` +
    weeks.map((w) => {
      const h = Math.max(4, Math.round((w.accuracy || 0) * 0.9));
      return `<div style="flex:1;text-align:center">
        <div style="height:${h}px;background:${w.attempts ? "var(--acc)" : "#e6e6ef"};border-radius:6px 6px 0 0"></div>
        <div class="sub" style="font-size:11.5px;margin-top:4px">${(w.accuracy || 0)}%</div>
        <div class="sub" style="font-size:11px">${w.attempts || 0}q</div>
      </div>`;
    }).join("") + `</div><div class="sub" style="margin-top:8px">Accuracy each week, oldest on the left.</div>`;
}

function barRow(label, value, pct, colour) {
  return `<div style="margin:10px 0">
    <div style="display:flex;justify-content:space-between;font-size:14px"><b>${label}</b><span class="sub">${value}</span></div>
    <div style="height:9px;background:#ececf5;border-radius:999px;overflow:hidden;margin-top:5px">
      <div style="height:100%;width:${pct}%;background:${colour};border-radius:999px"></div>
    </div></div>`;
}



/* --------------------------------------------------------------- track -- */
/* the uploaded papers for this exam, and a way to read them */
/* readiness per section, not one number for the whole thing */

/* what has arrived for this exam lately, and how long ago */
/* two kinds of tab: what you uploaded, and what she wrote. Each shows attempted against new. */
async function loadWhatsNew(family) {
  const card = $("genCard"), box = $("genList");
  if (!card || !box) return;

  const { data } = await sb.rpc("tabs_view", { p_exam: family });
  const all = (data ?? []);
  if (!all.length) { card.style.display = "none"; return; }
  card.style.display = "";
  S.tabs = all;

  // exactly two numbers: not attempted, and attempted
  const tabCard = (t) => {
    const f = tabFacts(t, "child");
    return `
    <button class="tabCard" data-action="openTab" data-a0="${t.chapter}" data-a1="${esc(t.title)}" data-a2="child"
      style="flex:0 0 190px;text-align:left;border:1px solid var(--line);border-radius:12px;padding:11px 12px;background:#fff">
      <div style="font-weight:600;font-size:13px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
        ${esc(t.title)}</div>
      <div class="chipRow" style="margin-top:8px">
        <span class="chip grey">${esc(f.first)}</span>
        <span class="chip ${f.done ? "green" : "grey"}">${esc(f.second)}</span>
      </div>
    </button>`;
  };

  const uploads = all.filter((t) => t.kind === "upload");
  const made = all.filter((t) => t.kind === "generated");

  box.innerHTML = `
    <div class="sub" style="margin:2px 0 6px;font-weight:600">Your files</div>
    <div style="display:flex;gap:10px;overflow-x:auto;padding:0 2px 10px">
      ${uploads.length ? uploads.map(tabCard).join("") : `<div class="sub">Nothing uploaded for this exam yet.</div>`}
    </div>
    <div class="sub" style="margin:6px 0;font-weight:600">Quest generated</div>
    <div style="display:flex;gap:10px;overflow-x:auto;padding:0 2px 10px">
      ${made.length ? made.map(tabCard).join("") : `<div class="sub">She has not written anything for this exam yet.</div>`}
    </div>
    <div id="tabDetail" style="margin-top:8px"></div>`;
}

/* ONE definition of what a tab says. His screen counts what he can do; the parent's counts what exists. */
function tabFacts(t, audience) {
  const child = audience === "child";
  const total = child ? Number(t.servable ?? 0) : Number(t.questions ?? 0);
  const done = Number(t.attempted ?? 0);
  const pending = Math.max(0, total - done);
  return {
    total,
    done,
    pending,
    first: `${pending} ${child ? "to do" : "not attempted"}`,
    second: `${done} ${child ? "done" : "attempted"}`,
    empty: child ? "Nothing to do here yet." : "Nothing servable in this tab yet.",
    showing: (n) => `Showing ${n} of ${total}`,
  };
}

/* what is inside a tab, and the one button that opens it for him */
async function openTab(n, title, audience) {
  const box = $("tabDetail");
  if (!box) return;
  const t = (S.tabs ?? []).find((x) => Number(x.chapter) === Number(n)
        && (!title || String(x.title) === String(title))) ?? {};

  // the clicked card turns orange, and only one at a time
  document.querySelectorAll(".tabCard").forEach((el) => {
    const on = el.dataset.a0 === String(n) && (!title || el.dataset.a1 === String(title));
    el.style.borderColor = on ? "#f0a15a" : "var(--line)";
    const name = el.querySelector("div");
    if (name) name.style.color = on ? "#c2691a" : "";
  });

  box.innerHTML = `<div class="sub">Opening…</div>`;
  const { data } = await sb.rpc("tab_questions", { p_chapter: Number(n), p_limit: 12 });
  const rows = data ?? [];
  const f = tabFacts(t, audience ?? (S.isParent ? "parent" : "child"));
  const total = f.total || rows.length;
  const shown = rows.length;

  box.innerHTML = `
    <div class="card" style="box-shadow:none;border:1px solid var(--line);padding:12px">
      <div style="font-weight:600;color:#c2691a">${esc(t.title ?? "this tab")}</div>
      ${shown < total ? `<div class="sub" style="margin-bottom:6px">${esc(f.showing(shown))}</div>` : ""}
      <div style="max-height:220px;overflow:auto">
        ${rows.map((q, i) => `<button class="qRow" data-action="startChapter" data-a0="${Number(n)}"
            title="Start here — she picks up from this question"
            style="display:block;width:100%;text-align:left;border:0;background:#fff;border-bottom:1px solid var(--line);padding:9px 0">
          <span class="sub">${i + 1}. ${esc(q.prompt)}${q.has_figure ? " · has a figure" : ""}</span>
        </button>`).join("")
          || `<div class="sub">${esc(f.empty)}</div>`}
      </div>
      <div class="bar" style="margin-top:10px">
        <button class="go small" data-action="startChapter" data-a0="${Number(n)}">Open this for him →</button>
      </div>
    </div>`;
}

async function openPaper(id) {
  const { data: row } = await sb.from("papers").select("*").eq("id", id).maybeSingle();
  if (!row) return;
  show("paper");
  $("paperTitle").textContent = row.title;
  $("paperPages").innerHTML = `<div class="sub">Opening…</div>`;

  let blob = null;
  if (row.path) {
    const dl = await sb.storage.from("papers").download(row.path);
    blob = dl.data ?? null;
  }
  if (!blob) {
    // no storage copy: rebuild it from the original in the database
    const { data: b64 } = await sb.rpc("upload_bytes", { p_id: row.id });
    if (b64) {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      blob = new Blob([bytes], { type: row.mime || "application/pdf" });
    }
  }
  if (!blob) { $("paperPages").innerHTML = `<div class="sub">Could not open that file.</div>`; return; }

  if ((blob.type || "").includes("pdf") || row.path.toLowerCase().endsWith(".pdf")) {
    try {
      const pages = await pdfToImages(blob, 40);
      $("paperPages").innerHTML = pages.map((p, i) =>
        `<div class="paperPage"><div class="k">page ${i + 1}</div><img src="${URL.createObjectURL(p)}" alt="page ${i + 1}"></div>`).join("");
    } catch (e) {
      $("paperPages").innerHTML = `<div class="sub">Could not read that PDF: ${esc(e.message)}</div>`;
    }
  } else {
    $("paperPages").innerHTML = `<div class="paperPage"><img src="${URL.createObjectURL(blob)}" alt="page"></div>`;
  }
}

/* the exam as a card: same shape as the Timetable, on the child's screen too */
async function paintTrackCard(id) {
  const box = $("trackCard");
  if (!box) return;
  box.innerHTML = `<div class="card"><div class="sub">One moment…</div></div>`;

  const fam = (TRACKS.find((t) => t.id === id) ?? {});
  const { data: tr } = await sb.rpc("truth");
  const mine = (tr?.families ?? []).find((x) =>
    String(x.label ?? "").toLowerCase() === String(fam.name ?? "").toLowerCase());
  const spec = (tr?.specs ?? []).filter((x) => x.family === (mine?.label ?? fam.name));
  const topics = mine?.topics ?? [];

  const SOURCE_SECTION = {
    edutest: "Numerical reasoning", elms: "Mathematics", aas: "Mathematics",
    icas: "Whole paper", amc: "Whole paper", book: "Each contest", apsmo: "Each contest",
  };

  const all = topics ?? [];
  const done = mine?.topics_done ?? 0, total = mine?.topics_all ?? all.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const verdict = mine?.verdict === "needs work" ? "needs work" : done > 0 ? "on track" : "not started";
  const vcls = mine?.verdict === "needs work" ? "red" : done > 0 ? "green" : "grey";

  const topicLine = (t) => {
    const has = (t.questions ?? 0) > 0;
    return `<div class="ttRow" ${has ? `data-action="openChapter" data-a0="${t.n}" style="cursor:pointer"` : ""}>
      <span class="dot ${t.preparedness >= 60 ? "green" : t.preparedness > 0 ? "amber" : "grey"}"></span>
      <span class="ttTopic">${esc(String(t.title).split(" · ").pop())}
        <span class="sub">${has ? `${t.questions} questions` : "no questions yet"}</span></span>
      <span class="ttTarget">${has ? (t.tried ? `${t.correct}/${t.tried} right` : "not tried") : ""}</span>
      <span class="bar2" style="width:80px"><i style="width:${t.preparedness}%"></i></span>
    </div>`;
  };

  const paper = spec.map((y) => {
    const sections = (y.sections ?? []).map((sec) => {
      const isFirst = (y.sections ?? [])[0]?.part === sec.part;
      let own = all.filter((t) => (SOURCE_SECTION[t.source] ?? "Whole paper") === sec.part);
      if (!own.length && isFirst) {
        const claimed = new Set((y.sections ?? []).map((z) => z.part));
        own = all.filter((t) => !claimed.has(SOURCE_SECTION[t.source] ?? "Whole paper"));
      }
      const official = sec.topics ?? [];
      return `<div class="secBlock">
        <div class="secLine">
          <span class="secName">${esc(sec.part)}</span>
          <span class="secMin">${sec.minutes} min</span>
          <span class="secQ">${own.filter((t) => (t.questions ?? 0) > 0).length ? `${own.reduce((a, t) => a + (t.questions ?? 0), 0)} q` : "no questions"}</span>
          <span class="secTopics"></span><span class="bar2 secBar"></span>
        </div>
        ${official.length ? `<div class="secChips">${official.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>` : ""}
        ${own.length ? `<div class="secRows">${own.map(topicLine).join("")}</div>` : ""}
      </div>`;
    }).join("");
    return `<details class="ttMore"><summary>${esc(y.sits)} — ${y.minutes} min in the exam</summary>
      <div class="ttFormat"><b>${esc(y.timing ?? "")}</b>${y.breaks ? ` · ${esc(y.breaks)}` : ""}</div>
      ${sections}</details>`;
  }).join("");

  const when = mine?.exam_on
    ? new Date(mine.exam_on).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
    : "no date";

  const noQuestions = !all.some((t) => (t.questions ?? 0) > 0);

  box.innerHTML = `<div class="card ttExam">
    <div class="ttHead">
      <span class="ttName">${esc(fam.name ?? "")}</span>
      <span class="pill ${vcls}">${esc(verdict)}</span>
      <span class="ttMeta">${esc(when)}${mine?.days_left !== null && mine?.days_left !== undefined ? ` · ${mine.days_left} days` : ""}</span>
      <span class="ttMeta" style="margin-left:auto">${done} of ${total} topics</span>
    </div>
    <div class="bar2" style="margin:8px 0 4px"><i style="width:${pct}%"></i></div>
    <details class="ttMore"><summary>the paper and the topics</summary>
      <div style="margin-top:6px">${paper}</div>
    </details>
    ${noQuestions ? `<div class="hint" style="margin-top:10px">No questions in here yet. <b>Ask Ananya</b> for some —
      say “can I have more questions” and she will write them for this exam.</div>` : ""}
    <div class="bar" style="margin-top:10px">
      ${S.ctx?.mock?.due ? `<button class="go small" data-action="startMock">Paper is due — sit it</button>` : ""}
    </div>
  </div>`;
}

async function openTrack(id) {
  S.track = id;
  paintExamTag("track");
  S.shelf = "book";
  show("track");
  if (!S.restoring) saveRoute();
  $("trackStats").textContent =
    `${(S.ctx?.xp ?? 0).toLocaleString()} XP · streak ${S.ctx?.streak ?? 0} days · ` +
    `day ${S.ctx?.days_in ?? 1} of the programme`;

  paintTrackCard(id);
  loadWhatsNew(id);
}





/* one mock, shaped like the real thing for that exam */
/* the chapter quiz comes when the chapter is done and done well, not on a streak */
async function quizReady(chapter) {
  const { data } = await sb.rpc("chapter_ready_for_quiz", { p_chapter: chapter });
  return data ?? { ready: false, why: "no answer yet" };
}

async function startMock() {
  const id = S.track;
  let body;
  if (id === "olympiad") {
    const { data } = await sb.from("chapters").select("n").eq("source", "apsmo");
    const chs = (data ?? []).map((c) => c.n);
    if (!chs.length) { alert("No contest questions loaded yet."); return; }
    body = { p_kind: "mock", p_chapters: chs, p_count: 5, p_minutes: 30, p_pass: 60 };
  } else if (id === "amc") {
    const { data } = await sb.from("chapters").select("n").eq("source", "amc");
    const chs = (data ?? []).map((c) => c.n);
    if (!chs.length) {
      // no AMC papers yet: build the paper from the coach's own questions, and say so plainly
      body = { p_kind: "mock", p_chapters: Array.from({ length: 24 }, (_, i) => i + 1), p_count: 30, p_minutes: 60, p_pass: 60 };
      await runExam(body, "AMC-style paper · 30 questions, 60 minutes · written by the coach");
      return;
    }
    body = { p_kind: "mock", p_chapters: chs, p_count: 30, p_minutes: 60, p_pass: 60 };
  } else {
    const { data: shared } = await sb.rpc("chapters_for_exam", { p_exam: id });
    let chs = (shared ?? []).filter((n) => typeof n === "number");
    if (!chs.length) {
      const { data } = await sb.from("chapters").select("n").eq("source", id);
      chs = (data ?? []).map((c) => c.n);
    }
    if (!chs.length) { alert("Nothing uploaded for this exam yet — add questions first."); return; }
    const shape = id === "icas" ? { p_count: 40, p_minutes: 60 }
                : id === "elms" ? { p_count: 30, p_minutes: 45 }
                : { p_count: Math.min(30, chs.length * 5), p_minutes: 45 };
    body = { p_kind: "mock", p_chapters: chs, p_pass: 60, ...shape };
  }
  const label = id === "olympiad" ? "Olympiad contest mock · 5 questions, 30 minutes"
    : id === "amc" ? "AMC paper · 30 questions, 60 minutes"
    : id === "icas" ? "ICAS paper · 40 questions, 60 minutes"
    : id === "elms" ? "ELMS paper · 30 questions, 45 minutes"
    : "Mock test";
  await runExam(body, label);
}


async function openChapter(n) {
  show("chapter");
  S.chapter = n;
  saveRoute();
  sb.rpc("log_visit", { p_chapter: n, p_source: "book" });
  const { data: c } = await sb.from("chapters").select("*").eq("n", n).single();
  const { data: note } = await sb.from("chapter_notes").select("*").eq("chapter", n).maybeSingle();
  const { data: exs } = await sb.from("examples").select("*").eq("chapter", n).order("n");
  S.chapterTitle = c?.title ?? "";
  $("chNum").textContent = `Chapter ${n} · book pages ${c?.pages ?? "—"}`;
  $("chTitle").textContent = c?.title ?? "";
  const tricks = note?.tricks ?? [];
  $("chIntro").textContent = tricks.length
    ? `${tricks.length} ${tricks.length === 1 ? "idea" : "ideas"} to take away. Tap an example to see it on the page.`
    : "";
  $("chTricks").innerHTML = tricks.length
    ? tricks.map((k, i) => `
      <div class="trick">
        <div class="tn">${i + 1}</div>
        <div>
          <div class="tt">${esc(k.t)}</div>
          <div class="tp">${esc(k.p)}</div>
          <div class="te">${esc(k.e)}</div>
        </div>
      </div>`).join("")
    : `<div class="sub">Notes for this chapter are still being written.</div>`;
  $("chSummary").textContent = note?.summary ?? "";
  $("chMore").style.display = note?.summary ? "" : "none";
  $("chExamples").innerHTML = (exs ?? []).map((e) => `
    <div class="ex" data-action="toggleOpen">
      <b>Example ${e.n}</b> · <span class="sub">tap to see the method</span>
      <div style="margin-top:6px">${esc(e.prompt)}</div>
      <div class="sol">${esc(e.solution)}</div>
    </div>`).join("") || `<div class="sub">No worked examples in this chapter — it goes straight to questions.</div>`;
}


/* straight into the questions: the coach reads the results afterwards */
/* the clock the teacher sets for the session */
function startBudget(mins) {
  clearInterval(S.budgetTimer);
  const total = Math.max(5, Number(mins) || 30) * 60;
  let left = total;
  const bar = $("budgetBar");
  if (!bar) return;
  bar.classList.remove("hidden");
  const sit = S.sitting;
  $("budgetLabel").textContent = sit
    ? `This session: ${sit.minutes} minutes · chapter ${sit.chapter}` +
      (sit.parts > 1 ? ` · part ${sit.part} of ${sit.parts}` : "") +
      (sit.topup_questions ? ` · then ${sit.topup_questions} from chapter ${sit.topup_chapter}` : "")
    : `Your time for this session · ${mins} minutes`;
  const tick = () => {
    const m = Math.floor(left / 60), sec = left % 60;
    $("budgetClock").textContent = `${m}:${String(sec).padStart(2, "0")}`;
    bar.classList.toggle("low", left <= 300);
    if (left <= 0) {
      clearInterval(S.budgetTimer);
      bubble("coach", "Time is up for today. Put the pencil down and tell me how far you got.");
      return;
    }
    left--;
  };
  tick();
  S.budgetTimer = setInterval(tick, 1000);
}

async function startSolo(chapterArg) {
  paintExamTag("session");
  const chapter = chapterArg ?? S.chapter;
  if (!chapter) { alert("Open a chapter first, then press Practise."); return; }
  if (S.chapter && chapter !== S.chapter) clearSession();   // a new topic, a fresh page
  sb.rpc("log_visit", { p_chapter: chapter, p_source: "solo-practice" });
  S.workMode = "solo";
  S.chat = []; S.qs = []; S.i = 0;
  $("chatWrap").innerHTML = "";
  show("session");
  paintActions();
  S.chapter = chapter;
  await planSitting(60);
  startBudget(S.sitting?.minutes ?? 60);
  try {
    await buildScript({ lane: "Q", target_questions: S.sitting?.questions ?? 8 }, null);
  } catch (e) {
    bubble("coach", "Something went wrong loading the questions: " + e.message);
    return;
  }
  if (!S.script.length) {
    bubble("coach", "Nothing left in this chapter — every question is answered. Take the quiz, or pick another chapter.");
    const nx = document.createElement("div");
    nx.className = "qcard";
    nx.innerHTML = `<div class="bar">
      <button class="go small" data-action="startQuiz">Chapter quiz</button>
      <button class="ghost small" data-action="openTrack" data-a0="${S.track}">Pick another chapter</button></div>`;
    $("chatWrap").appendChild(nx);
    return;
  }
  nextStep();
}

/* ----------------------------------------------------------- the session - */
/* whatever the server sends, never put a raw JSON blob in front of him */
function cleanCoachText(text) {
  const t = String(text ?? "");
  if (!/\{\s*"?(say|speak|log)"/.test(t)) return t;
  const m = /"say"\s*:\s*"([\s\S]*?)"\s*(?:,\s*"(?:speak|log)"|\})/.exec(t);
  if (m) return m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').trim();
  return t.replace(/\{.*\}/s, "").trim() || "…";
}

/* follow the newest message only if he is already at the bottom */
function stickBottom() {
  // whichever conversation is on screen — his or the parent's
  const parentOpen = $("pchat") && !$("pchat").classList.contains("hidden");
  const box = parentOpen ? $("pchatWrap") : $("chatWrap");
  if (!box) return;
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
  if (near || S.forceScroll) box.scrollTop = box.scrollHeight;
  S.forceScroll = false;
}

/* a coach message with "- " lines becomes a proper list, with room between points */
function formatCoachHtml(text) {
  const lines = String(text ?? "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return "";
  const out = [];
  let list = [];
  const flush = () => {
    if (!list.length) return;
    out.push(`<ul class="msgList">${list.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`);
    list = [];
  };
  lines.forEach((l) => {
    const bullet = l.match(/^[-•*]\s+(.*)$/);
    if (bullet) { list.push(bullet[1]); return; }
    flush();
    out.push(`<p class="msgP">${esc(l)}</p>`);
  });
  flush();
  return out.join("");
}

function bubble(role, text, spoken) {
  if (role === "coach") text = cleanCoachText(text);
  const d = document.createElement("div");
  d.className = "msg " + role;
  d.innerHTML = role === "coach" ? (formatCoachHtml(text) || esc(text)) : esc(text);


  $("chatWrap").appendChild(d);
  stickBottom();
  return d;
}

let replySpoken = "";

async function callCoach({ mode, note }) {
  const history = S.chat.slice(-10).map((m) => ({ role: m.role, content: m.text }));
  const { data, error } = await sb.functions.invoke("coach-chat", {
    body: { mode, track: S.track, chapter: S.chapter, messages: history, note,
            hasAttach: typeof S.canAttach === "boolean" ? S.canAttach : true,
            onScreen: S.onScreen ?? null },
  });
  if (error) return null;
  if (data?.error) return null;
  replySpoken = data?.speak ?? "";
  window.__lastTitle = data?.title ?? "";
  return data?.reply ?? null;
}

/* which chapter a non-book exam starts from */
async function pickChapterForTrack() {
  if (S.track === "olympiad" || S.track === "amc") return null;
  const { data } = await sb.from("chapters").select("n").eq("source", S.track).order("n");
  return data && data.length ? data[0].n : null;
}

async function startSession(chapterOverride, forceMode, mode) {
  S.workMode = mode === "solo" ? "solo" : "quest";
  if (mode === "solo") return startSolo(chapterOverride);
  S.chat = []; S.qs = []; S.i = 0; S.nudged = 0;
  $("chatWrap").innerHTML = "";
  show("session");

  // a check-in is not a lesson: on that day we do one thing, and it is the check-in
  if (S.ctx?.placement_due && !chapterOverride) {
    bubble("me", "hi");
    S.chat.push({ role: "atharv", text: "hi" });
    const th = bubble("think", "…");
    const hello = await callCoach({ mode: "greet", note: "He has just said hi. Today is his first day: greet him and say we will find out where he is. Do not set a question." });
    th.remove();
    bubble("coach", hello ?? `Hi Atharv, it's ${COACH}. Today we find out where you are.`);
    if (hello) S.chat.push({ role: "coach", text: hello });
    const card = document.createElement("div");
    card.className = "qcard";
    card.innerHTML = `<div class="q" style="font-size:16px">Ready for the check-in?</div>
      <div class="sub" style="margin:2px 0 8px">It shows me where to start you. Nothing to worry about.</div>
      <div class="bar"><button class="go small" data-action="startPlacement">Check where I am</button>
      <button class="ghost small" data-action="goLanding">Not now</button></div>`;
    $("chatWrap").appendChild(card);
    S.chapter = null; S.script = null;
    paintActions();
    return;
  }

  const planned = S.planAction?.minutes ?? (S.plan.find((p) => p.lane !== "R")?.minutes) ?? 60;
  const mins = Math.max(60, planned);        // a sitting is an hour unless the plan asks for more
  await planSitting(mins);

  const lane = S.plan.find((p) => p.lane !== "R");
  const bankChapter = await pickChapterForTrack();
  S.chapter = chapterOverride ?? bankChapter ?? lane?.chapter ?? null;
  if (!S.chapter) {
    const { data: map } = await sb.from("v_chapter_map").select("chapter,status").order("chapter");
    const open = (map ?? []).filter((c) => c.status !== "not_started");
    S.chapter = open.length ? open[open.length - 1].chapter : 1;
  }

  // the conversation is kept: show what was said before she speaks again
  try {
    const { data: tr0 } = await sb.rpc("truth");
    const past = tr0?.chat ?? [];
    if (past.length) {
      past.slice(-30).forEach((m) => bubble(m.role === "atharv" ? "me" : "coach", m.body));
      S.chat = past.slice(-30).map((m) => ({ role: m.role, text: m.body }));
    }
  } catch (_) {}

  // the tap itself says hi, and that is what makes her start talking
  bubble("me", "hi");
  S.chat.push({ role: "atharv", text: "hi" });

  const think = bubble("think", "…");
  const greet = await callCoach({
    mode: "greet",
    note: mode === "solo"
      ? "He has just said hi, and he chose this chapter himself rather than following the plan. Acknowledge that and open the session."
      : "He has just said hi, and you have your history with him in the facts. Pick up where you left off: if a chapter or paper was finished last time, say what was done and what is next; if he stopped partway, say you can see that. Never open as if you had never met him.",
  });
  think.remove();
  bubble(
    "coach",
    greet ?? `Hi Atharv, it's ${COACH}. Today we are on chapter ${S.chapter}. Ready?`,
    replySpoken
  );
  if (greet) S.chat.push({ role: "coach", text: greet });

  // the clock belongs to the chapter: it starts when he starts, not when the screen opens
  $("budgetBar")?.classList.add("hidden");
  const card = document.createElement("div");
  card.className = "qcard";
  card.id = "startBar";
  card.innerHTML = `<div class="q" style="font-size:16px">Chapter ${S.chapter ?? ""} — shall we start?</div>
    <div class="sub" style="margin:2px 0 8px">Your ${S.sitting?.minutes ?? mins} minutes start when you tap.</div>
    <div class="bar"><button class="go small" data-action="beginNow">Start this →</button></div>`;
  $("chatWrap").appendChild(card);
  paintActions();
}

/* he said go: the clock starts here, and so does the work */
async function beginNow() {
  document.getElementById("startBar")?.remove();
  startBudget(S.sitting?.minutes ?? 60);
  await beginWork();
}

async function beginWork() {
  const p = S.pendingStart ?? { lane: (S.plan ?? []).find((x) => x.lane !== "R"), forceMode: null };
  S.pendingStart = null;
  document.getElementById("startBar")?.remove();
  await buildScript(p.lane, p.forceMode);
  if (!S.script.length) {
    bubble("coach", "There is nothing left to do in this chapter — every question is answered. Take the quiz, or move on.");
    return;
  }
  nextStep();
}

/* how this hour is spent: what fits, whether it is part of a chapter, and what
   fills the tail if the chapter is nearly done */
async function planSitting(minutes) {
  const { data } = await sb.rpc("sitting_plan", { p_minutes: minutes ?? 60 });
  S.sitting = data ?? null;
  return S.sitting;
}

async function buildScript(lane, forceMode) {
  const { data: exs } = await sb.from("examples").select("*").eq("chapter", S.chapter).order("n");

  let { data: qs } = forceMode === "drill"
    ? await sb.rpc("due_reviews", { p_count: 6 })
    : await sb.rpc("next_in_chapter", { p_chapter: S.chapter, p_count: lane?.target_questions || 4 });

  // fewer than three left? ask for more, in his own difficulty, then read again
  if (forceMode !== "drill" && (qs ?? []).length < 3) {
    const t = bubble("think", "Setting you a few more of these…");
    try {
      await sb.functions.invoke("make-questions", { body: { chapter: S.chapter, count: 6 } });
      const again = await sb.rpc("next_in_chapter", { p_chapter: S.chapter, p_count: lane?.target_questions || 4 });
      qs = again.data ?? qs;
    } catch (_) { /* keep what we have */ }
    t.remove();
  }

  S.script = [
    ...(forceMode === "drill" ? [] : (exs ?? [])).map((e) => ({ type: "example", data: e })),
    ...(qs ?? []).map((q) => ({ type: "question", data: q })),
  ];

  // if the chapter is nearly done, the rest of the hour goes to the next one
  if (S.sitting?.topup_chapter && S.sitting?.topup_questions > 0) {
    const { data: extra } = await sb.rpc("next_in_chapter", {
      p_chapter: S.sitting.topup_chapter, p_count: S.sitting.topup_questions,
    });
    S.script.push(...(extra ?? []).map((q) => ({ type: "question", data: q })));
    S.topupFrom = S.sitting.topup_chapter;
  }
  S.si = 0;
}

function clearBoard() {
  S.onScreen = null;
  document.querySelectorAll(".qcard").forEach((n) => n.remove());
}

async function nextStep() {
  const step = S.script[S.si];      // the bug the click-through found: this was never defined
  clearBoard();
  saveSession();
  paintActions();
  // only questions that passed their check reach this point: the view serves nothing else
  if (step?.type === "question" && step.data && step.data.status === "failed") {
    S.si += 1;
    return nextStep();
  }

  if (S.si >= S.script.length) {
    bubble("coach", "That is the whole set done — well worked. Close the session below, or ask me anything about what we just did.");
    if (!S.boardShown) { S.boardShown = true; showBoardReminder(S.chapter).catch(() => {}); }
    const done = document.createElement("div");
    done.className = "qcard";
    done.innerHTML = `<div class="q" style="font-size:16px">What next?</div>
      <div class="bar">${S.returnToCoach
        ? `<button class="go small" data-action="backToCoach">Back to ${COACH} →</button>`
        : `<button class="go small" data-action="endSession">Pause session</button>`}
      <button class="ghost small" data-action="startSolo" data-a0="${S.chapter}">Another one</button>
      <button class="ghost small" data-action="openDash">See progress</button></div>`;
    $("chatWrap").appendChild(done);
    S.finished = true;
    saveSession();
    return;
  }
  if (step.type === "example") showExample(step.data);
  else showQuestion(step.data);
}

function showExample(e) {
  S.forceScroll = true;
  const el = document.createElement("div");
  el.className = "qcard";
  el.style.borderColor = "var(--line)";
  el.innerHTML = `
    <div class="n">WORKED EXAMPLE ${e.n} · ${S.si + 1} of ${S.script.length}</div>
    <div class="q">${esc(e.prompt)}</div>
    <div id="exFig"></div>
    <div class="bar">
      <button class="go small" id="exShow" data-action="revealExample">Show me how</button>
    </div>
    <div class="fb hidden" id="exSol" style="background:#f7f7fb;border:1px solid var(--line)">
      <b>How it goes</b>${rich(e.solution)}
    </div>
    <div class="bar hidden" id="exNext"><button class="go small" data-action="advance">Next →</button></div>`;
  $("chatWrap").appendChild(el);
  stickBottom();
  autoFigure("example", e.n, "exFig", e.prompt, e.diagram_svg);
}

function revealExample(btn) {
  btn.style.display = "none";
  $("exSol").classList.remove("hidden");
  $("exNext").classList.remove("hidden");
}

/* multiple choice: tap an option, then Check */
function paintOptions(q) {
  const box = $("qOpts");
  if (!box) return;
  const opts = Array.isArray(q.options) ? q.options : [];
  if (opts.length < 2) { box.innerHTML = ""; return; }
  box.innerHTML = opts.map((o, i) => {
    const letter = String(o).trim().match(/^([A-H])[).:\s]/i)?.[1] ?? String.fromCharCode(65 + i);
    const text = String(o).trim().replace(/^[A-H][).:\s]\s*/i, "");
    return `<button class="opt" data-letter="${letter}" data-full="${esc(String(o))}"
              data-action="pickOption"><b>${letter}</b><span>${esc(text)}</span></button>`;
  }).join("");
}

function pickOption(btn) {
  document.querySelectorAll("#qOpts .opt").forEach((b) => b.classList.remove("on"));
  btn.classList.add("on");
  const box = $("ans");
  if (box) box.value = btn.dataset.full || btn.dataset.letter;
  // choosing an option is answering: make that obvious
  const chk = $("chk");
  if (chk) { chk.disabled = false; chk.textContent = "Submit"; }
}

/* who sits this exam: the school, or the competition's own name */
/* the colour rule for a question count: none, some, enough — used by every card */
function toneForCount(n) {
  const v = Number(n ?? 0);
  return v === 0 ? "orange" : v < 30 ? "amber" : "green";
}

/* who sits this exam, and when: two schools are two sittings, never one date */
function sittingLine(f, fallbackWhen) {
  const label = String(f?.label ?? "");
  const fmt = (d) => d ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "";

  if (label === "Olympiad") return `APSMO Division J sits on ${fmt(f?.exam_on) || fallbackWhen}`;
  if (label === "AMC") return `The Australian Maths Competition sits on ${fmt(f?.exam_on) || fallbackWhen}`;
  if (label === "ICAS") return `The ICAS Mathematics paper sits on ${fmt(f?.exam_on) || fallbackWhen}`;

  const rows = (f?.schools_list ?? []).filter((r) => r.school);
  if (rows.length > 1) {
    return rows.map((r) => `${esc(r.school)} on ${fmt(r.sits_on) || "a date to be confirmed"}`).join(" · ");
  }
  if (rows.length === 1) return `${esc(rows[0].school)} sits on ${fmt(rows[0].sits_on) || fallbackWhen}`;
  return `${esc(String(f?.schools ?? "the school").replace(" + ", " and "))} sits on ${fallbackWhen}`;
}

/* a question that has not been cleared against official material is labelled as such */
function gateLabel(q) {
  const st = String(q?.status ?? q?.gate_state ?? "");
  const src = String(q?.source_ref ?? "").trim();
  const where = src ? `from ${src}` : "source not recorded";
  const tag = st === "cleared" ? "verified" : st === "provisional" ? "not verified"
    : st === "failed" ? "held back" : st === "draft" ? "to be verified" : "unchecked";
  return ` (${tag} · ${where})`;
}

/* a provisional question can be skipped: he should not be drilled on something unverified
   when something verified is available */
function skipButtonFor(q) {
  const st = String(q?.status ?? "");
  if (st !== "provisional") return "";
  return `<button class="ghost small" data-action="skipProvisional" data-a0="${q.chapter}" data-a1="${q.idx}"
    title="This one is not verified against official material yet. Skipping it swaps in a verified question if there is one.">Skip this one</button>`;
}


function showQuestion(q) {
  S.forceScroll = true;
  const el = document.createElement("div");
  el.className = "qcard";
  el.innerHTML = `
    <div class="n">CHAPTER ${q.chapter} · QUESTION ${q.idx} · ${S.si + 1} of ${S.script.length}</div>
    <div class="q">${esc(q.prompt)}${gateLabel(q)}</div>
    <div class="bar">${skipButtonFor(q)}</div>
    <div id="qFig"></div>
    <div id="qOpts" class="opts"></div>
    <div style="display:flex;gap:8px">
      <input id="ans" placeholder="Your answer" inputmode="none" autocomplete="off"
             readonly data-action="openPad" data-self="1" data-a1="num" onkeydown="if(event.key==='Enter')check()">
      <button class="go small" id="chk" data-action="check">Check</button>
    </div>
    <div class="timer" id="qtimer">0:00</div>
    <div id="qfb"></div>`;
  $("chatWrap").appendChild(el);
  stickBottom();
  paintOptions(q);
  autoFigure("question", q.idx, "qFig", q.prompt, q.diagram_svg, q)
    .then(() => { if (!$("qFig")?.innerHTML.trim()) pageCrop(q.chapter, q.idx, "qFig"); });
  S.startedAt = Date.now(); S.nudged = 0;
  S.onScreen = { chapter: q.chapter, idx: q.idx, prompt: q.prompt };
  S.qBudget = 150;
  sb.rpc("question_budget", { p_chapter: q.chapter, p_idx: q.idx }).then(({ data }) => {
    if (typeof data === "number" && data > 0) {
      S.qBudget = data ?? S.TR?.budget ?? 150;
      const t = $("qtimer");
      if (t && !$("qfb")?.textContent) t.dataset.budget = String(data);
      paintQuestionClock();
    }
  });
  clearInterval(S.ticker);
  S.ticker = setInterval(tickQuestion, 1000);
  setTimeout(() => $("ans")?.focus(), 250);
}

/* If he is stuck, she does not wait in silence and she does not hand over the
   answer. She asks him to talk while he works, and gives him one thing to think
   about. Three check-ins at most, each later than the last. */
const NUDGES = [
  { at: 1.0, said: () =>
    "You are taking your time, which is fine. Talk to me while you work — tap Talk and say what you are trying, out loud. Saying it usually shows you the next step." },
  { at: 1.8, said: (q) =>
    `Still on it. Three questions, answer any one out loud: What is it asking for? What do you already know? What is the first small thing you could work out?${q ? "" : ""}` },
  { at: 3.0, said: () =>
    "Do not sit and stare at it. Tell me the bit you are stuck on — the start, the middle, or the sum at the end — and I will take you from there. Or tap Photo and show me your working." },
];

/* the clock shows how long he has, not just how long he has taken */
function paintQuestionClock() {
  const el = $("qtimer");
  if (!el) return;
  const s = Math.floor((Date.now() - S.startedAt) / 1000);
  const budget = S.qBudget ?? 150;
  const mm = (x) => `${Math.floor(x / 60)}:${String(x % 60).padStart(2, "0")}`;
  el.textContent = `${mm(s)} / aim ${mm(budget)}`;
  el.title = "Your time on this question, and the aim for it — not the exam clock";
  el.classList.toggle("warn", s >= budget);
  el.classList.toggle("over", s >= budget * 2);
}

/* a small, soft beep — never loud, never repeated */
let audioCtx = null;
function beep(times = 1) {
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    audioCtx = audioCtx ?? new Ctor();
    if (audioCtx.state === "suspended") audioCtx.resume();
    for (let i = 0; i < times; i++) {
      const t0 = audioCtx.currentTime + i * 0.22;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, t0);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.06, t0 + 0.02);   // quiet: a nudge, not an alarm
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t0); osc.stop(t0 + 0.18);
    }
  } catch (_) { /* no sound is fine */ }
}

function tickQuestion() {
  const s = Math.floor((Date.now() - S.startedAt) / 1000);
  const el = $("qtimer");
  if (!el) { clearInterval(S.ticker); return; }
  paintQuestionClock();

  const n = S.nudged ?? 0;
  const step = NUDGES[n];
  const due = step && s >= Math.round(step.at * (S.qBudget ?? 150));
  if (due && !$("qfb")?.textContent) {
    S.nudged = n + 1;
    const b = bubble("coach", step.said());
    if (b) {
      const talk = document.createElement("button");
      talk.className = "go small";
      talk.style.cssText = "margin-top:10px;display:block";
      talk.textContent = "Talk to Ananya — I will answer as you think";
      talk.onclick = () => { startThinking(); talk.remove(); };
      b.appendChild(talk);
    }
    micArmed = true;
    paintMic();
    $("micState").textContent = "She is asking you to think out loud — tap “Talk to Ananya” and say what you are trying.";

    // the first check-in also sounds, so he looks up from the page
    if (n === 0) {
      beep(2);
      const strip = document.createElement("div");
      strip.className = "talkStrip";
      strip.innerHTML = `<span>Talk to Ananya — say what you are trying, out loud.</span>
        <button class="roundBtn on" title="Talk to Ananya"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round"><path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z"/>
        <path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg></button>`;
      strip.querySelector("button").onclick = () => { strip.remove(); startThinking(); };
      $("chatWrap").appendChild(strip);
      stickBottom();
    }
  }
}

async function drawFigure(kind, key, targetId) {
  const box = $(targetId);
  if (!box) return;
  box.innerHTML = `<div class="diagram" style="color:var(--mut);font-size:14px">Drawing…</div>`;
  const { data, error } = await sb.functions.invoke("draw-figure", {
    body: { chapter: S.chapter, kind, n: kind === "example" ? key : null, idx: kind === "question" ? key : null },
  });
  if (error || data?.error) { box.innerHTML = `<div class="sub">Could not draw it just now.</div>`; return; }
  box.innerHTML = data.svg
    ? `<div class="diagram">${data.svg}</div>`
    : `<div class="sub">There is no useful figure for this one — the words carry it.</div>`;
}

async function check() {
  const q = S.script[S.si].data;
  const val = $("ans")?.value.trim();
  if (!val) return;
  $("chk").disabled = true;
  const secs = Math.round((Date.now() - S.startedAt) / 1000);
  const { data, error } = await sb.rpc("submit_answer", {
    p_chapter: q.chapter, p_idx: q.idx, p_answer: val, p_hints: 0,
    p_working: false, p_mode: S.workMode || "quest", p_seconds: secs, p_exam_id: null,
  });
  $("chk").disabled = false;
  if (error) { $("qfb").innerHTML = `<div class="fb wrong">${esc(error.message)}</div>`; return; }
  clearInterval(S.ticker);

  const fb = $("qfb");
  if (data.correct === true) {
    fb.innerHTML = `<div class="fb right"><b>Right.</b> +${data.xp} XP${rich(data.method ?? "")}</div>`;
  } else if (data.correct === false) {
    fb.innerHTML = `<div class="fb wrong"><b>Not yet.</b>${rich(data.method ?? "")}</div>`;
    bubble("think", "…");
    const reply = await callCoach({ mode: "reply", note: `He answered chapter ${q.chapter} question ${q.idx} with "${val}", which was wrong. The book method is: ${data.method}. Give him the next step only, not the answer.` });
    document.querySelector(".msg.think")?.remove();
    if (reply) bubble("coach", reply);
  } else {
    fb.innerHTML = `<div class="fb manual"><b>Written answer — a person marks this one.</b>${rich(data.method ?? "")}</div>`;
  }
  S.chat.push({ role: "atharv", text: `Chapter ${q.chapter} Q${q.idx}: ${val}` });
  saveSession();
  loadContext();

  const bar = document.createElement("div");
  bar.className = "bar";
  bar.innerHTML = `<button class="go small" data-action="advance">Next →</button>`;
  fb.appendChild(bar);
}

function advance() {
  S.si++;
  saveSession();
  nextStep();
}

async function sendMe() {
  const box = $("say");
  const text = box.value.trim();
  if (!text) return;
  box.value = "";
  S.forceScroll = true;
  keepChat("atharv", text, "child");
  heard = "";                    // the microphone must not put it back
  if (box.style) box.style.height = "";
  bubble("me", text);
  S.chat.push({ role: "atharv", text });

  if (wantsMoreQuestions(text)) {
    bubble("think", "…");
    const made = await writeMoreQuestions();
    document.querySelector(".msg.think")?.remove();
    bubble("coach", made, replySpoken);
    S.chat.push({ role: "coach", text: made });
    return;
  }

  bubble("think", "…");
  const reply = await callCoach({ mode: "reply" });
  document.querySelector(".msg.think")?.remove();
  if (reply) {
    bubble("coach", reply, replySpoken);
    S.chat.push({ role: "coach", text: reply });
    keepChat("coach", reply, "child");
  } else bubble("coach", "I could not reach the coach just then. Try again in a moment.");
  if (S.pendingStart) await beginWork();
}

/* "can I have more questions?" — she writes them, and the parent can see he asked */
function wantsMoreQuestions(text) {
  const t = String(text ?? "").toLowerCase();
  return /(more|new|another|extra)\s+(questions?|problems?|practice)/.test(t)
      || /(generate|give me|need)\s+(more\s+)?(questions?|problems?)/.test(t)
      || /out of questions|nothing left|run out/.test(t);
}

async function writeMoreQuestions() {
  const fam = (TRACKS.find((t) => t.id === S.track) ?? {}).name ?? "Olympiad";
  const exam = FAMILY_EXAM[fam] ?? "Olympiad book";
  const { data, error } = await sb.functions.invoke("make-questions", { body: { exam, count: 20 } });
  const added = (data?.added ?? 0) + extra;
  const figs = data?.figures ?? 0;
  await sb.rpc("log_topup", {
    p_exam: exam, p_asked: 20, p_made: added,
    p_reason: error ? error.message : "Atharv asked for more questions",
  });
  if (error || !added) {
    return "I could not write any just now. Ask your mum or dad to add some from the parent view, and I will try again.";
  }
  return `Done — ${added} new ${exam === "Olympiad book" ? "Olympiad" : fam} questions are in your bank`
    + (figs ? `, ${figs} of them with a figure` : "")
    + ". Tap Resume or start a chapter and they will come up.";
}

/* before he goes: the techniques from today, ready to be written up */
async function showBoardReminder(chapter) {
  if (!chapter) return;
  const { data: note } = await sb.from("chapter_notes").select("ideas").eq("chapter", chapter).maybeSingle();
  const ideas = (note?.ideas ?? []).map(String).filter(Boolean);
  if (!ideas.length) return;

  const { data: { user } } = await sb.auth.getUser();
  const { data: board } = await sb.from("formula_board").select("technique").eq("student_id", user.id).eq("chapter", chapter);
  const on = new Set((board ?? []).map((b) => b.technique));

  const el = document.createElement("div");
  el.className = "qcard";
  el.innerHTML = `<div class="n">BEFORE YOU GO</div>
    <div class="q" style="font-size:16px">Put these on the board beside your desk, in your own hand.</div>
    ${ideas.map((t) => `<label style="display:flex;gap:10px;align-items:flex-start;font-size:15px">
        <input type="checkbox" ${on.has(t) ? "checked" : ""} style="width:19px;height:19px;margin-top:2px"
          onchange="tickFormula(${chapter}, ${JSON.stringify(t).replace(/"/g, "&quot;")}, this.checked)">
        <span>${esc(t)}</span></label>`).join("")}
    <div class="bar"><button class="ghost small" data-action="openFormula">See the whole board</button></div>`;
  $("chatWrap").appendChild(el);
  stickBottom();
}

function backButton() {
  return `<div class="card"><button class="ghost" data-action="returnToSession">← Back to ${COACH}</button></div>`;
}

function returnToSession() {
  if (restorableSession()) {
    bubble("coach", "You stopped partway last time — tap Resume and we will carry on from where you were.");
    resumeSession();
    return;
  }
  goLanding();
}

async function openJournal() {
  show("journal");
  const { data } = await sb.from("session_notes").select("*").order("day", { ascending: false }).limit(60);
  const rows = data ?? [];
  if (!rows.length) { $("journalList").innerHTML = `<div class="sub">Nothing yet. The first note appears when you finish a session.</div>`; return; }
  $("journalList").innerHTML = rows.map((r) => `
    <details style="border-top:1px solid var(--line);padding:12px 0">
      <summary style="cursor:pointer;list-style:none">
        <span class="sub" style="font-size:12.5px">${new Date(r.day).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}${r.chapter ? " · chapter " + r.chapter : ""}</span>
        <div style="font-weight:650;font-size:16px;margin-top:2px">${esc(r.title)}</div>
      </summary>
      <div class="sub" style="margin-top:8px;white-space:pre-wrap;line-height:1.55">${esc(r.body)}</div>
    </details>`).join("");
}

async function openFormula() {
  show("formula");
  const { data, error } = { data: (S.TR ?? {}).board ?? null, error: null };
  if (error) { $("formulaList").innerHTML = `<div class="sub">${esc(error.message)}</div>`; return; }
  const rows = data ?? [];
  const byChapter = {};
  rows.forEach((r) => { (byChapter[r.chapter] ??= { title: r.chapter_title, items: [] }).items.push(r); });

  $("formulaList").innerHTML = Object.entries(byChapter)
    .filter(([, v]) => v.items.some((i) => i.touched) || v.items.some((i) => i.on_board))
    .map(([n, v]) => `
      <div style="border-top:1px solid var(--line);padding:12px 0">
        <div style="font-weight:650;font-size:15.5px">${n}. ${esc(String(v.title).replace(/^\d+ · /, ""))}</div>
        ${v.items.map((i) => `
          <label style="display:flex;gap:10px;align-items:flex-start;margin-top:8px;font-size:14.5px">
            <input type="checkbox" ${i.on_board ? "checked" : ""} style="width:19px;height:19px;margin-top:2px"
              onchange="tickFormula(${n}, ${JSON.stringify(i.technique).replace(/"/g, "&quot;")}, this.checked)">
            <span>${esc(i.technique)}</span>
          </label>`).join("")}
      </div>`).join("")
    || `<div class="sub">Nothing to write up yet. As you meet a technique in a chapter, it appears here.</div>`;
}

async function tickFormula(chapter, technique, on) {
  const { data: { user } } = await sb.auth.getUser();
  if (on) {
    await sb.from("formula_board").upsert({ student_id: user.id, chapter, technique });
  } else {
    await sb.from("formula_board").delete().eq("student_id", user.id).eq("chapter", chapter).eq("technique", technique);
  }
}

async function endSession() {
  // pausing is not a summary and not a new session: stop the clock, keep his place, say so plainly
  clearInterval(S.budgetTimer);
  S.budgetTimer = null;
  const bar = $("budgetBar");
  if (bar) bar.classList.add("hidden");
  document.querySelector(".msg.think")?.remove();

  const total = (S.script ?? []).filter((x) => x.type === "question").length;
  const done = (S.script ?? []).slice(0, S.si).filter((x) => x.type === "question").length;
  const place = S.chapter ? `chapter ${S.chapter}` : "where we are";
  const where = total ? `question ${Math.min(done + 1, total)} of ${total}` : "the start";

  saveSession();

  const note = `Paused. We stopped at ${where} in ${place}. Nothing is lost — tap Resume where you left off and we carry on from here.`;
  bubble("coach", note);
  keepChat("coach", note, "child");

  try {
    const { data: { user } } = await sb.auth.getUser();
    if (user?.id) {
      await sb.from("session_notes").insert({
        student_id: user.id,
        title: (window.__lastTitle || "").trim() || `Chapter ${S.chapter} session`,
        body: note,
        chapter: S.chapter ?? null,
        questions: done,
      });
    }
  } catch (_) { /* the pause still works if the note cannot be saved */ }

  try { await sb.rpc("record_session", { p_lane: "Q", p_minutes: 30, p_status: "paused", p_note: "paused mid-session" }); }
  catch (_) {}

  S.script = null;
  S.si = 0;
  setTimeout(() => goLanding(), 900);
}

/* --------------------------------------------------------------- photo -- */
/* a question he cannot do: read it, help with it, and keep it */
function examForDoubt() {
  if (S.track === "edutest") return "Edutest numerical reasoning";
  if (S.track === "icas") return "ICAS Maths";
  return "AAS numerical reasoning";
}

/* One button. Mid-question a photo can only be his working, so she does not ask.
   Between questions — a fresh sheet, a new problem — she does. */
async function takePhoto() {
  const midQuestion = !!(S.script?.length && S.si < S.script.length && !S.finished);
  S.photoReason = midQuestion ? "working" : await askPhotoReason();
  document.getElementById("doubt").click();
}

function handlePhoto(input) {
  // he has already told her which it is; fall back to the words he typed
  const reason = S.photoReason;
  S.photoReason = null;
  if (reason === "stuck") return askDoubt(input);
  if (reason === "working") return uploadWorking(input);

  const said = ($("say")?.value || "").toLowerCase();
  const doubtish = /stuck|doubt|help|understand|don'?t know|explain|how do i/.test(said);
  return doubtish ? askDoubt(input) : uploadWorking(input);
}

async function askDoubt(input) {
  const files = [...(input.files ?? [])];
  input.value = "";
  if (!files.length) return;

  if (!S.chat) S.chat = [];
  show("session");
  bubble("me", files.length > 1 ? `${files.length} photos of questions I'm stuck on` : "Here is one I'm stuck on");

  const { data: { user } } = await sb.auth.getUser();
  const exam = examForDoubt();

  for (let i = 0; i < files.length; i++) {
    const think = bubble("think", files.length > 1 ? `Reading photo ${i + 1} of ${files.length}…` : "Reading it…");
    try {
      const path = `${user.id}/doubt-${Date.now()}-${i}.jpg`;
      const up = await sb.storage.from("working").upload(path, files[i], { upsert: true, contentType: files[i].type || "image/jpeg" });
      if (up.error) throw new Error(up.error.message);

      const { data, error } = await sb.functions.invoke("doubt", { body: { path, exam } });
      think.remove();
      if (error || data?.error) {
        bubble("coach", "I could not read that one clearly. Try again in better light, with the page flat and the camera square to it.");
        continue;
      }

      const lines = [];
      if (files.length > 1) lines.push(`**Photo ${i + 1} · ${data.strand ?? "this one"}**`);
      else lines.push(`**${data.strand ?? "This one"}**`);
      if (data.idea) lines.push(`The thing to notice: ${data.idea}`);
      if (data.method) lines.push(data.method);
      if (data.answer) lines.push(`**Answer: ${data.answer}**`);
      bubble("coach", lines.join("\n\n"));

      if (data.confident === false) {
        bubble("coach", "I am not certain I read every part of that one — check it against the photo before you trust my answer.");
      }
      S.chat.push({ role: "atharv", text: "I was stuck on: " + (data.question ?? "") });
      S.chat.push({ role: "coach", text: data.method ?? "" });
    } catch (e) {
      think.remove();
      bubble("coach", "That one did not work: " + e.message);
    }
  }

  if (files.length) {
    const saved = files.length;
    bubble("coach", saved > 1
      ? "I have put those in your bank too, so we can come back to them."
      : "I have put it in your bank too, so we can come back to this kind of question later.");
  }
}

async function uploadWorking(input) {
  // she already knows which question he is on: no need to ask him in the message
  const file = input.files?.[0];
  if (!file) return;
  const q = S.qs[S.i];
  if (!q) return;
  const { data: { user } } = await sb.auth.getUser();
  const path = `${user.id}/ch${q.chapter}-q${q.idx}-${Date.now()}.jpg`;
  const t = bubble("think", "Sending your working…");
  const up = await sb.storage.from("working").upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
  if (up.error) { t.textContent = "Upload failed: " + up.error.message; return; }

  const { data, error } = await sb.functions.invoke("coach-work", {
    body: { chapter: q.chapter, idx: q.idx, image_path: path, stage: "work" },
  });
  t.remove();
  if (error || data?.error) { bubble("coach", "I could not read that photo. Try again with more light, straight above the page."); return; }

  bubble("coach",
    `What is right: ${data.whats_right ?? "—"}\n\nWhere it slipped: ${data.slip ?? "—"}\n\n` +
    `Another way: ${data.alternative ?? "—"}\n\nCheck yourself: ${data.check_question ?? "—"}\n\n` +
    `Now you explain it: ${data.ask_teachback ?? "—"}`);
  input.value = "";
}

/* ---------------------------------------------------------------- test -- */
let T = { id: null, left: 0, timer: null };

function leavePaper() {
  const answered = [...document.querySelectorAll("#examList input")].filter((i) => i.value.trim()).length;
  if (answered && !confirm("Leave this paper? What you have written will not be marked.")) return;
  clearInterval(T.timer);
  returnToSession();
}

async function startPlacement() {
  const { data, error } = await sb.rpc("start_placement", { p_count: 12 });
  if (error) { alert(error.message); return; }

  const items = data?.items ?? [];

  // a paper shorter than the bank cannot place anyone: say so instead of pretending
  if (items.length < 6) {
    show("session");
    $("chatWrap").innerHTML = "";
    bubble("coach", items.length
      ? `I can only find ${items.length} question${items.length === 1 ? "" : "s"} across your five exams to check you with, and that is too few to tell me anything true about where you are.\n\nLet us skip the check-in for now. Ask me for some questions — say “can I have more questions” — and once there are a few more I will place you properly.`
      : `There are no questions in the bank yet, so a check-in would tell me nothing.\n\nAsk me for some questions — say “can I have more questions” — and then we will start properly.`);
    keepChat("coach", "Not enough questions to place him — the check-in was skipped.", "child");
    const card = document.createElement("div");
    card.className = "qcard";
    card.innerHTML = `<div class="q" style="font-size:16px">What next?</div>
      <div class="bar">
        <button class="go small" data-action="writeMoreQuestions">Ask for questions</button>
        <button class="ghost small" data-action="goLanding">Home</button>
      </div>`;
    $("chatWrap").appendChild(card);
    return;
  }

  T.id = data.exam_id; T.left = (data.minutes || 20) * 60;
  show("exam");
  $("examKind").textContent = "Placement check";
  $("examName").textContent = testName();
  const examsSeen = [...new Set(items.map((x) => x.exam).filter(Boolean))];
  $("examWhere").textContent = `${items.length} question${items.length === 1 ? "" : "s"}, ${data.minutes || 20} minutes · ` +
    `across ${examsSeen.length ? examsSeen.map((e) => String(e).toUpperCase()).join(", ") : "the topics"}, easiest first`;
  $("examList").innerHTML = items.map((q, n) => `
    <div class="qcard" style="border-width:1px;border-color:var(--line)">
      <div class="n">Q${n + 1}${q.exam ? " · " + esc(String(q.exam).toUpperCase()) : ""} · chapter ${q.chapter}</div>
      <div class="q" style="font-size:17px">${esc(q.prompt)}${gateLabel(q)}</div>
      ${q.diagram_svg ? `<div class="diagram">${q.diagram_svg}</div>` : ""}
      <input data-chapter="${q.chapter}" data-idx="${q.idx}" placeholder="Your answer" autocomplete="off">
    </div>`).join("");
  clearInterval(T.timer);
  const tick = () => {
    const m = Math.floor(T.left / 60), sec = T.left % 60;
    $("clock").textContent = `${m}:${String(sec).padStart(2, "0")}`;
    if (T.left <= 0) { clearInterval(T.timer); submitTest(); }
    T.left--;
  };
  tick(); T.timer = setInterval(tick, 1000);
}

/* which exam this paper belongs to, in its proper name */
function testName() {
  const fam = (TRACKS.find((t) => t.id === S.track) ?? {}).name;
  if (!fam) return "Test";
  return ({
    Olympiad: "Olympiad paper",
    AMC: "AMC Upper Primary",
    AAS: "AAS — Camberwell Grammar",
    Edutest: "Edutest — Kilvington and McKinnon",
    ICAS: "ICAS Mathematics",
  })[fam] ?? fam;
}

async function runExam(body, label) {
  const { data, error } = await sb.rpc("start_exam", body);
  if (error) { alert(error.message); return; }
  T.id = data.exam_id; T.left = (data.minutes || 20) * 60;
  show("exam");
  $("examKind").textContent = label || "Test";
  $("examName").textContent = testName();
  $("examWhere").textContent = `${data.items.length} questions`;
  $("examList").innerHTML = data.items.map((q, n) => `
    <div class="qcard" style="border-width:1px;border-color:var(--line)">
      <div class="n">Q${n + 1}${q.exam ? " · " + esc(String(q.exam).toUpperCase()) : ""} · chapter ${q.chapter}</div>
      <div class="q" style="font-size:17px">${esc(q.prompt)}${gateLabel(q)}</div>
      ${q.diagram_svg ? `<div class="diagram">${q.diagram_svg}</div>` : ""}
      <input data-chapter="${q.chapter}" data-idx="${q.idx}" placeholder="Your answer" autocomplete="off">
    </div>`).join("");
  clearInterval(T.timer);
  const tick = () => {
    const m = Math.floor(T.left / 60), sec = T.left % 60;
    $("clock").textContent = `${m}:${String(sec).padStart(2, "0")}`;
    if (T.left <= 0) { clearInterval(T.timer); submitTest(); }
    T.left--;
  };
  tick(); T.timer = setInterval(tick, 1000);
}

/* the paper he walked away from, if there is one */
async function resumePaper() {
  const { data } = await sb.rpc("open_paper");
  if (!data || !(data.items ?? []).length) { await closeEmptyPaper(); return; }
  T.id = data.exam_id;
  const spent = Math.floor((Date.now() - new Date(data.started_at).getTime()) / 1000);
  const total = (data.minutes || 60) * 60;
  T.left = Math.max(60, total - spent);          // never less than a minute to finish

  show("exam");
  $("examKind").textContent = data.kind === "placement" ? "Placement check" : data.kind === "quiz" ? "Chapter quiz" : "Test";
  $("examName").textContent = testName();
  $("examWhere").textContent = `${data.items.length} question${data.items.length === 1 ? "" : "s"} · you stopped partway, this is where you left off`;
  $("examList").innerHTML = data.items.map((q, n) => `
    <div class="qcard" style="border-width:1px;border-color:var(--line)">
      <div class="n">Q${n + 1}${q.exam ? " · " + esc(String(q.exam).toUpperCase()) : ""} · chapter ${q.chapter}</div>
      <div class="q" style="font-size:17px">${esc(q.prompt)}${gateLabel(q)}</div>
      ${q.diagram_svg ? `<div class="diagram">${q.diagram_svg}</div>` : ""}
      <input data-chapter="${q.chapter}" data-idx="${q.idx}" placeholder="Your answer" autocomplete="off">
    </div>`).join("");
  clearInterval(T.timer);
  const tick = () => {
    const m = Math.floor(T.left / 60), sec = T.left % 60;
    $("clock").textContent = `${m}:${String(sec).padStart(2, "0")}`;
    if (T.left <= 0) { clearInterval(T.timer); submitTest(); }
    T.left--;
  };
  tick(); T.timer = setInterval(tick, 1000);
}

/* an empty paper is not worth resuming: close it quietly */
async function closeEmptyPaper() {
  try { await sb.rpc("abandon_paper"); } catch (_) {}
}

async function startTest(chapter, minutes) {
  const isQuiz = !!chapter;
  const { data, error } = await sb.rpc("start_exam", isQuiz
    ? { p_kind: "quiz", p_chapters: [chapter], p_count: 5, p_minutes: 20, p_pass: 80 }
    : { p_kind: "mock", p_chapters: null, p_count: 30, p_minutes: 60, p_pass: 70 });
  if (error) { alert(error.message); return; }
  T.id = data.exam_id; T.left = (data.minutes || 20) * 60;
  show("exam");
  $("examKind").textContent = isQuiz ? "Chapter quiz" : "Test";
  $("examName").textContent = isQuiz ? `Chapter ${chapter}` : testName();
  $("examWhere").textContent = isQuiz ? `${data.items.length} questions`
    : `${data.items.length} questions · 135 marks`;
  $("examList").innerHTML = data.items.map((q, n) => `
    <div class="qcard" style="border-width:1px;border-color:var(--line)">
      <div class="n">Q${n + 1} · chapter ${q.chapter}</div>
      <div class="q" style="font-size:17px">${esc(q.prompt)}</div>
      <input data-chapter="${q.chapter}" data-idx="${q.idx}" placeholder="Your answer" autocomplete="off">
    </div>`).join("");
  clearInterval(T.timer);
  const tick = () => {
    const m = Math.floor(T.left / 60), sec = T.left % 60;
    $("clock").textContent = `${m}:${String(sec).padStart(2, "0")}`;
    if (T.left <= 0) { clearInterval(T.timer); submitTest(); }
    T.left--;
  };
  tick(); T.timer = setInterval(tick, 1000);
}

function currentChapter() {
  const r = (S.plan ?? []).find((x) => x.chapter);
  return r ? r.chapter : (S.chapter || 1);
}
function startQuiz() { startTest(currentChapter(), 20); }

async function submitTest() {
  clearInterval(T.timer);
  $("subBtn").disabled = true; $("examErr").textContent = "Marking…";
  for (const el of [...document.querySelectorAll("#examList input")]) {
    if (!el.value.trim()) continue;
    await sb.rpc("submit_answer", {
      p_chapter: Number(el.dataset.chapter), p_idx: Number(el.dataset.idx),
      p_answer: el.value.trim(), p_hints: 0, p_working: false,
      p_mode: "mock", p_seconds: null, p_exam_id: T.id,
    });
  }
  const { data, error } = await sb.rpc("finish_exam", { p_exam_id: T.id });
  $("subBtn").disabled = false;
  if (error) { $("examErr").textContent = error.message; return; }
  $("examErr").textContent = "";
  show("results");
  $("resScore").textContent = `${data.score} / ${data.total}`;
  $("resPct").textContent = `${data.pct}% · ${data.passed ? "passed" : "not passed yet"}`;
  $("resItems").innerHTML = (data.items ?? []).map((it, n) => {
    const mark = it.ok === true ? `<span class="pill ok">right</span>` : it.ok === false
      ? `<span class="pill red">wrong</span>` : `<span class="pill grey">to mark</span>`;
    return `<tr><td style="width:44px">Q${n + 1}</td><td>${mark}
      <div class="sub">he wrote: ${esc(it.answer_given ?? "—")}</div>
      <div class="sub">${esc(it.method ?? "")}</div></td></tr>`;
  }).join("");
  loadContext();
}

/* ---------------------------------------------------------------- util -- */
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

/* ten minutes of nothing and it locks itself */
let idleTimer = null;
function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    await sb.auth.signOut();
    location.reload();
  }, 10 * 60 * 1000);
}
["click", "keydown", "touchstart", "scroll"].forEach((e) =>
  document.addEventListener(e, resetIdle, { passive: true }));
resetIdle();

/* if "keep me signed in" was off, drop the session when the app closes */
if (localStorage.getItem(REMEMBER_KEY) === "0") {
  addEventListener("pagehide", () => { try { sb.auth.signOut(); } catch (_) {} });
}

paintArt();
if ($("ver")) $("ver").textContent = "v" + APP_VERSION;
if ($("helpVer")) $("helpVer").textContent = "Version " + APP_VERSION;
$("remember").checked = remember;
try {
  const last = localStorage.getItem(LAST_KEY);
  if (last && $("email")) {
    $("email").value = last;      // whatever worked last time, whole
    setTimeout(() => $("pw")?.focus(), 300);
  }
} catch (_) {}
paintMic();
paintDiag();
let booted = false;
sb.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT") { location.reload(); return; }
  if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED" || event === "MFA_CHALLENGE_VERIFIED") return;
  if (booted) return;                       // already inside: never re-navigate
  booted = true;
  start();
});

/* start once, after the stored session has been read */
(async () => {
  const { data } = await sb.auth.getSession();
  booted = true;
  if (data?.session) start();
  else { show("signin"); }
})();
/* No service worker: it kept serving yesterday's page after a fix went out.
   Anything an older copy left behind is cleaned up on the way in. */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((regs) => Promise.all(regs.map((r) => r.unregister())))
    .then(() => (window.caches ? caches.keys() : []))
    .then((keys) => Promise.all((keys ?? []).map((k) => caches.delete(k))))
    .catch(() => {});
}


/* the action table: name -> what happens. Arguments come from data-a0, data-a1, … */
const CALL = (el, fn) => {
  const args = [];
  for (let i = 0; el.dataset[`a${i}`] !== undefined; i++) {
    const v = el.dataset[`a${i}`];
    args.push(v === "1" && el.dataset[`a${i}`] === "1" && /^(true|false)$/i.test(v) ? true : v);
  }
  return fn(...args, el);
};

registerActions({
  walletRefilled: async () => {
    await sb.rpc("clear_credits_flag");
    const el = $("walletBanner");
    if (el) el.className = "hidden";
    paintWalletBanner();
  },
  wipeHistory: async () => {
    const v = $("wipeFrom")?.value ?? "all";
    const days = v === "all" ? null : Number(v);
    const from = days ? new Date(Date.now() - days * 86400000).toISOString().slice(0, 10) : null;
    const msg = $("resetMsg");
    if (msg) msg.textContent = "Wiping…";
    const { data, error } = await sb.rpc("wipe_history", { p_from: from });
    if (msg) msg.textContent = error
      ? "Could not wipe: " + error.message
      : `Wiped ${data?.attempts ?? 0} answers, ${data?.sessions ?? 0} sessions and ${data?.mocks ?? 0} tests` +
        (from ? ` from ${from} onward.` : " — his record is empty.");
    // solved and pending both change, so the pipeline is re-read, not assumed
    await loadSync();
    await loadParent();
    if (!$("help").classList.contains("hidden")) await loadTraining();
  },

  wipeQuestions: async () => {
    const exam = $("wipeExam")?.value || null;
    const origin = $("wipeOrigin")?.value || null;
    const msg = $("resetMsg");
    if (msg) msg.textContent = "Deleting…";
    const { data, error } = await sb.rpc("wipe_questions", { p_exam: exam, p_origin: origin });
    if (msg) msg.textContent = error
      ? "Could not delete: " + error.message
      : `Deleted ${data?.deleted ?? 0} question${(data?.deleted ?? 0) === 1 ? "" : "s"}` +
        `${exam ? ` from ${exam.toUpperCase()}` : " from every exam"}${origin ? ` (${origin === "auto" ? "written by her" : "from your files"})` : ""}.`;
    loadSync(); loadTraining();
  },
  dismissScanBanner: () => { const el = $("scanBanner"); if (el) el.className = "hidden"; },
  saveLimits: async () => {
    await sb.rpc("set_usage_limits", {
      p_calls: Number($("capCalls")?.value ?? 400),
      p_spend: Number($("capSpend")?.value ?? 20),
      p_alert_pct: Number($("capPct")?.value ?? 80),
      p_alert_below: Number($("capBelow")?.value ?? 10),
    });
    loadTraining();
  },
  saveBalance: async () => {
    const v = Number($("balIn")?.value ?? 0);
    if (!Number.isFinite(v) || v < 0) return;
    await sb.rpc("set_model_balance", { p_inr: v });
    $("dateBanner") && ($("dateBanner").className = "hidden");
    loadTraining();
  },
  dismissJobBanner: () => { const el = $("dateBanner"); if (el) el.className = "hidden"; },
  addAlertTo: (el) => addAlertTo(el),
  addFromChat: (el) => addFromChat(el),
  addTrainingSource: (el) => addTrainingSource(el),
  advance: (el) => advance(el),
  applyContent: (el) => applyContent(el),
  askForEarlyMock: (el) => askForEarlyMock(el),
  backToCoach: (el) => backToCoach(el),
  beginNow: (el) => beginNow(el),
  check: (el) => check(el),
  closeUpload: (el) => closeUpload(el),
  createChild: (el) => createChild(el),
  dismissDateBanner: (el) => dismissDateBanner(el),
  editDate: (el) => editDate(el),
  endSession: (el) => endSession(el),
  findSources: (el) => findSources(el),
  forgotPassword: (el) => forgotPassword(el),
  freshCopy: (el) => freshCopy(el),
  goHome: (el) => goHome(el),
  goLanding: (el) => goLanding(el),
  goParent: (el) => goParent(el),
  leavePaper: (el) => leavePaper(el),
  openDash: (el) => openDash(el),
  openFormula: (el) => openFormula(el),
  openHelp: (el) => openHelp(el),
  openJournal: (el) => openJournal(el),
  openParentChat: (el) => openParentChat(el),
  openTimetable: (el) => openTimetable(el),
  openUpload: (el) => openUpload(el),
  padDone: (el) => padDone(el),
  parentDictate: (el) => parentDictate(el),
  parentWeekly: (el) => parentWeekly(el),
  returnToSession: (el) => returnToSession(el),
  runCoachPlan: (el) => runCoachPlan(el),
  saveChildPassword: (el) => saveChildPassword(el),
  saveName: (el) => saveName(el),
  saveNewPassword: (el) => saveNewPassword(el),
  savePassword: (el) => savePassword(el),
  scanContent: (el) => scanContent(el),
  sendMe: (el) => sendMe(el),
  sendParent: (el) => sendParent(el),
  signIn: (el) => signIn(el),
  signOut: (el) => signOut(el),
  solveBlanks: (el) => solveBlanks(el),
  startMock: (el) => startMock(el),
  startPlacement: (el) => startPlacement(el),
  startQuiz: (el) => startQuiz(el),
  submitTest: (el) => submitTest(el),
  takePhoto: (el) => takePhoto(el),
  testAlertEmail: (el) => testAlertEmail(el),
  testMic: (el) => testMic(el),
  toggleMic: (el) => toggleMic(el),

  useSystemKeyboard: (el) => useSystemKeyboard(el),

  writeMoreQuestions: (el) => writeMoreQuestions(el),

  pickFile: () => { const f = $("upFile"); if (f) f.click(); },

  uploadStaged: async () => {
    const btn = $("uploadBtn");
    if (!stagedFiles.length) { alert("Choose a file first."); return; }
    const fake = { files: stagedFiles, value: "" };
    if (btn) { btn.disabled = true; btn.textContent = "Uploading…"; }
    const box = $("upStaged");
    if (box) box.innerHTML = `<div class="chipRow"><span class="chip amber"><b>uploading</b> ${stagedFiles.length} file${stagedFiles.length === 1 ? "" : "s"}…</span></div>`;
    try {
      await uploadAndRead(fake);
      if (box) box.innerHTML = `<div class="chipRow"><span class="chip green"><b>uploaded</b> and being read</span></div>`;
    } catch (e) {
      if (box) box.innerHTML = `<div class="chipRow"><span class="chip red"><b>upload failed</b> ${esc(String(e.message ?? e))}</span></div>`;
    }
    stagedFiles = [];
    if (btn) { btn.textContent = "Upload"; btn.disabled = true; }
  },
  toggleOpen: (el) => el.closest("details")?.toggleAttribute("open"),
  padShift: (el) => { padShift = !padShift; paintPad(); },
  wipe: (el) => wipe(el.dataset.arg ?? "all"),
  openPad: (el) => openPad(document.getElementById(el.dataset.target ?? "say"), el.dataset.mode ?? "text"),
  toggleTrainingSource: (el) => toggleTrainingSource(el.dataset.id, el.dataset.on !== "1"),
  removeAlertTo: (el) => removeAlertTo(el.dataset.mail),
  pickOption: (el) => pickOption(el),
  revealExample: (el) => revealExample(el),
  startSolo: (el) => startSolo(el.dataset.a0 ? Number(el.dataset.a0) : S.chapter),
  openTrack: (el) => openTrack(el.dataset.a0 ?? S.track),
  startChapter: (el) => startChapter(Number(el.dataset.a0)),
  retryReading: (el) => retryReading(Number(el.dataset.a0), el.dataset.a1 === "1"),
  dismissNote: (el) => dismissNote(Number(el.dataset.a0)),
  deletePaper: (el) => deletePaper(Number(el.dataset.a0)),
  openChapter: (el) => openChapter(Number(el.dataset.a0)),
  padKey: (el) => padKey(el.dataset.a0),

  toggleFileStatus: (el) => {
    // remember which files are open, so the four-second refresh cannot close them
    S.openStatus = S.openStatus ?? new Set();
    const id = el.dataset.a0;
    if (S.openStatus.has(id)) S.openStatus.delete(id); else S.openStatus.add(id);
  },

  openTab: (el) => openTab(el.dataset.a0, el.dataset.a1, el.dataset.a2),
  pageCrop,

  keepOutOfTurn: async () => {
    const words = ($("keepWords")?.value ?? "").trim();
    if (!words) return;
    await sb.rpc("note_difficulty", { p_words: words, p_exam: S.ctx?.plan?.exam ?? null, p_who: "child" });
    if ($("keepWords")) $("keepWords").value = "";
    alert("Kept. It will come back as practice.");
  },

  skipChapter: async (el) => {
    const asked = Number(el.dataset.a0);
    S.skips = (S.skips ?? 0) + 1;

    // two alternatives, and only two: after that she decides and starts
    if (S.skips > 2) {
      const note = `He has skipped ${S.skips} chapters in a row. Do not offer another choice: pick the chapter that best
        fits what he told you today, say why in one line, and start it.`;
      const reply = await callCoach({ mode: "reply", note });
      if (reply) bubble("coach", reply, false);
      const plan = S.ctx?.plan ?? null;
      if (plan?.chapter) await startChapter(plan.chapter);
      S.skips = 0;
      return;
    }

    const { data } = await sb.rpc("chapter_alternatives", { p_exclude: asked, p_count: 2 });
    const alts = data ?? [];
    if (!alts.length) {
      const note = `There is no other chapter with questions left. Say so in one line and tell him what to do instead.`;
      const reply = await callCoach({ mode: "reply", note });
      if (reply) bubble("coach", reply, false);
      return;
    }
    bubble("coach", `Not that one. Two others: ${alts.map((a) => a.title).join(", ")}. Or I choose.`, false);
    const box = $("actionBar");
    if (box) {
      box.innerHTML = alts.map((a) => `<button class="go small" data-action="startChapter" data-a0="${a.n}">
        ${esc(String(a.title).split(" · ").pop())} →</button>`).join("") +
        `<button class="ghost small" data-action="startChapter" data-a0="${alts[0].n}">You choose</button>`;
    }
  },

  noteDifficulty: async () => {
    const words = ($("hardWords")?.value ?? "").trim();
    const exam = $("hardExam")?.value || null;
    if (!words) { alert("Say what kind of question is hard first."); return; }
    const { data, error } = await sb.rpc("note_difficulty",
      { p_words: words, p_exam: exam, p_who: S.isParent ? "parent" : "child" });
    if (error) { alert("Could not tell her: " + error.message); return; }
    if ($("hardWords")) $("hardWords").value = "";
    await renderHard();
    // and it goes into the chat, so the teaching starts in the same breath
    const note = `He says this is hard: "${words}".${exam ? ` It is for ${exam}.` : " The exam is not named — ask which one before you file it."}
      Teach it now in two or three lines with one worked example.`;
    const reply = await callCoach({ mode: "reply", note });
    if (reply) bubble("coach", reply, false);
  },

  fixAmbiguous: async (el) => {
    const chapter = Number(el.dataset.a0), idx = Number(el.dataset.a1);
    el.disabled = true; el.textContent = "Asking her…";
    try {
      await sb.rpc("set_question_status", { p_chapter: chapter, p_idx: idx, p_status: "draft",
        p_note: "parent asked for a rewrite" });
      await sb.functions.invoke("train-coach", { body: { mode: "align", chapter } }).catch(() => {});
      el.textContent = "She will rewrite it, then it is checked again";
    } catch (e) { el.textContent = "Could not ask her"; }
    renderAmbiguous();
  renderHard();
  },

  dropAmbiguous: async (el) => {
    const chapter = Number(el.dataset.a0), idx = Number(el.dataset.a1);
    if (!confirm("Drop this question for good? It will not come back.")) return;
    const { error } = await sb.rpc("drop_question", { p_chapter: chapter, p_idx: idx });
    if (error) { alert("Could not drop it: " + error.message); return; }
    renderAmbiguous();
    loadSync(); loadTraining();
  },

  skipProvisional: async (el) => {
    const chapter = Number(el.dataset.a0), idx = Number(el.dataset.a1);
    // remember it, so she knows he passed over it rather than failed it
    try { await sb.rpc("log_skip", { p_chapter: chapter, p_idx: idx }); }
    catch (e) { console.error("skip log failed", e); }

    // a verified question first; otherwise carry on with what is there
    const { data: better } = await sb.rpc("next_verified", { p_chapter: chapter, p_exclude_idx: idx });
    if (Array.isArray(better) && better.length) {
      S.script.splice(S.si + 1, 0, { type: "question", data: better[0] });
    }
    S.si += 1;
    saveSession();
    nextStep();
  },
});

window.__state = S;           // read-only view for the tests

let api = {};
try {
api = {
  signIn, signOut, goLanding, openTrack, openChapter, startSession, check, advance, nextStep, drawFigure, revealExample, sendMe, endSession, uploadWorking,
  startQuiz, submitTest,
  goParent, goHome, openUpload, closeUpload, submitUpload, openParentChat, sendParent, parentWeekly, resetProgress, paintJobBanner,
  askCoachWhatNow, runCoachPlan, scanContent, applyContent, forgotPassword, saveNewPassword,
  openTrack, startMock, runExam, beginWork, startSolo, openDash,
  readPaper, extractOne, updateDest, buildScript, toggleMic, askDoubt, handlePhoto,
  openJournal, openFormula, tickFormula, openPad, padKey, padDone, closePad, useSystemKeyboard, paintPad, buildTracks, fileToBase64, loadParent, paintTopProgress, checkRunningJob, needsFigure, openPaper, pickOption, uploadAndRead, dismissNote, paintNote, paintOptions, testMic, freshCopy, paintDiag, growSay, stickBottom, bubble, checkReset, startPlacement, solveBlanks, paintActions, rich, startChapter, backToCoach, startThinking, resumeSession, returnToSession, backButton, leavePaper, createChild, deleteChild, removeParent, retryReading, preparePages, generateFor, printQuestions, startDeleteAccount, loadParents, saveOriginal, stageFiles, openHelp, openTimetable, toneForCount, paintWalletBanner, gateLabel, check, endSession, readSessionFromServer, autoFigure, startChapter, backToCoach, enqueue, refreshVisible, afterWrite, findSources, autoTrain, trainNow, verifyBank, loadTraining, addTrainingSource, toggleTrainingSource, resumePaper, closeEmptyPaper, beginNow, checkExamDates, loadAlertTo, testAlertEmail, addAlertTo, removeAlertTo, paintDateBanner, dismissDateBanner, loadChat, keepChat, parentDictate, addFromChat, formatCoachHtml, wipe, loadTough, paintExamTag, loadWhatsNew, openTab, tabFacts, keepBankAhead, loadRequests, writeMoreQuestions, wantsMoreQuestions, quizReady, askForEarlyMock, takePhoto, askPhotoReason, strandMode, strandModeChanged, cutFromPage, freshPill, beep, uploadAndRead, deletePaper, buildTracks, journeyChart, loadPapersToRead, runServerQueue, editDate, setExamDate, saveName, savePassword, saveChildPassword, loadAccount
};
} catch (e) { console.warn("handler list incomplete:", e.message); }
for (const [k, v] of Object.entries(api)) if (typeof v === "function") window[k] = v;

const _tag = document.getElementById("buildTag");
if (_tag) _tag.textContent = "v" + APP_VERSION;   // the footer copy, when there is one
