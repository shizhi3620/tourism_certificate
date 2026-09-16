import { adjacentQuestionId, questionPosition, questionsForChapter } from "./question-navigation.js";
import { questionTypeFor, validateQuestionTypeCatalog, validateWrittenQuestion } from "./question-types.js";
import { exportStudyRecord, importStudyRecord, describeVersionMismatch } from "./study-record.js";

const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback)); } catch { return fallback; } };
const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const state = { content: null, practical: null, records: load("tourism-study-records", {}), mocks: load("tourism-mock-results", []), selectedView: "practice", mock: null, mockTimer: null, installPrompt: null };
const recordFor = (id) => state.records[id] ?? { attempts: 0, correct: 0, wrong: false };
const label = (q) => q.sourceType === "past_exam" ? `历年真题 · ${q.year} · ${q.region}` : q.sourceType === "mock" ? "模拟题" : "示例题";
const catalog = () => state.content?.exam?.writtenExam?.questionTypes ?? [];
const typeFor = (question) => questionTypeFor(catalog(), question?.type);
const invalidQuestionErrors = (question) => validateWrittenQuestion(question, catalog());
const validQuestions = () => state.content.questions.filter((question) => invalidQuestionErrors(question).length === 0);
const validQuestionsForChapter = (chapterId = "") => questionsForChapter(state.content, chapterId).filter((question) => invalidQuestionErrors(question).length === 0);
const isMultiple = (question) => typeFor(question)?.selectionMode === "multiple";
const answerMatches = (question, selected) => {
  const type = typeFor(question);
  if (!type) return false;
  return type.selectionMode === "multiple"
    ? Array.isArray(selected) && Array.isArray(question.answer) && selected.length === question.answer.length && selected.every((value) => question.answer.includes(value))
    : selected === question.answer;
};
const totalAttempts = () => Object.values(state.records).reduce((n, record) => n + (record?.attempts ?? 0), 0);

