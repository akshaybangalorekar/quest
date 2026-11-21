/* data.js — the only place the page talks to the database.
   Nothing else in the app names an RPC or a table, so a rename happens here and nowhere else. */

export let sb = null;
export function setClient(client) { sb = client; }

/* one call, one result shape: { data, error } and never a thrown surprise */
async function call(fn, args) {
  try {
    const { data, error } = await fn(args);
    if (error) console.warn("query failed:", error.message ?? error);
    return { data: data ?? null, error: error ?? null };
  } catch (e) {
    console.warn("query threw:", e?.message ?? e);
    return { data: null, error: e };
  }
}

export const abandon_paper = (args) => call((a) => sb.rpc("abandon_paper", a), args);
export const add_alert_recipient = (args) => call((a) => sb.rpc("add_alert_recipient", a), args);
export const add_questions = (args) => call((a) => sb.rpc("add_questions", a), args);
export const add_training_source = (args) => call((a) => sb.rpc("add_training_source", a), args);
export const chapter_ready_for_quiz = (args) => call((a) => sb.rpc("chapter_ready_for_quiz", a), args);
export const chapters_for_exam = (args) => call((a) => sb.rpc("chapters_for_exam", a), args);
export const coach_context = (args) => call((a) => sb.rpc("coach_context", a), args);
export const date_check_due = (args) => call((a) => sb.rpc("date_check_due", a), args);
export const delete_paper = (args) => call((a) => sb.rpc("delete_paper", a), args);
export const dismiss_alerts = (args) => call((a) => sb.rpc("dismiss_alerts", a), args);
export const dismiss_date_changes = (args) => call((a) => sb.rpc("dismiss_date_changes", a), args);
export const dismiss_parse_note = (args) => call((a) => sb.rpc("dismiss_parse_note", a), args);
export const due_reviews = (args) => call((a) => sb.rpc("due_reviews", a), args);
export const finish_exam = (args) => call((a) => sb.rpc("finish_exam", a), args);
export const finish_parse_job = (args) => call((a) => sb.rpc("finish_parse_job", a), args);
export const is_parent = (args) => call((a) => sb.rpc("is_parent", a), args);
export const list_alert_recipients = (args) => call((a) => sb.rpc("list_alert_recipients", a), args);
export const log_topup = (args) => call((a) => sb.rpc("log_topup", a), args);
export const log_visit = (args) => call((a) => sb.rpc("log_visit", a), args);
export const login_email = (args) => call((a) => sb.rpc("login_email", a), args);
export const my_account = (args) => call((a) => sb.rpc("my_account", a), args);
export const my_student_id = (args) => call((a) => sb.rpc("my_student_id", a), args);
export const next_in_chapter = (args) => call((a) => sb.rpc("next_in_chapter", a), args);
export const next_parse_page = (args) => call((a) => sb.rpc("next_parse_page", a), args);
export const open_paper = (args) => call((a) => sb.rpc("open_paper", a), args);
export const paper_objects = (args) => call((a) => sb.rpc("paper_objects", a), args);
export const papers_to_read = (args) => call((a) => sb.rpc("papers_to_read", a), args);
export const parse_note = (args) => call((a) => sb.rpc("parse_note", a), args);
export const parse_progress = (args) => call((a) => sb.rpc("parse_progress", a), args);
export const pending_alerts = (args) => call((a) => sb.rpc("pending_alerts", a), args);
export const question_budget = (args) => call((a) => sb.rpc("question_budget", a), args);
export const record_session = (args) => call((a) => sb.rpc("record_session", a), args);
export const remove_alert_recipient = (args) => call((a) => sb.rpc("remove_alert_recipient", a), args);
export const reset_progress = (args) => call((a) => sb.rpc("reset_progress", a), args);
export const restart_reading = (args) => call((a) => sb.rpc("restart_reading", a), args);
export const save_chat = (args) => call((a) => sb.rpc("save_chat", a), args);
export const save_upload = (args) => call((a) => sb.rpc("save_upload", a), args);
export const set_exam_date = (args) => call((a) => sb.rpc("set_exam_date", a), args);
export const set_job_total = (args) => call((a) => sb.rpc("set_job_total", a), args);
export const set_training_source_active = (args) => call((a) => sb.rpc("set_training_source_active", a), args);
export const set_username = (args) => call((a) => sb.rpc("set_username", a), args);
export const sitting_plan = (args) => call((a) => sb.rpc("sitting_plan", a), args);
export const start_exam = (args) => call((a) => sb.rpc("start_exam", a), args);
export const start_parse_job = (args) => call((a) => sb.rpc("start_parse_job", a), args);
export const start_placement = (args) => call((a) => sb.rpc("start_placement", a), args);
export const submit_answer = (args) => call((a) => sb.rpc("submit_answer", a), args);
export const topic_readiness = (args) => call((a) => sb.rpc("topic_readiness", a), args);
export const train_due = (args) => call((a) => sb.rpc("train_due", a), args);
export const training_status = (args) => call((a) => sb.rpc("training_status", a), args);
export const training_view = (args) => call((a) => sb.rpc("training_view", a), args);
export const truth = (args) => call((a) => sb.rpc("truth", a), args);
export const upload_bytes = (args) => call((a) => sb.rpc("upload_bytes", a), args);

