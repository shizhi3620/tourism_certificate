import { questionTypeFor } from "./question-types.js";

const form = document.querySelector("#import-form");
const result = document.querySelector("#result");
const generateButton = document.querySelector("#generate");
const reviewList = document.querySelector("#review-list");
const loadReviewButton = document.querySelector("#load-review");
const publishButton = document.querySelector("#publish");
const adminStatus = document.querySelector("#admin-status");
const reviewQueue = document.querySelector("#review-queue");
const materialsList = document.querySelector("#materials-list");
const materialsActions = document.querySelector("#materials-actions");
const selectAllMaterialsButton = document.querySelector("#select-all-materials");
const clearMaterialsButton = document.querySelector("#clear-materials");
const loadMaterialsButton = document.querySelector("#load-materials");
let token;
let textPath;
let materials = [];
let generationContext = {};
let questionTypes = [];
const typeFor = (item) => questionTypeFor(questionTypes, item?.type);
const isMultiple = (item) => typeFor(item)?.selectionMode === "multiple";

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
}[character]));
function authHeaders(extra = {}) {
  const value = String(token ?? "").trim();
  if (!value) throw new Error("请先输入管理令牌");
  if (!/^[\x00-\x7f]+$/.test(value)) {
    throw new Error("管理令牌只能包含英文、数字和符号，请确认没有粘贴中文或全角空格");
  }
  return { ...extra, authorization: `Bearer ${value}` };
}
function showAdminStatus(message) {
  adminStatus.textContent = message;
  adminStatus.hidden = false;
}

async function publish() {
  const queue = reviewQueue.value;
  const queueLabel = queue === "practical" ? "现场材料" : "笔试题";
  if (!confirm(`只发布当前${queueLabel}队列中审核状态为“approved”的内容，继续吗？`)) return;
  try {
    const response = await fetch(`/api/admin/publish?queue=${queue}`, {
      method: "POST",
      headers: authHeaders(),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "发布失败");
    const skipped = (payload.skipped ?? []).map((item) => `${item.id}：${item.reasons.join("、")}`).join("；");
    const total = payload.totalQuestions ?? payload.totalAttractions ?? "未知";
    const version = payload.contentVersion ?? payload.packVersion;
    showAdminStatus(`已发布 ${payload.published} 条，当前${queueLabel}共 ${total} 条，版本 ${version}。${skipped ? `以下内容因异常保留待处理：${skipped}` : ""}审核列表已刷新。`);
    await loadReview();
  } catch (error) {
    showAdminStatus(`发布失败：${error.message}`);
  }
}

function answerLabel(answer, options = []) {
  if (Array.isArray(answer)) return answer.map((index) => `${String.fromCharCode(65 + index)}（第 ${index + 1} 项）`).join("、") || "待确认";
  if (!Number.isInteger(answer)) return "待确认";
  const letter = String.fromCharCode(65 + answer);
  return options[answer] ? `${letter}（第 ${answer + 1} 项）` : `${letter}（第 ${answer + 1} 项，超出选项）`;
}

function setMaterialSelection(selected) {
  materialsList.querySelectorAll("input[data-text-path]").forEach((input) => {
    input.checked = selected && input.dataset.active === "true";
  });
}

selectAllMaterialsButton.addEventListener("click", () => setMaterialSelection(true));
clearMaterialsButton.addEventListener("click", () => setMaterialSelection(false));

function renderMaterials() {
  materialsList.innerHTML = materials.length
    ? materials.map((material) => `<label><input type="checkbox" data-material-id="${escapeHtml(material.id)}" data-text-path="${escapeHtml(material.textPath)}" data-active="${material.active}" ${material.active ? "checked" : ""}> ${escapeHtml(material.role)} · ${escapeHtml(material.filename)} · ${escapeHtml(material.subject ?? "未指定科目")} · ${material.active ? "已启用" : "已停用"}</label>`).join("")
    : '<p class="muted">暂无已保存材料，首次上传教材或大纲后会出现在这里。</p>';
  materialsActions.hidden = !materials.length;
  materialsList.querySelectorAll("input[data-material-id]").forEach((input) => {
    input.addEventListener("change", async () => {
      const response = await fetch("/api/admin/materials", {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ id: input.dataset.materialId, active: input.checked }),
      });
      if (!response.ok) input.checked = !input.checked;
    });
  });
}

async function loadMaterials() {
  const response = await fetch("/api/admin/materials", { headers: authHeaders() });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "材料库加载失败");
  materials = payload.materials ?? [];
  renderMaterials();
  generateButton.hidden = false;
}

loadMaterialsButton.addEventListener("click", async () => {
  try {
    token = form.querySelector('[name="token"]').value.trim();
    await loadMaterials();
  } catch (error) {
    materialsList.textContent = error.message;
  }
});