const INSTALL_DISMISSED_KEY = "tourism-install-guide-dismissed";
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isIOS = () => /iPad|iPhone|iPod/.test(window.navigator.userAgent)
  || (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
const installDismissed = () => load(INSTALL_DISMISSED_KEY, false) === true;

function renderContentVersion() {
  const chip = document.querySelector("#content-version");
  if (!chip) return;
  chip.textContent = state.content ? `内容版本 ${state.content.contentVersion}` : "";
}

function installGuideMarkup() {
  if (isStandalone()) {
    return `<p><strong>已安装到主屏幕</strong></p><p class="muted">当前已作为独立应用运行，学习记录受主屏幕应用存储保护，不会被浏览器自动清除。</p>`;
  }
  if (isIOS()) {
    return `<p><strong>装到主屏幕，才能保住你的错题记录</strong></p><ol class="install-steps"><li>点 Safari 底部的“分享”按钮</li><li>向下滑动，选择“添加到主屏幕”</li><li>点右上角“添加”</li></ol><p class="muted">iOS 会清除 7 天未打开的网站数据；装到主屏幕后可免除。</p>`;
  }
  if (state.installPrompt) {
    return `<p><strong>把题库装成独立应用</strong></p><p class="muted">安装后可在主屏幕直接打开，并保留离线浏览能力。</p><button type="button" class="primary" id="install-now">立即安装</button>`;
  }
  return `<p><strong>把题库装成独立应用</strong></p><p class="muted">请在浏览器菜单里选择“安装应用”或“添加到主屏幕”。</p>`;
}

function renderInstallGuide(target) {
  if (!target) return;
  target.innerHTML = installGuideMarkup();
  target.hidden = false;
  target.querySelector("#dismiss-install-guide")?.addEventListener("click", () => {
    save(INSTALL_DISMISSED_KEY, true);
    target.hidden = true;
  });
  target.querySelector("#install-now")?.addEventListener("click", async () => {
    const prompt = state.installPrompt;
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    state.installPrompt = null;
    renderInstallGuide(target);
  });
}

function maybeShowInstallGuide() {
  if (isStandalone() || installDismissed()) return;
  const target = document.querySelector("#install-guide");
  if (!target || !target.hidden) return;
  target.innerHTML = `${installGuideMarkup()}<p><button type="button" class="small" id="dismiss-install-guide">暂不安装</button></p>`;
  target.hidden = false;
  target.querySelector("#dismiss-install-guide")?.addEventListener("click", () => {
    save(INSTALL_DISMISSED_KEY, true);
    target.hidden = true;
  });
  target.querySelector("#install-now")?.addEventListener("click", async () => {
    const prompt = state.installPrompt;
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    state.installPrompt = null;
    target.hidden = true;
  });
}

function renderStats() {
  const records = Object.values(state.records), attempts = records.reduce((n, r) => n + r.attempts, 0), correct = records.reduce((n, r) => n + r.correct, 0);
  document.querySelector("#answered-count").textContent = attempts;
  document.querySelector("#correct-rate").textContent = attempts ? `${Math.round(correct / attempts * 100)}%` : "—";
  document.querySelector("#wrong-count").textContent = records.filter((r) => r.wrong).length;
}
function answer(question, selected, container, onDone = () => {}) {
  const wasEmpty = totalAttempts() === 0;
  const correct = answerMatches(question, selected);
  const record = recordFor(question.id);
  record.attempts += 1; record.correct += correct ? 1 : 0; record.wrong = !correct; state.records[question.id] = record; save("tourism-study-records", state.records);
  const correctIndexes = Array.isArray(question.answer) ? question.answer : [question.answer];
  const selectedIndexes = Array.isArray(selected) ? selected : [selected];
  container.querySelectorAll(".option").forEach((button) => { button.disabled = true; const index = +button.dataset.index; if (correctIndexes.includes(index)) button.classList.add("correct"); if (selectedIndexes.includes(index) && !correct) button.classList.add("incorrect"); });
  const result = container.querySelector(".result"); result.hidden = false;
  result.innerHTML = `<strong>${correct ? "回答正确" : "回答错误"}</strong> · 正确答案：${correctIndexes.map((index) => String.fromCharCode(65 + index)).join("、")}<br>${question.explanation}`;
  renderStats(); renderWrong(); renderOutline(); onDone(correct);
  if (wasEmpty) maybeShowInstallGuide();
}
let practiceIds = [];
let practiceQuestionId = null;

function renderPractice(ids = validQuestionsForChapter(), requestedId = practiceQuestionId) {
  const el = document.querySelector("#practice-view");
  const requestedIds = ids.map((item) => typeof item === "string" ? item : item.id);
  const available = new Map(validQuestions().map((question) => [question.id, question]));
  const availableIds = requestedIds.filter((id) => available.has(id));
  const skipped = requestedIds.filter((id) => !available.has(id) && state.content.questions.some((question) => question.id === id)).length;
  practiceIds = availableIds;
  if (!availableIds.length) {
    practiceQuestionId = null;
    el.innerHTML = '<div class="card"><h2>暂无可练习内容</h2><p class="muted">当前没有符合题型合同的可练习题目。</p></div>';
    return;
  }
  if (!availableIds.includes(requestedId)) requestedId = availableIds[0];
  practiceQuestionId = requestedId;
  const q = available.get(requestedId);
  const type = typeFor(q);
  const position = questionPosition(availableIds, requestedId);
  const multiple = type.selectionMode === "multiple";
  const navigation = availableIds.length > 1
    ? `<div class="practice-nav"><span>第 ${position + 1} / ${availableIds.length} 题</span><span><button type="button" class="small" id="previous-question">上一题</button> <button type="button" class="small" id="next-question">下一题</button></span></div>`
    : '<p class="muted">共 1 题</p>';
  const skippedNotice = skipped ? `<p class="notice">已跳过 ${skipped} 道题型合同无效的题目。</p>` : "";
  el.innerHTML = `<div class="card"><p class="eyebrow">${label(q)} · ${q.subject} · ${type.label}</p>${navigation}${skippedNotice}<h2>${q.prompt}</h2><p class="muted">${q.sourceNote}</p><div class="question">${q.options.map((o, i) => `<button class="option" data-index="${i}">${String.fromCharCode(65 + i)}. ${o}</button>`).join("")}</div>${multiple ? '<button class="primary" id="submit-question">提交答案</button>' : ""}<div class="result" hidden></div></div>`;
  el.querySelectorAll(".option").forEach((button) => button.addEventListener("click", () => {
    if (multiple) button.classList.toggle("selected");
    else answer(q, +button.dataset.index, el);
  }));
  el.querySelector("#submit-question")?.addEventListener("click", () => {
    const selected = [...el.querySelectorAll(".option.selected")].map((button) => +button.dataset.index);
    answer(q, selected, el);
  });
  el.querySelector("#previous-question")?.addEventListener("click", () => renderPractice(practiceIds, adjacentQuestionId(practiceIds, practiceQuestionId, -1)));
  el.querySelector("#next-question")?.addEventListener("click", () => renderPractice(practiceIds, adjacentQuestionId(practiceIds, practiceQuestionId, 1)));
}
function renderWrong() {
  const wrong = validQuestions().filter((q) => recordFor(q.id).wrong), el = document.querySelector("#wrong-view");
  el.innerHTML = `<div class="card"><h2>错题本</h2>${wrong.length ? wrong.map((q) => `<article class="list-item"><p>${q.prompt}</p><button class="small" data-id="${q.id}">重新练习</button></article>`).join("") : '<p class="muted">还没有错题，完成练习后会自动收录。</p>'}</div>`;
  el.querySelectorAll("[data-id]").forEach((b) => b.addEventListener("click", () => { selectView("practice"); renderPractice([b.dataset.id]); }));
}
function renderOutline() {
  const el = document.querySelector("#outline-view");
  const questions = validQuestions();
  const past = questions.filter((q) => q.sourceType === "past_exam"), pastAttempts = past.reduce((n, q) => n + recordFor(q.id).attempts, 0), pastCorrect = past.reduce((n, q) => n + recordFor(q.id).correct, 0);
  const rows = state.content.chapters.map((c) => {
    const qs = validQuestionsForChapter(c.id);
    const done = qs.filter((q) => recordFor(q.id).attempts).length;
    return `<p><button type="button" class="chapter-link" data-chapter-id="${c.id}">${c.name}（${qs.length} 题）</button><br><span class="muted">${c.description} · ${done}/${qs.length} 题已练习</span></p><div class="progress"><i style="width:${qs.length ? done / qs.length * 100 : 0}%"></i></div>`;
  }).join("");
  el.innerHTML = `<div class="card"><h2>考纲进度</h2><p class="muted">内容版本 ${state.content.contentVersion} · 大纲版本 ${state.content.syllabusVersion}</p><p>历年真题表现：${pastAttempts ? `${Math.round(pastCorrect / pastAttempts * 100)}%（${pastAttempts} 次）` : "暂无记录"} · 模考次数：${state.mocks.length}</p><button type="button" class="primary" data-chapter-id="">全部题目（${questions.length} 题）</button>${rows}</div>`;
  el.querySelectorAll("[data-chapter-id]").forEach((button) => button.addEventListener("click", () => {
    selectView("practice");
    renderPractice(validQuestionsForChapter(button.dataset.chapterId));
  }));
}
function renderMock() {
  const el = document.querySelector("#mock-view");
  if (state.mockTimer) { clearInterval(state.mockTimer); state.mockTimer = null; }
  if (state.mock) {
    const answered = Object.keys(state.mock.answers).length;
    el.innerHTML = `<div class="card"><h2>整卷模考 <span class="timer">${Math.max(0, Math.ceil((state.mock.ends - Date.now()) / 1000))}s</span></h2><p>已完成 ${answered}/${state.mock.questions.length} 题</p>${state.mock.questions.map((q, i) => `<div class="mock-q"><p><strong>${i + 1}. ${q.prompt}</strong></p>${q.options.map((o, j) => { const selected = isMultiple(q) ? (state.mock.answers[q.id] ?? []).includes(j) : state.mock.answers[q.id] === j; return `<button class="option ${selected ? "selected" : ""}" data-q="${q.id}" data-index="${j}">${String.fromCharCode(65 + j)}. ${o}</button>`; }).join("")}</div>`).join("")}<button id="submit-mock" class="primary">交卷</button></div>`;
    el.querySelectorAll(".mock-q .option").forEach((button) => button.addEventListener("click", () => {
      const question = state.mock.questions.find((item) => item.id === button.dataset.q);
      if (isMultiple(question)) {
        const selected = new Set(state.mock.answers[question.id] ?? []);
        if (selected.has(+button.dataset.index)) selected.delete(+button.dataset.index);
        else selected.add(+button.dataset.index);
        state.mock.answers[question.id] = [...selected];
      } else state.mock.answers[question.id] = +button.dataset.index;
      renderMock();
    }));
    el.querySelector("#submit-mock").addEventListener("click", submitMock);
    state.mockTimer = setInterval(() => {
      if (Date.now() >= state.mock.ends) return submitMock();
      const timer = el.querySelector(".timer");
      if (timer) timer.textContent = `${Math.max(0, Math.ceil((state.mock.ends - Date.now()) / 1000))}s`;
    }, 1000);
    return;
  }
  el.innerHTML = `<div class="card"><h2>整卷模考</h2><p>版本 ${state.content.mockConfig.version} · ${state.content.mockConfig.questionCount} 题 · ${state.content.mockConfig.durationMinutes} 分钟</p><button id="start-mock" class="primary">开始模考</button><h3>历史成绩</h3>${state.mocks.length ? state.mocks.map((m) => `<p>${new Date(m.finishedAt).toLocaleString()} · ${m.score}/${m.total}（${m.percent}%）</p>`).join("") : '<p class="muted">暂无模考记录。</p>'}</div>`;
  el.querySelector("#start-mock").addEventListener("click", () => { const questions = validQuestions().filter((q) => state.content.mockConfig.questionIds.includes(q.id)); state.mock = { questions, answers: {}, ends: Date.now() + state.content.mockConfig.durationMinutes * 60000 }; renderMock(); });
}
function submitMock() {
  if (!state.mock) return;
  const score = state.mock.questions.reduce((n, q) => n + (answerMatches(q, state.mock.answers[q.id]) ? 1 : 0), 0);
  const result = { finishedAt: new Date().toISOString(), score, total: state.mock.questions.length, percent: state.mock.questions.length ? Math.round(score / state.mock.questions.length * 100) : 0 };
  if (state.mockTimer) { clearInterval(state.mockTimer); state.mockTimer = null; }
  state.mocks.unshift(result); save("tourism-mock-results", state.mocks); state.mock = null; renderMock();
}
function renderPractical() {
  const el = document.querySelector("#practical-view"), a = state.practical.attractions[0];
  el.innerHTML = `<div class="card"><p class="eyebrow">四川省 · ${state.practical.packVersion}</p><h2>${a.name}</h2><p>${a.chineseDescription}</p><h3>English practice</h3><p>${a.englishScript}</p><p class="muted">${a.chineseMeaning}</p><h3>现场问答</h3>${a.questions.map((q) => `<details><summary>${q.promptZh}</summary><p>${q.promptEn}</p><p class="muted">${q.answerGuideZh}</p></details>`).join("")}<p class="muted">自评：${state.practical.scoringDimensions.join(" · ")}</p></div>`;
}
function renderSettings() {
  const el = document.querySelector("#settings-view");
  const answered = totalAttempts();
  el.innerHTML = `<div class="card"><h2>我的</h2>
    <p>当前内容版本：<strong>${state.content.contentVersion}</strong> · 大纲版本 ${state.content.syllabusVersion}</p>
    <p class="muted">学习记录、错题和模考成绩只保存在这台设备上，不会上传服务器。换手机或重装前请先导出。</p>
    <h3>设备与安装</h3>
    <div class="settings-block" id="settings-install"></div>
    <h3>学习记录</h3>
    <p class="muted">已记录 ${answered} 次作答 · ${Object.keys(state.records).length} 道题 · ${state.mocks.length} 次模考</p>
    <p><button type="button" class="primary" id="export-record">导出学习记录</button></p>
    <p><label class="file-label">导入学习记录<input type="file" id="import-record" accept="application/json,.json"></label></p>
    <p id="record-message" class="muted"></p>
  </div>`;
  renderInstallGuide(el.querySelector("#settings-install"));
  el.querySelector("#export-record").addEventListener("click", exportRecord);
  el.querySelector("#import-record").addEventListener("change", importRecord);
}
function exportRecord() {
  const message = document.querySelector("#record-message");
  const payload = exportStudyRecord({ records: state.records, mocks: state.mocks, contentVersion: state.content.contentVersion });
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tourism-study-record-${payload.exportedAt.slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  if (message) message.textContent = `已导出学习记录（内容版本 ${payload.contentVersion || "未知"}）。`;
}
async function importRecord(event) {
  const input = event.target;
  const message = document.querySelector("#record-message");
  const file = input.files?.[0];
  if (!file) return;
  try {
    const payload = importStudyRecord(JSON.parse(await file.text()));
    state.records = payload.records; state.mocks = payload.mocks;
    save("tourism-study-records", state.records); save("tourism-mock-results", state.mocks);
    renderStats(); renderOutline(); renderSettings();
    const mismatch = describeVersionMismatch(payload.contentVersion, state.content.contentVersion);
    document.querySelector("#record-message").textContent = mismatch || "学习记录已导入。";
  } catch (error) {
    if (message) message.textContent = `导入失败：${error.message}`;
  } finally {
    input.value = "";
  }
}
function selectView(view) {
  state.selectedView = view; document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === view)); document.querySelectorAll(".view").forEach((s) => { s.hidden = s.id !== `${view}-view`; });
  if (view === "wrong") renderWrong(); if (view === "outline") renderOutline(); if (view === "mock") renderMock(); if (view === "practical") renderPractical(); if (view === "settings") renderSettings();
}
function assertContentContract(content) {
  const errors = validateQuestionTypeCatalog(content?.exam?.writtenExam?.questionTypes ?? []);
  if (errors.length) throw new Error(`题型清单无效：${errors.join("；")}`);
}
async function loadContent() {
  const response = await fetch("/api/exam");
  if (!response.ok) throw new Error("无法加载考试内容");
  const content = await response.json();
  assertContentContract(content);
  state.content = content;
  renderContentVersion();
  return state.content;
}
async function refreshContent() {
  const button = document.querySelector("#refresh-content");
  button.disabled = true;
  button.textContent = "刷新中…";
  try {
    const content = await loadContent();
    const count = validQuestions().length;
    const notice = document.querySelector("#notice");
    notice.textContent = `题库已刷新：可练习 ${count} 题，内容版本 ${content.contentVersion}。`;
    notice.hidden = false;
    renderStats();
    if (state.selectedView === "wrong") renderWrong();
    else if (state.selectedView === "outline") renderOutline();
    else if (state.selectedView === "mock") renderMock();
    else if (state.selectedView === "practical") renderPractical();
    else if (state.selectedView === "settings") renderSettings();
    else renderPractice(undefined, practiceQuestionId);
  } catch (error) {
    const notice = document.querySelector("#notice");
    notice.textContent = `题库刷新失败：${error.message}`;
    notice.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = "刷新题库";
  }
}
async function init() {
  const [contentResponse, practicalResponse] = await Promise.all([fetch("/api/exam"), fetch("/api/practical/sichuan")]);
  if (!contentResponse.ok || !practicalResponse.ok) throw new Error("无法加载考试内容");
  const content = await contentResponse.json();
  assertContentContract(content);
  state.content = content; state.practical = await practicalResponse.json();
  document.querySelector("#notice").textContent = state.content.notice; document.querySelector("#notice").hidden = false;
  if (state.content.donationUrl) { const link = document.querySelector("#donation-link"); link.href = state.content.donationUrl; link.target = "_blank"; link.hidden = false; }
  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => selectView(tab.dataset.view)));
  renderContentVersion(); renderStats(); renderPractice();
}
window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); state.installPrompt = event; });
document.querySelector("#refresh-content").addEventListener("click", refreshContent);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
init().catch((error) => { document.querySelector("#practice-view").innerHTML = `<div class="card"><h2>加载失败</h2><p>${error.message}</p></div>`; });
