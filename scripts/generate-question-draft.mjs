import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

const sourceTextPath = process.argv[2];
const outputPath = process.argv[3] ?? "content/drafts/questions-pending-review.json";
if (!sourceTextPath) {
  console.error("Usage: npm run generate:draft -- content/sources/<id>.txt [output.json]");
  process.exit(1);
}

const apiKey = process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY;
const baseUrl = (process.env.DEEPSEEK_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "https://api.deepseek.com/v1").replace(/\/$/, "");
const model = process.env.DEEPSEEK_MODEL ?? process.env.OPENAI_MODEL ?? "deepseek-chat";
if (!apiKey) throw new Error("DEEPSEEK_API_KEY is required; no question draft was generated");

const source = await readFile(resolve(sourceTextPath), "utf8");
const manifestPath = resolve(dirname(sourceTextPath), `${basename(sourceTextPath, ".txt")}.json`);
let manifest = {};
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const subject = manifest.subject ?? "待审核";
const region = manifest.region ?? "全国";
const mode = manifest.mode ?? "written_simulation";
const instructions = {
  past_paper: "从历年真题及答案中逐题拆分，保留题干、全部选项、正确答案和解析；不得改写成模拟题。",
  written_simulation: "结合教材和全国笔试大纲生成中文单选模拟题；只生成原文和大纲能够支持的内容。",
  practical_material: "结合现场考试大纲生成现场讲解材料，可包含景点讲解提纲、中文要点、英文表达和问答训练；不要生成全国笔试题。",
}[mode] ?? "只生成原文能够支持的中文学习材料。";
const prompt = `${instructions}
不要编造法规、年份、数字或结论。所有输出都必须标记 pending_review，不能声称是官方真题。
输出严格 JSON 数组。笔试题字段为：
{"id":"draft-...","chapterId":"待审核","subject":"${subject}","type":"single_choice","sourceType":"${mode === "past_paper" ? "past_exam" : "self_authored"}","sourceStatus":"pending_review","sourceNote":"教材文件名和页码待人工补充","year":null,"region":"${region}","prompt":"...","options":["...","...","...","..."],"answer":0,"explanation":"..."}。
现场材料字段为：
{"id":"draft-...","region":"${region}","type":"practical_material","sourceStatus":"pending_review","title":"...","outlinePoints":["..."],"scriptZh":"...","scriptEn":"...","qa":[{"questionEn":"...","answerEn":"...","answerZh":"..."}]}。

来源文件：${basename(sourceTextPath)}
原文：
${source.slice(0, 120000)}`;

const response = await fetch(`${baseUrl}/chat/completions`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model,
    temperature: 0.1,
    messages: [
      { role: "system", content: "你是旅游考试内容草稿生成器，只输出合法 JSON。" },
      { role: "user", content: prompt },
    ],
  }),
});
if (!response.ok) throw new Error(`question generation failed: ${response.status} ${await response.text()}`);
const payload = await response.json();
const content = payload.choices?.[0]?.message?.content;
if (!content) throw new Error("question generation returned no content");
const jsonText = content.match(/```json\s*([\s\S]*?)\s*```/)?.[1] ?? content;
const items = JSON.parse(jsonText);
if (!Array.isArray(items) || items.some((item) => item.sourceStatus !== "pending_review")) {
  throw new Error("generator output must be an array of pending_review items");
}
await writeFile(resolve(outputPath), `${JSON.stringify({ generatedAt: new Date().toISOString(), source: sourceTextPath, model, mode, items }, null, 2)}\n`);
console.log(`Wrote ${items.length} pending-review items to ${outputPath}`);