form.querySelector('[name="token"]').addEventListener("change", async (event) => {
  token = event.target.value.trim();
  if (!token) return;
  try {
    await loadMaterials();
  } catch (error) {
    materialsList.textContent = error.message;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  token = data.get("token");
  data.delete("token");
  result.hidden = false;
  result.textContent = "正在上传并提取文本…";
  try {
    const response = await fetch("/api/admin/import", {
      method: "POST",
      headers: authHeaders(),
      body: data,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "上传失败");
    textPath = payload.textPath;
    generationContext = {
      mode: data.get("mode") || "written_simulation",
      subject: data.get("subject") || "",
      chapter: data.get("chapter") || "",
      region: data.get("region") || "全国",
    };
    await loadMaterials();
    generateButton.hidden = false;
    result.textContent = payload.ocrRequired
      ? `提取到的文字较少（${payload.extractedCharacters} 个字符），请先对扫描 PDF 做 OCR，再生成草稿。`
      : `已处理全部上传材料（${payload.extractionMethod === "ocr" ? "DeepSeek OCR" : "本地文本层提取"}），共 ${payload.extractedCharacters} 个字符，可继续生成待审核草稿。`;
  } catch (error) {
    result.textContent = error.message;
  }
});

generateButton.addEventListener("click", async () => {
  result.hidden = false;
  result.textContent = "正在调用 DeepSeek…";
  try {
    const formData = new FormData(form);
    const response = await fetch("/api/admin/generate", {
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({
        ...generationContext,
        mode: formData.get("mode") || generationContext.mode || "written_simulation",
        subject: formData.get("subject") || generationContext.subject || "",
        region: formData.get("region") || generationContext.region || "全国",
        chapter: formData.get("chapter") || generationContext.chapter || "",
        textPaths: [
          textPath,
          ...[...materialsList.querySelectorAll("input[data-text-path]:checked")].map((input) => input.dataset.textPath),
        ].filter(Boolean).filter((path, index, paths) => paths.indexOf(path) === index),
      }),
    });

    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "生成失败");
    const coverage = payload.syllabusCoverage;
    const coverageText = coverage
      ? `大纲覆盖率（估算）：${coverage.covered}/${coverage.total}（${coverage.percent}%）`
      : "未找到已选择的大纲材料，暂无法计算覆盖率";
    reviewQueue.value = payload.queue ?? (payload.mode === "practical_material" ? "practical" : "written");
    result.textContent = `已生成待审核草稿：${payload.outputPath}。${coverageText} 请人工审核后再发布。`;
  } catch (error) {
    result.textContent = error.message;
  }
});

publishButton.addEventListener("click", publish);

async function loadReview() {
  reviewList.textContent = "正在加载…";
  try {
    const response = await fetch(`/api/admin/review?queue=${reviewQueue.value}`, { headers: authHeaders() });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "加载失败");
    reviewList.innerHTML = "";
    questionTypes = payload.questionTypes ?? [];
    const items = payload.items ?? [];
    const toolbar = document.createElement("div");
    toolbar.className = "review-toolbar";
    const coverage = payload.syllabusCoverage;
    const coverageText = payload.queue === "practical" ? "现场材料独立审核队列" : coverage ? `大纲覆盖率（估算）：${coverage.covered}/${coverage.total}（${coverage.percent}%）` : "大纲覆盖率：暂无数据";
    const itemLabel = payload.queue === "practical" ? "条材料" : "题";
    toolbar.innerHTML = `<p>共 ${items.length} ${itemLabel}，异常 ${items.filter((item) => item.reviewFlags.length).length} ${itemLabel} · ${coverageText}</p><label><input type="checkbox" data-action="select-all-review"> 全选内容</label><button class="small" data-action="approve">批量通过选中内容</button><button class="small" data-action="reject">批量驳回选中内容</button>`;
    reviewList.append(toolbar);
    if (payload.queue === "practical") {
      for (const item of items) {
        const card = document.createElement("article");
        card.className = `review-card review-${item.reviewStatus}`;
        const flags = item.reviewFlags.length ? `<p class="notice">${escapeHtml(item.reviewFlags.join("；"))}</p>` : "";
        const sourcePages = Array.isArray(item.sourcePages) ? item.sourcePages : item.sourcePages ? [item.sourcePages] : [];
        card.innerHTML = `<label><input type="checkbox" data-id="${escapeHtml(item.id)}"> 选择此材料</label>${flags}<h3>${escapeHtml(item.name ?? item.id)}</h3><p>现场材料 · 景点 ${escapeHtml(item.attractionId ?? "待补充")}</p><h4>中文讲解</h4><p>${escapeHtml(item.chineseDescription ?? "待补充")}</p><h4>English script</h4><p>${escapeHtml(item.englishScript ?? "待补充")}</p><h4>中文释义</h4><p>${escapeHtml(item.chineseMeaning ?? "待补充")}</p><h4>现场问答</h4>${(item.questions ?? []).map((question) => `<details><summary>${escapeHtml(question.promptZh ?? question.id)}</summary><p>${escapeHtml(question.promptEn ?? "")}</p><p class="muted">${escapeHtml(question.answerGuideZh ?? "")}</p></details>`).join("") || '<p class="muted">暂无问答。</p>'}<p class="review-meta"><span class="review-status">审核状态：${escapeHtml(item.reviewStatus)}</span><br>来源：${escapeHtml(sourcePages.join(", "))}　${escapeHtml(item.sourceExcerpt ?? "待补充")}<br>${escapeHtml(item.sourceNote ?? "待补充")}</p>`;
        reviewList.append(card);
      }
    } else {
      for (const item of items) {
        const card = document.createElement("article");
        card.className = `review-card review-${item.reviewStatus}`;
        const flags = item.reviewFlags.length ? `<p class="notice">${escapeHtml(item.reviewFlags.join("；"))}</p>` : "";
        const multiple = isMultiple(item);
        const answerEditor = multiple
          ? (item.options ?? []).map((option, index) => `<label><input type="checkbox" data-answer-option value="${index}" ${Array.isArray(item.answer) && item.answer.includes(index) ? "checked" : ""}> ${String.fromCharCode(65 + index)}（第 ${index + 1} 项）</label>`).join("")
          : (item.options ?? []).map((option, index) => `<option value="${index}" ${item.answer === index ? "selected" : ""}>${String.fromCharCode(65 + index)}（第 ${index + 1} 项）</option>`).join("");
        const editor = multiple
          ? (answerEditor ? `<fieldset><legend>人工确认答案（可多选）</legend>${answerEditor}</fieldset>` : "")
          : (answerEditor ? `<label>人工确认答案<select data-answer>${answerEditor}</select></label>` : "");
        const sourcePages = Array.isArray(item.sourcePages) ? item.sourcePages : item.sourcePages ? [item.sourcePages] : [];
        card.innerHTML = `<label><input type="checkbox" data-id="${escapeHtml(item.id)}"> 选择此题</label>${flags}<h3>${escapeHtml(item.prompt ?? item.title ?? item.id)}</h3><p>题型：${escapeHtml(typeFor(item)?.label ?? item.type ?? "未指定")}<br>${(item.options ?? []).map((option, index) => `${String.fromCharCode(65 + index)}. ${escapeHtml(option)}`).join("<br>")}</p><p class="review-meta"><span class="review-status">审核状态：${escapeHtml(item.reviewStatus)}</span><br>答案：${escapeHtml(answerLabel(item.answer, item.options))}<br>教材：${escapeHtml(item.textbookSubject ?? "待补充")} / ${escapeHtml(item.textbookChapter ?? "待补充")}<br>大纲：${escapeHtml(item.syllabusRequirement ?? "待补充")}<br>来源：${escapeHtml(sourcePages.join(", "))}　${escapeHtml(item.sourceExcerpt ?? "待补充")}</p>${editor}${editor ? '<button type="button" class="small" data-save-answer>保存答案</button>' : ""}`;
        card.querySelector("[data-save-answer]")?.addEventListener("click", async () => {
          try {
            const answer = isMultiple(item)
              ? [...card.querySelectorAll("[data-answer-option]:checked")].map((input) => Number(input.value))
              : Number(card.querySelector("[data-answer]").value);
            await saveReviewFields(item.id, { answer });
          } catch (error) {
            reviewList.insertAdjacentHTML("afterbegin", `<p class="notice">答案保存失败：${escapeHtml(error.message)}</p>`);
          }
        });
        reviewList.append(card);
      }
    }

    async function saveReviewFields(id, fields) {
      const response = await fetch(`/api/admin/review?queue=${reviewQueue.value}`, {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ items: [{ id, ...fields }] }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "保存失败");
      await loadReview();
    }
    const save = async (status) => {
      const ids = [...reviewList.querySelectorAll("input[data-id]:checked")].map((input) => input.dataset.id);
      if (!ids.length) {
        reviewList.insertAdjacentHTML("afterbegin", `<p class="notice">请先选择至少一道题。</p>`);
        return;
      }
      try {
        const saveResponse = await fetch(`/api/admin/review?queue=${reviewQueue.value}`, {
          method: "POST",
          headers: authHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ items: ids.map((id) => ({ id, reviewStatus: status })) }),
        });
        const saved = await saveResponse.json();
        if (!saveResponse.ok) throw new Error(saved.error ?? "审核状态更新失败");
        const blocked = (saved.blocked ?? []).map((item) => `${item.id}：${item.reasons.join("、")}`).join("；");
        showAdminStatus(`已${status === "approved" ? "通过" : "驳回"} ${saved.updated ?? ids.length} 题，审核列表已刷新。${blocked ? `以下题目仍为待审核：${blocked}` : ""}`);
        await loadReview();
      } catch (error) {
        showAdminStatus(`审核更新失败：${error.message}`);
      }
    };
    toolbar.querySelector('[data-action="select-all-review"]').onchange = (event) => {
      reviewList.querySelectorAll("input[data-id]").forEach((input) => { input.checked = event.target.checked; });
    };
    toolbar.querySelector('[data-action="approve"]').onclick = () => save("approved");
    toolbar.querySelector('[data-action="reject"]').onclick = () => save("rejected");
  } catch (error) {
    reviewList.innerHTML = `<p class="notice">加载失败：${escapeHtml(error.message)}</p>`;
  }
}

loadReviewButton.addEventListener("click", loadReview);
reviewQueue.addEventListener("change", loadReview);
