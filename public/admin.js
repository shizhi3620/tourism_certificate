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
      : `已提取 ${payload.extractedCharacters} 个字符，可继续调用 DeepSeek 生成待审核草稿。`;
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
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "生成失败");
    result.textContent = `已生成待审核草稿：${payload.outputPath}。请人工审核后再发布。`;
  } catch (error) {
    result.textContent = error.message;
  }
});