export const check_figure = (body) => call((b) => sb.functions.invoke("check-figure", b), body);
export const coach_chat = (body) => call((b) => sb.functions.invoke("coach-chat", b), body);
export const coach_work = (body) => call((b) => sb.functions.invoke("coach-work", b), body);
export const doubt = (body) => call((b) => sb.functions.invoke("doubt", b), body);
export const draw_figure = (body) => call((b) => sb.functions.invoke("draw-figure", b), body);
export const exam_watch = (body) => call((b) => sb.functions.invoke("exam-watch", b), body);
export const extract_questions = (body) => call((b) => sb.functions.invoke("extract-questions", b), body);
export const fix_content = (body) => call((b) => sb.functions.invoke("fix-content", b), body);
export const make_questions = (body) => call((b) => sb.functions.invoke("make-questions", b), body);
export const manage_student = (body) => call((b) => sb.functions.invoke("manage-student", b), body);
export const parse_page = (body) => call((b) => sb.functions.invoke("parse-page", b), body);
export const set_child_password = (body) => call((b) => sb.functions.invoke("set-child-password", b), body);
export const solve_questions = (body) => call((b) => sb.functions.invoke("solve-questions", b), body);
export const train_coach = (body) => call((b) => sb.functions.invoke("train-coach", b), body);

/* a table read, kept here so the page never names a table itself */
export const recent_jobs = (args) => call((a) => sb.rpc("recent_jobs", a), args);
export const start_job = (args) => call((a) => sb.rpc("start_job", a), args);
export const finish_job = (args) => call((a) => sb.rpc("finish_job", a), args);

export const enqueue_job = (args) => call((a) => sb.rpc("enqueue_job", a), args);
export const claim_job = (args) => call((a) => sb.rpc("claim_job", a), args);

export const save_session = (args) => call((a) => sb.rpc("save_session", a), args);
export const load_session = (args) => call((a) => sb.rpc("load_session", a), args);
export const clear_session = (args) => call((a) => sb.rpc("clear_session", a), args);
export const usage_today = (args) => call((a) => sb.rpc("usage_today", a), args);

export const model_balance = (args) => call((a) => sb.rpc("model_balance", a), args);
export const set_model_balance = (args) => call((a) => sb.rpc("set_model_balance", a), args);

export const usage_limits = (args) => call((a) => sb.rpc("usage_limits", a), args);
export const set_usage_limits = (args) => call((a) => sb.rpc("set_usage_limits", a), args);

export const ingest_progress = (args) => call((a) => sb.rpc("ingest_progress", a), args);

export const sync_view = (args) => call((a) => sb.rpc("sync_view", a), args);

export const held_back_reasons = (args) => call((a) => sb.rpc("held_back_reasons", a), args);

export const exam_pipeline = (args) => call((a) => sb.rpc("exam_pipeline", a), args);

export const wipe_history = (args) => call((a) => sb.rpc("wipe_history", a), args);
export const wipe_questions = (args) => call((a) => sb.rpc("wipe_questions", a), args);

export const credits_state = (args) => call((a) => sb.rpc("credits_state", a), args);
export const clear_credits_flag = (args) => call((a) => sb.rpc("clear_credits_flag", a), args);

export const print_rows = (args) => call((a) => sb.rpc("print_rows", a), args);

export const question_sources = (args) => call((a) => sb.rpc("question_sources", a), args);

export const log_skip = (args) => call((a) => sb.rpc("log_skip", a), args);

export const next_verified = (args) => call((a) => sb.rpc("next_verified", a), args);

export const regate_exam = (args) => call((a) => sb.rpc("regate_exam", a), args);

export const provisional_to_check = (args) => call((a) => sb.rpc("provisional_to_check", a), args);

export const ambiguous_questions = (args) => call((a) => sb.rpc("ambiguous_questions", a), args);

export const drop_question = (args) => call((a) => sb.rpc("drop_question", a), args);

export const set_question_status = (args) => call((a) => sb.rpc("set_question_status", a), args);

export const note_difficulty = (args) => call((a) => sb.rpc("note_difficulty", a), args);

export const hard_list = (args) => call((a) => sb.rpc("hard_list", a), args);

export const mark_hard = (args) => call((a) => sb.rpc("mark_hard", a), args);

export const chapter_alternatives = (args) => call((a) => sb.rpc("chapter_alternatives", a), args);

export const question_status_counts = (args) => call((a) => sb.rpc("question_status_counts", a), args);

export const upload_tabs = (args) => call((a) => sb.rpc("upload_tabs", a), args);

export const tab_questions = (args) => call((a) => sb.rpc("tab_questions", a), args);

export const generated_bank = (args) => call((a) => sb.rpc("generated_bank", a), args);

export const tabs_view = (args) => call((a) => sb.rpc("tabs_view", a), args);

export const exam_counts = (args) => call((a) => sb.rpc("exam_counts", a), args);

export const figure_crop = (args) => call((a) => sb.rpc("figure_crop", a), args);

export const table = (name) => sb.from(name);
