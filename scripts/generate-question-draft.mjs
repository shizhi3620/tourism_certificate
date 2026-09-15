import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { jsonrepair } from "jsonrepair";

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
if (manifest.ocrRequired) throw new Error("source requires OCR before question generation");

const subject = process.env.GENERATION_SUBJECT || manifest.subject || "待审核";
const region = process.env.GENERATION_REGION || manifest.region || "全国";
const chapter = process.env.GENERATION_CHAPTER || manifest.chapter || "";
const mode = process.env.GENERATION_MODE || manifest.mode || "written_simulation";
const instructions = {
  past_paper: "从历年真题及答案中逐题拆分，保留题干、全部选项、正确答案和解析；不得改写成模拟题。",
  written_simulation: "结合教材和全国笔试大纲生成中文笔试模拟题；必须混合生成 single_choice（单选题）、multiple_choice（多选题）和 true_false（判断题），不得把全部题目生成成单选题。建议题型比例约为单选50%、多选25%、判断25%，答案必须来自原文证据。",
  chapter_practice: "只围绕指定教材章节生成章节练习题；必须混合生成 single_choice（单选题）、multiple_choice（多选题）和 true_false（判断题），题型比例参考2025年全国导游资格考试两套卷合计比例：单选约54.4%、判断约22.5%、多选约23.1%。题量不足时取最接近整数。每题必须标注对应教材章节和大纲要求，答案必须来自原文证据。",
  practical_material: "结合现场考试大纲生成现场讲解材料，可包含景点讲解提纲、中文要点、英文表达和问答训练；不要生成全国笔试题。",
}[mode] ?? "只生成原文能够支持的中文学习材料。";
const prompt = `${instructions}
章节范围：${chapter || "请根据材料中的章节结构合理分配"}
不要编造法规、年份、数字或结论。所有输出都必须标记 pending_review，不能声称是官方真题。
输出一个 JSON 对象，格式为 {"items":[...]}，不要输出 Markdown。笔试题字段为：
笔试题必须完整包含以下字段：id、chapterId、subject、textbookSubject、textbookChapter、syllabusRequirement、sourcePages、sourceExcerpt、type、sourceType、sourceStatus、sourceNote、year、region、prompt、options、answer、explanation。type 必须从三种题型中选择：single_choice 示例 answer 为单个下标；multiple_choice 示例 answer 为下标数组；true_false 的 options 必须为 ["正确","错误"] 且 answer 为 0 或 1。不要把 type 固定为 single_choice，也不要用省略字段的残缺题目。
题目 id 必须在本次输出中唯一，不能重复使用 draft-001 等固定编号。
single_choice 的 answer 是正确选项的从 0 开始下标；multiple_choice 的 answer 是正确选项下标数组；true_false 的 options 必须是 ["正确","错误"]，answer 只能是 0 或 1。必须根据来源证据填写真实答案，不要默认使用 0 或 A；同一批题目的正确答案应按来源内容分布，不能全部相同。past_paper 模式必须保留原题型、全部选项和原答案，不能自行改成单选题。
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
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "你是旅游考试内容草稿生成器，只输出合法 JSON 对象。" },
      { role: "user", content: prompt },
    ],
  }),
});
if (!response.ok) throw new Error(`question generation failed: ${response.status} ${await response.text()}`);
const payload = await response.json();
const content = payload.choices?.[0]?.message?.content;
if (!content) throw new Error("question generation returned no content");

function parseModelJson(raw) {
  const unfenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/)?.[1] ?? raw;
  const start = Math.min(...["{", "["].map((mark) => {
    const index = unfenced.indexOf(mark);
    return index < 0 ? unfenced.length : index;
  }));
  const end = Math.max(unfenced.lastIndexOf("}"), unfenced.lastIndexOf("]"));
  if (start >= end) throw new Error("generator output did not contain a JSON object");
  const candidate = unfenced.slice(start, end + 1);
  return JSON.parse(jsonrepair(candidate));
}

let parsed;
try {
  parsed = parseModelJson(content);
} catch (error) {
  const rawOutputPath = resolve("content/drafts/last-generation-response.txt");
  await writeFile(rawOutputPath, content, "utf8");
  throw new Error(`generator returned invalid JSON (${error.message}); raw response saved to ${rawOutputPath}`);
}
const items = Array.isArray(parsed) ? parsed : parsed.items;
if (!Array.isArray(items)) {
  const rawOutputPath = resolve("content/drafts/last-generation-response.txt");
  await writeFile(rawOutputPath, content, "utf8");
  throw new Error(`generator output must contain an items array; raw response saved to ${rawOutputPath}`);
}
if (items.length === 0) {
  const rawOutputPath = resolve("content/drafts/last-generation-response.txt");
  await writeFile(rawOutputPath, content, "utf8");
  throw new Error(`generator output contains an empty items array; raw response saved to ${rawOutputPath}`);
}
const invalidStatuses = items.filter((item) => item?.sourceStatus !== "pending_review").length;
if (invalidStatuses > 0) {
  console.warn(`Generator returned ${invalidStatuses} item(s) with an invalid sourceStatus; forcing all generated items to pending_review.`);
}
const usedIds = new Set();
const normalizedItems = items.map((item, index) => {
  let id = typeof item?.id === "string" && item.id.trim() ? item.id.trim() : `draft-${mode}-${index + 1}`;
  if (usedIds.has(id)) id = `draft-${mode}-${index + 1}`;
  while (usedIds.has(id)) id = `draft-${mode}-${index + 1}-${usedIds.size}`;
  usedIds.add(id);
  return { ...item, id, sourceStatus: "pending_review" };
});
if (["written_simulation", "chapter_practice"].includes(mode) && normalizedItems.length >= 3) {
  const types = new Set(normalizedItems.map((item) => item.type));
  if (types.size < 3) {
    const rawOutputPath = resolve("content/drafts/last-generation-response.txt");
    await writeFile(rawOutputPath, content, "utf8");
    throw new Error(`written simulation must contain all three question types; received ${[...types].join(", ") || "none"}; raw response saved to ${rawOutputPath}`);
  }
}
await writeFile(resolve(outputPath), `${JSON.stringify({ generatedAt: new Date().toISOString(), source: sourceTextPath, model, mode, items: normalizedItems }, null, 2)}\n`);
console.log(`Wrote ${normalizedItems.length} pending-review items to ${outputPath}`);
