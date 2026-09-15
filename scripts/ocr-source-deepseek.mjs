import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

const inputPath = process.argv[2];
const outputPath = process.argv[3] ?? inputPath?.replace(/\.pdf$/i, ".ocr.txt");
if (!inputPath || !/\.pdf$/i.test(inputPath)) {
  console.error("Usage: npm run ocr:source -- source.pdf [output.txt]");
  process.exit(1);
}
const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) throw new Error("DEEPSEEK_API_KEY is required for DeepSeek OCR");
const model = process.env.DEEPSEEK_OCR_MODEL ?? "deepseek-chat";
const baseUrl = (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1").replace(/\/$/, "");
const root = resolve(".");
const workDirectory = resolve("content/drafts", `ocr-${Date.now()}`);
await mkdir(workDirectory, { recursive: true });
await new Promise((resolvePromise, reject) => {
  const child = spawn("swift", ["scripts/render-pdf-pages.swift", resolve(inputPath), workDirectory], { cwd: root });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", (code) => code === 0 ? resolvePromise() : reject(new Error(stderr || `PDF rendering failed with ${code}`)));
});
const pages = (await readdir(workDirectory)).filter((name) => extname(name) === ".png").sort();
if (!pages.length) throw new Error("PDF contains no renderable pages");
const sections = [];
for (const [index, page] of pages.entries()) {
  const image = (await readFile(join(workDirectory, page))).toString("base64");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "请逐字识别图片中的中文文字。保留题号、选项、答案、表格和页眉页脚，不要总结，不要补写看不清的内容；看不清处写[无法识别]。" },
          { type: "image_url", image_url: { url: `data:image/png;base64,${image}` } },
        ],
      }],
    }),
  });
  if (!response.ok) throw new Error(`DeepSeek OCR failed on page ${index + 1}: ${response.status} ${await response.text()}`);
  const payload = await response.json();
  sections.push(`\n\n===== OCR PAGE ${index + 1} =====\n${payload.choices?.[0]?.message?.content ?? ""}`);
  console.log(`OCR page ${index + 1}/${pages.length}`);
}
await writeFile(resolve(outputPath), sections.join(""), "utf8");
console.log(`Wrote OCR text to ${outputPath}`);
