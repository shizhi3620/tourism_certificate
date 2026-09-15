const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback)); } catch { return fallback; } };
const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const state = { content: null, practical: null, records: load("tourism-study-records", {}), mocks: load("tourism-mock-results", []), selectedView: "practice", mock: null, mockTimer: null };
const recordFor = (id) => state.records[id] ?? { attempts: 0, correct: 0, wrong: false };
const label = (q) => q.sourceType === "past_exam" ? `历年真题 · ${q.year} · ${q.region}` : q.sourceType === "mock" ? "模拟题" : "示例题";
function renderStats() {
  const records = Object.values(state.records), attempts = records.reduce((n, r) => n + r.attempts, 0), correct = records.reduce((n, r) => n + r.correct, 0);
  document.querySelector("#answered-count").textContent = attempts;
  document.querySelector("#correct-rate").textContent = attempts ? `${Math.round(correct / attempts * 100)}%` : "—";
  document.querySelector("#wrong-count").textContent = records.filter((r) => r.wrong).length;
}
function answer(question, selected, container, onDone = () => {}) {
  const correct = selected === question.answer, record = recordFor(question.id);
  record.attempts += 1; record.correct += correct ? 1 : 0; record.wrong = !correct; state.records[question.id] = record; save("tourism-study-records", state.records);
  container.querySelectorAll(".option").forEach((button) => { button.disabled = true; if (+button.dataset.index === question.answer) button.classList.add("correct"); if (+button.dataset.index === selected && !correct) button.classList.add("incorrect"); });
  const result = container.querySelector(".result"); result.hidden = false;
  result.innerHTML = `<strong>${correct ? "回答正确" : "回答错误"}</strong> · 正确答案：${String.fromCharCode(65 + question.answer)}<br>${question.explanation}`;
  renderStats(); renderWrong(); renderOutline(); onDone(correct);
}
function renderPractice(ids = state.content.questions.map((q) => q.id)) {
  const q = state.content.questions.find((item) => item.id === ids[0]), el = document.querySelector("#practice-view");
  if (!q) return void (el.innerHTML = '<div class="card"><h2>暂无可练习内容</h2><p class="muted">审核后的题目会显示在这里。</p></div>');
  el.innerHTML = `<div class="card"><p class="eyebrow">${label(q)} · ${q.subject}</p><h2>${q.prompt}</h2><p class="muted">${q.sourceNote}</p><div class="question">${q.options.map((o, i) => `<button class="option" data-index="${i}">${String.fromCharCode(65 + i)}. ${o}</button>`).join("")}</div><div class="result" hidden></div></div>`;
  el.querySelectorAll(".option").forEach((b) => b.addEventListener("click", () => answer(q, +b.dataset.index, el)));
}
function renderWrong() {
  const wrong = state.content.questions.filter((q) => recordFor(q.id).wrong), el = document.querySelector("#wrong-view");
  el.innerHTML = `<div class="card"><h2>错题本</h2>${wrong.length ? wrong.map((q) => `<article class="list-item"><p>${q.prompt}</p><button class="small" data-id="${q.id}">重新练习</button></article>`).join("") : '<p class="muted">还没有错题，完成练习后会自动收录。</p>'}</div>`;
  el.querySelectorAll("[data-id]").forEach((b) => b.addEventListener("click", () => { selectView("practice"); renderPractice([b.dataset.id]); }));
}
function renderOutline() {
  const el = document.querySelector("#outline-view");
  const past = state.content.questions.filter((q) => q.sourceType === "past_exam"), pastAttempts = past.reduce((n, q) => n + recordFor(q.id).attempts, 0), pastCorrect = past.reduce((n, q) => n + recordFor(q.id).correct, 0);
  el.innerHTML = `<div class="card"><h2>考纲进度</h2><p class="muted">内容版本 ${state.content.contentVersion} · 大纲版本 ${state.content.syllabusVersion}</p><p>历年真题表现：${pastAttempts ? `${Math.round(pastCorrect / pastAttempts * 100)}%（${pastAttempts} 次）` : "暂无记录"} · 模考次数：${state.mocks.length}</p>${state.content.chapters.map((c) => { const qs = state.content.questions.filter((q) => q.chapterId === c.id), done = qs.filter((q) => recordFor(q.id).attempts).length; return `<p><strong>${c.name}</strong><br><span class="muted">${c.description} · ${done}/${qs.length} 题已练习</span></p><div class="progress"><i style="width:${qs.length ? done / qs.length * 100 : 0}%"></i></div>`; }).join("")}</div>`;
}
function renderMock() {
  const el = document.querySelector("#mock-view");
  if (state.mockTimer) { clearInterval(state.mockTimer); state.mockTimer = null; }
  if (state.mock) {
    const answered = Object.keys(state.mock.answers).length;
    el.innerHTML = `<div class="card"><h2>整卷模考 <span class="timer">${Math.max(0, Math.ceil((state.mock.ends - Date.now()) / 1000))}s</span></h2><p>已完成 ${answered}/${state.mock.questions.length} 题</p>${state.mock.questions.map((q, i) => `<div class="mock-q"><p><strong>${i + 1}. ${q.prompt}</strong></p>${q.options.map((o, j) => `<button class="option ${state.mock.answers[q.id] === j ? "selected" : ""}" data-q="${q.id}" data-index="${j}">${String.fromCharCode(65 + j)}. ${o}</button>`).join("")}</div>`).join("")}<button id="submit-mock" class="primary">交卷</button></div>`;
    el.querySelectorAll(".mock-q .option").forEach((b) => b.addEventListener("click", () => { state.mock.answers[b.dataset.q] = +b.dataset.index; renderMock(); }));
    el.querySelector("#submit-mock").addEventListener("click", submitMock);
    state.mockTimer = setInterval(() => {
      if (Date.now() >= state.mock.ends) return submitMock();
      const timer = el.querySelector(".timer");
      if (timer) timer.textContent = `${Math.max(0, Math.ceil((state.mock.ends - Date.now()) / 1000))}s`;
    }, 1000);
    return;
  }
  el.innerHTML = `<div class="card"><h2>整卷模考</h2><p>版本 ${state.content.mockConfig.version} · ${state.content.mockConfig.questionCount} 题 · ${state.content.mockConfig.durationMinutes} 分钟</p><button id="start-mock" class="primary">开始模考</button><h3>历史成绩</h3>${state.mocks.length ? state.mocks.map((m) => `<p>${new Date(m.finishedAt).toLocaleString()} · ${m.score}/${m.total}（${m.percent}%）</p>`).join("") : '<p class="muted">暂无模考记录。</p>'}</div>`;
  el.querySelector("#start-mock").addEventListener("click", () => { state.mock = { questions: state.content.questions.filter((q) => state.content.mockConfig.questionIds.includes(q.id)), answers: {}, ends: Date.now() + state.content.mockConfig.durationMinutes * 60000 }; renderMock(); });
}
function submitMock() {
  if (!state.mock) return;
  const score = state.mock.questions.reduce((n, q) => n + (state.mock.answers[q.id] === q.answer ? 1 : 0), 0), result = { finishedAt: new Date().toISOString(), score, total: state.mock.questions.length, percent: Math.round(score / state.mock.questions.length * 100) };
  if (state.mockTimer) { clearInterval(state.mockTimer); state.mockTimer = null; }
  state.mocks.unshift(result); save("tourism-mock-results", state.mocks); state.mock = null; renderMock();
}
function renderPractical() {
  const el = document.querySelector("#practical-view"), a = state.practical.attractions[0];
  el.innerHTML = `<div class="card"><p class="eyebrow">四川省 · ${state.practical.packVersion}</p><h2>${a.name}</h2><p>${a.chineseDescription}</p><h3>English practice</h3><p>${a.englishScript}</p><p class="muted">${a.chineseMeaning}</p><h3>现场问答</h3>${a.questions.map((q) => `<details><summary>${q.promptZh}</summary><p>${q.promptEn}</p><p class="muted">${q.answerGuideZh}</p></details>`).join("")}<p class="muted">自评：${state.practical.scoringDimensions.join(" · ")}</p></div>`;
}
function selectView(view) {
  state.selectedView = view; document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === view)); document.querySelectorAll(".view").forEach((s) => { s.hidden = s.id !== `${view}-view`; });
  if (view === "wrong") renderWrong(); if (view === "outline") renderOutline(); if (view === "mock") renderMock(); if (view === "practical") renderPractical();
}
async function init() {
  const [contentResponse, practicalResponse] = await Promise.all([fetch("/api/exam"), fetch("/api/practical/sichuan")]);
  if (!contentResponse.ok || !practicalResponse.ok) throw new Error("无法加载考试内容");
  state.content = await contentResponse.json(); state.practical = await practicalResponse.json();
  document.querySelector("#notice").textContent = state.content.notice; document.querySelector("#notice").hidden = false;
  if (state.content.donationUrl) { const link = document.querySelector("#donation-link"); link.href = state.content.donationUrl; link.target = "_blank"; link.hidden = false; }
  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => selectView(tab.dataset.view)));
  renderStats(); renderPractice();
}
document.querySelector("#refresh-content").addEventListener("click", () => window.location.reload());
init().catch((error) => { document.querySelector("#practice-view").innerHTML = `<div class="card"><h2>加载失败</h2><p>${error.message}</p></div>`; });
