import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const sourceTextPath = process.argv[2];
const outputPath = process.argv[3] ?? "content/drafts/questions-pending-review.json";
if (!sourceTextPath) {
  console.error("Usage: npm run generate:draft -- content/sources/<id>.txt [output.json]");
  process.exit(1);
}

const apiKey = process.env.OPENAI_API_KEY;
const baseUrl = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
if (!apiKey) throw new Error("OPENAI_API_KEY is required; no question draft was generated");

const source = await readFile(resolve(sourceTextPath), "utf8");
const prompt = `根据下面的教材/大纲原文生成适合全国导游资格证笔试的中文单选题。
只生成原文能够支持的内容，不要编造法规、年份、数字或结论。不要生成英语题。
输出严格 JSON 数组，每项字段为：
{"id":"draft-...","chapterId":"待审核","subject":"待审核","type":"single_choice",
"sourceType":"self_authored","sourceStatus":"pending_review","sourceNote":"教材文件名和页码待人工补充",
"year":null,"region":"全国","prompt":"...","options":["...","...","...","..."],
"answer":0,"explanation":"..."}。
题目必须标记 pending_review，不能声称是官方真题。

来源文件：${basename(sourceTextPath)}

原文：
${source.slice(0, 120000)}`;

const response = await fetch(`${baseUrl}/chat/completions`, {
  method: "POST",
  headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
  body: JSON.stringify({
    model,
    temperature: 0.1,
    messages: [
      { role: "system", content: "你是题库草稿生成器，只输出合法 JSON。" },
      { role: "user", content: prompt },
    ],
  }),
});
if (!response.ok) throw new Error(`question generation failed: ${response.status} ${await response.text()}`);
const payload = await response.json();
const content = payload.choices?.[0]?.message?.content;
if (!content) throw new Error("question generation returned no content");
const jsonText = content.match(/```json\s*([\s\S]*?)\s*```/)?.[1] ?? content;
const questions = JSON.parse(jsonText);
if (!Array.isArray(questions) || questions.some((question) => question.sourceStatus !== "pending_review")) {
  throw new Error("generator output must be an array of pending_review questions");
}
await writeFile(resolve(outputPath), `${JSON.stringify({ generatedAt: new Date().toISOString(), source: sourceTextPath, model, questions }, null, 2)}\n`);
console.log(`Wrote ${questions.length} pending-review questions to ${outputPath}`);
