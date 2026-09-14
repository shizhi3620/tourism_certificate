const state = { content: null, records: loadRecords(), selectedView: "practice" };

function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem("tourism-study-records") ?? "{}");
  } catch {
    return {};
  }
}

function saveRecords() {
  localStorage.setItem("tourism-study-records", JSON.stringify(state.records));
}

function recordFor(questionId) {
  return state.records[questionId] ?? { attempts: 0, correct: 0, wrong: false };
}

function renderStats() {
  const records = Object.values(state.records);
  const attempts = records.reduce((sum, record) => sum + record.attempts, 0);
  const correct = records.reduce((sum, record) => sum + record.correct, 0);
  const wrong = records.filter((record) => record.wrong).length;
  document.querySelector("#answered-count").textContent = attempts;
  document.querySelector("#correct-rate").textContent = attempts ? `${Math.round((correct / attempts) * 100)}%` : "—";
  document.querySelector("#wrong-count").textContent = wrong;
}

function renderPractice(questionIds = state.content.questions.map(({ id }) => id)) {
  const question = state.content.questions.find(({ id }) => id === questionIds[0]);
  const container = document.querySelector("#practice-view");
  if (!question) {
    container.innerHTML = '<div class="card"><h2>暂无可练习内容</h2><p class="muted">审核后的题目会显示在这里。</p></div>';
    return;
  }
  const record = recordFor(question.id);
  container.innerHTML = `
    <div class="card">
      <p class="eyebrow">${question.sourceType === "past_exam" ? "历年真题" : "章节练习"} · ${question.subject}</p>
      <h2>${question.prompt}</h2>
      <div class="question">${question.options.map((option, index) => `<button class="option" data-index="${index}">${String.fromCharCode(65 + index)}. ${option}</button>`).join("")}</div>
      <div id="result" class="result" hidden></div>
    </div>`;
  container.querySelectorAll(".option").forEach((button) => button.addEventListener("click", () => {
    const selected = Number(button.dataset.index);
    const correct = selected === question.answer;
    const next = recordFor(question.id);
    next.attempts += 1;
    next.correct += correct ? 1 : 0;
    next.wrong = !correct;
    state.records[question.id] = next;
    saveRecords();
    container.querySelectorAll(".option").forEach((option) => {
      option.disabled = true;
      if (Number(option.dataset.index) === question.answer) option.classList.add("correct");
      if (Number(option.dataset.index) === selected && !correct) option.classList.add("incorrect");
    });
    const result = container.querySelector("#result");
    result.hidden = false;
    result.innerHTML = `<strong>${correct ? "回答正确" : "回答错误"}</strong><br>${question.explanation}`;
    renderStats();
  }));
}

function renderWrong() {
  const wrong = state.content.questions.filter((question) => recordFor(question.id).wrong);
  document.querySelector("#wrong-view").innerHTML = `<div class="card"><h2>错题本</h2>${wrong.length ? wrong.map((question) => `<p>${question.prompt}</p>`).join("") : '<p class="muted">还没有错题，完成练习后会自动收录。</p>'}</div>`;
}

function renderOutline() {
  document.querySelector("#outline-view").innerHTML = `<div class="card"><h2>考纲进度</h2>${state.content.chapters.map((chapter) => `<p><strong>${chapter.name}</strong><br><span class="muted">${chapter.description}</span></p><div class="progress"><i style="width: ${recordFor("demo-001").attempts ? 100 : 0}%"></i></div>`).join("")}</div>`;
}

function selectView(view) {
  state.selectedView = view;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  document.querySelectorAll(".view").forEach((section) => { section.hidden = section.id !== `${view}-view`; });
  if (view === "wrong") renderWrong();
  if (view === "outline") renderOutline();
}

async function init() {
  const response = await fetch("/api/exam");
  if (!response.ok) throw new Error("无法加载考试内容");
  state.content = await response.json();
  document.querySelector("#notice").textContent = state.content.notice;
  document.querySelector("#notice").hidden = false;
  if (state.content.donationUrl) {
    const link = document.querySelector("#donation-link");
    link.href = state.content.donationUrl;
    link.target = "_blank";
    link.hidden = false;
  }
  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => selectView(tab.dataset.view)));
  renderStats();
  renderPractice();
}

init().catch((error) => {
  document.querySelector("#practice-view").innerHTML = `<div class="card"><h2>加载失败</h2><p>${error.message}</p></div>`;
});
