const form = document.querySelector("#import-form");
const result = document.querySelector("#result");
const generateButton = document.querySelector("#generate");
const reviewList = document.querySelector("#review-list");
const loadReviewButton = document.querySelector("#load-review");
const publishButton = document.querySelector("#publish");
const materialsList = document.querySelector("#materials-list");
const materialsActions = document.querySelector("#materials-actions");
const selectAllMaterialsButton = document.querySelector("#select-all-materials");
const clearMaterialsButton = document.querySelector("#clear-materials");
const loadMaterialsButton = document.querySelector("#load-materials");
let token;
let textPath;
let materials = [];

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

async function publish() {
  if (!confirm("只发布审核状态为“approved”的笔试题，继续吗？")) return;
  try {
    const response = await fetch("/api/admin/publish", {
      method: "POST",
      headers: authHeaders(),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "发布失败");
    reviewList.insertAdjacentHTML("afterbegin", `<p class="notice">已发布 ${payload.published} 题，内容版本 ${payload.contentVersion}。审核列表已刷新。</p>`);
    await loadReview();
  } catch (error) {
    reviewList.insertAdjacentHTML("afterbegin", `<p class="notice">发布失败：${escapeHtml(error.message)}</p>`);
  }
}

function answerLabel(answer, options = []) {
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
    const response = await fetch("/api/admin/generate", {
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({
        textPaths: [
          textPath,
          ...[...materialsList.querySelectorAll("input[data-text-path]:checked")].map((input) => input.dataset.textPath),
        ].filter(Boolean).filter((path, index, paths) => paths.indexOf(path) === index),
      }),
    });

    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "生成失败");
    result.textContent = `已生成待审核草稿：${payload.outputPath}。请人工审核后再发布。`;
  } catch (error) {
    result.textContent = error.message;
  }
});

publishButton.addEventListener("click", publish);

async function loadReview() {
  reviewList.textContent = "正在加载…";
  try {
    const response = await fetch("/api/admin/review", { headers: authHeaders() });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "加载失败");
    reviewList.innerHTML = "";
    const items = payload.items ?? [];
    const toolbar = document.createElement("div");
    toolbar.className = "review-toolbar";
    toolbar.innerHTML = `<p>共 ${items.length} 题，异常 ${items.filter((item) => item.reviewFlags.length).length} 题</p><label><input type="checkbox" data-action="select-all-review"> 全选题目</label><button class="small" data-action="approve">批量通过选中题目</button><button class="small" data-action="reject">批量驳回选中题目</button>`;
    reviewList.append(toolbar);
    for (const item of items) {
    const card = document.createElement("article");
    card.className = `review-card review-${item.reviewStatus}`;
    const flags = item.reviewFlags.length ? `<p class="notice">${escapeHtml(item.reviewFlags.join("；"))}</p>` : "";
    card.innerHTML = `<label><input type="checkbox" data-id="${escapeHtml(item.id)}"> 选择此题</label>${flags}<h3>${escapeHtml(item.prompt ?? item.title ?? item.id)}</h3><p>${(item.options ?? []).map((option, index) => `${String.fromCharCode(65 + index)}. ${escapeHtml(option)}`).join("<br>")}</p><p class="review-meta"><span class="review-status">审核状态：${escapeHtml(item.reviewStatus)}</span><br>答案：${escapeHtml(answerLabel(item.answer, item.options))}<br>教材：${escapeHtml(item.textbookSubject ?? "待补充")} / ${escapeHtml(item.textbookChapter ?? "待补充")}<br>大纲：${escapeHtml(item.syllabusRequirement ?? "待补充")}<br>来源：${escapeHtml((item.sourcePages ?? []).join(", "))}　${escapeHtml(item.sourceExcerpt ?? "待补充")}</p>`;
      reviewList.append(card);
    }
    const save = async (status) => {
      const ids = [...reviewList.querySelectorAll("input[data-id]:checked")].map((input) => input.dataset.id);
      if (!ids.length) {
        reviewList.insertAdjacentHTML("afterbegin", `<p class="notice">请先选择至少一道题。</p>`);
        return;
      }
      try {
        const saveResponse = await fetch("/api/admin/review", {
          method: "POST",
          headers: authHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ items: ids.map((id) => ({ id, reviewStatus: status })) }),
        });
        const saved = await saveResponse.json();
        if (!saveResponse.ok) throw new Error(saved.error ?? "审核状态更新失败");
        reviewList.insertAdjacentHTML("afterbegin", `<p class="notice">已${status === "approved" ? "通过" : "驳回"} ${saved.updated ?? ids.length} 题，审核列表已刷新。</p>`);
        await loadReview();
      } catch (error) {
        reviewList.insertAdjacentHTML("afterbegin", `<p class="notice">审核更新失败：${escapeHtml(error.message)}</p>`);
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
