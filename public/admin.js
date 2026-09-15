const form = document.querySelector("#import-form");
const result = document.querySelector("#result");
const generateButton = document.querySelector("#generate");
let token;
let textPath;

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
      headers: { authorization: `Bearer ${token}` },
      body: data,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "上传失败");
    textPath = payload.textPath;
    generateButton.hidden = false;
    result.textContent = payload.ocrRequired
      ? `提取到的文字较少（${payload.extractedCharacters} 个字符），请先对扫描 PDF 做 OCR，再生成草稿。`
      : `已处理全部上传材料（${payload.ocrUsed ? "已使用 DeepSeek OCR" : "文本提取"}），共 ${payload.extractedCharacters} 个字符，可继续生成待审核草稿。`;
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
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ textPath }),
    });

    const reviewList = document.querySelector("#review-list");
    const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
    }[character]));
    document.querySelector("#load-review").addEventListener("click", async () => {
      reviewList.textContent = "正在加载…";
      const response = await fetch("/api/admin/review", { headers: { authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) {
        reviewList.textContent = payload.error ?? "加载失败";
        return;
      }
      reviewList.innerHTML = "";
      const items = payload.items ?? [];
      const toolbar = document.createElement("div");
      toolbar.innerHTML = `<p>共 ${items.length} 题，异常 ${items.filter((item) => item.reviewFlags.length).length} 题</p><button class="small" data-action="approve">批量通过</button> <button class="small" data-action="reject">批量驳回</button>`;
      reviewList.append(toolbar);
      for (const item of items) {
        const card = document.createElement("article");
        card.className = "card question";
        const flags = item.reviewFlags.length ? `<p class="notice">${escapeHtml(item.reviewFlags.join("；"))}</p>` : "";
        card.innerHTML = `<label><input type="checkbox" data-id="${escapeHtml(item.id)}" ${item.reviewStatus === "approved" ? "checked" : ""}> ${escapeHtml(item.reviewStatus)}</label>${flags}<h3>${escapeHtml(item.prompt ?? item.title ?? item.id)}</h3><p>${(item.options ?? []).map((option, index) => `${String.fromCharCode(65 + index)}. ${escapeHtml(option)}`).join("<br>")}</p><p class="muted">答案：${escapeHtml(item.answer ?? "待确认")}　来源：${escapeHtml(item.sourceNote ?? "待补充")}</p>`;
        reviewList.append(card);
      }
      const save = async (status) => {
        const ids = [...reviewList.querySelectorAll("input[data-id]:checked")].map((input) => input.dataset.id);
        const result = await fetch("/api/admin/review", {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({ items: ids.map((id) => ({ id, reviewStatus: status })) }),
        });
        document.querySelector("#publish").addEventListener("click", async () => {
          if (!confirm("只发布审核状态为“approved”的笔试题，继续吗？")) return;
          const response = await fetch("/api/admin/publish", {
            method: "POST",
            headers: { authorization: `Bearer ${token}` },
          });
          const payload = await response.json();
          reviewList.insertAdjacentHTML("afterbegin", `<p class="notice">${response.ok ? `已发布 ${payload.published} 题，内容版本 ${payload.contentVersion}` : escapeHtml(payload.error ?? "发布失败")}</p>`);
        });
        const saved = await result.json();
        reviewList.insertAdjacentHTML("afterbegin", `<p class="notice">已更新 ${saved.updated ?? 0} 题</p>`);
      };
      toolbar.querySelector('[data-action="approve"]').onclick = () => save("approved");
      toolbar.querySelector('[data-action="reject"]').onclick = () => save("rejected");
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "生成失败");
    result.textContent = `已生成待审核草稿：${payload.outputPath}。请人工审核后再发布。`;
  } catch (error) {
    result.textContent = error.message;
  }
});
