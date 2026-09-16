import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { jsonrepair } from "jsonrepair";
import { validateGenerationPolicies, validateQuestionTypeCatalog, validateWrittenQuestion } from "../public/question-types.js";
import { validatePracticalMaterial } from "../public/practical-materials.js";

const sourceTextPath = process.argv[2];
const requestedOutputPath = process.argv[3];
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
const outputPath = requestedOutputPath ?? (mode === "practical_material" ? "content/drafts/practical-materials-pending-review.json" : "content/drafts/questions-pending-review.json");
const examConfig = JSON.parse(await readFile(resolve("content/exam.json"), "utf8"));
const writtenExam = examConfig.exam?.writtenExam ?? {};
const questionTypes = writtenExam.questionTypes ?? [];
const catalogErrors = validateQuestionTypeCatalog(questionTypes);
if (catalogErrors.length) throw new Error(`invalid question type catalog: ${catalogErrors.join("; ")}`);
const policyErrors = validateGenerationPolicies(writtenExam, questionTypes);
if (policyErrors.length) throw new Error(`invalid generation policies: ${policyErrors.join("; ")}`);
const selectedPolicy = writtenExam.generationPolicies?.[mode];
const typeDescriptions = questionTypes.map((type) => {
  const fixedOptions = type.fixedOptions ? `，固定选项必须为 ${JSON.stringify(type.fixedOptions)}` : "";
  const answerShape = type.selectionMode === "multiple" ? "answer 为正确选项下标数组" : "answer 为正确选项下标";
  return `${type.id}（${type.label}：${answerShape}，正确项 ${type.minCorrect}${type.maxCorrect === null ? " 项以上" : `-${type.maxCorrect} 项`}${fixedOptions}）`;
}).join("；");
const distributionText = selectedPolicy?.targetDistribution
  ? `题型分布目标：${Object.entries(selectedPolicy.targetDistribution).map(([typeId, ratio]) => `${typeId} ${ratio}%`).join("、")}。题量不足时取最接近整数。`
  : selectedPolicy?.preserveSourceTypes
    ? "必须保留原题题型、全部选项和原答案，不得重新分配题型。"
    : "";
const instructions = mode === "practical_material"
  ? "结合现场考试大纲生成现场讲解材料，可包含景点讲解提纲、中文要点、英文表达和问答训练；不要生成全国笔试题。"
  : [
    mode === "past_paper" ? "从历年真题及答案中逐题拆分，保留题干、全部选项、正确答案和解析；不得改写成模拟题。" : "只生成原文能够支持的中文笔试学习题。",
    `允许并使用题型清单中的题型：${typeDescriptions}。`,
    selectedPolicy?.requiredTypes?.length ? `本批必须包含：${selectedPolicy.requiredTypes.join("、")}。` : "",
    distributionText,
    "答案必须来自原文证据，不得默认使用 0 或 A。",
  ].filter(Boolean).join("");
const writtenSchema = `笔试题必须完整包含以下字段：id、chapterId、subject、textbookSubject、textbookChapter、syllabusRequirement、sourcePages、sourceExcerpt、type、sourceType、sourceStatus、sourceNote、year、region、prompt、options、answer、explanation。type 必须来自当前内容版本的题型清单，并严格满足对应题型的选项与答案结构；不得使用清单外的题型，也不要用省略字段的残缺题目。
必须根据来源证据填写真实答案，并保证答案结构符合题型清单。不得根据选项数量或答案形态反推题型。`;
const practicalSchema = `现场材料必须完整包含以下字段：id、kind、region、attractionId、name、chineseDescription、englishScript、chineseMeaning、sourceNote、sourcePages、sourceExcerpt、questions。
kind 必须固定为 practical_material，不得填写 type。questions 中每题包含 id、promptZh、promptEn、answerGuideZh。示例：
{"id":"draft-...","kind":"practical_material","region":"${region}","attractionId":"jinsha-museum","name":"金沙遗址博物馆","chineseDescription":"中文讲解提纲","englishScript":"English presentation script","chineseMeaning":"英文讲稿的中文释义","sourceNote":"来源说明","sourcePages":["页码"],"sourceExcerpt":"支持材料的原文短引文","questions":[{"id":"q-1","promptZh":"中文问题","promptEn":"English interview question","answerGuideZh":"中文答题要点"}]}。`;
const scope = mode === "practical_material"
  ? `地区：${region}`
  : `章节范围：${chapter || "请根据材料中的章节结构合理分配"}`;
const prompt = `${instructions}
${scope}
不要编造法规、年份、数字或结论。所有输出都必须标记 pending_review，不能声称是官方真题。
输出一个 JSON 对象，格式为 {"items":[...]}，不要输出 Markdown。
${mode === "practical_material" ? practicalSchema : writtenSchema}

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
  const questions = mode === "practical_material" && Array.isArray(item.questions)
    ? item.questions.map((question, questionIndex) => ({
      ...question,
      id: typeof question?.id === "string" && question.id.trim() ? question.id.trim() : `${id}-q${questionIndex + 1}`,
    }))
    : item.questions;
  return { ...item, id, questions, sourceStatus: "pending_review" };
});
if (["past_paper", "written_simulation", "chapter_practice"].includes(mode)) {
  const validItems = normalizedItems.filter((item) => validateWrittenQuestion(item, questionTypes).length === 0);
  if (validItems.length === 0) {
    const rawOutputPath = resolve("content/drafts/last-generation-response.txt");
    await writeFile(rawOutputPath, content, "utf8");
    throw new Error(`generator returned no valid written questions; raw response saved to ${rawOutputPath}`);
  }
  const validTypes = new Set(validItems.map((item) => item.type));
  const missingTypes = (selectedPolicy?.requiredTypes ?? []).filter((typeId) => !validTypes.has(typeId));
  if (missingTypes.length) console.warn(`Generator did not produce required question types: ${missingTypes.join(", ")}`);
} else if (mode === "practical_material") {
  const validItems = normalizedItems.filter((item) => validatePracticalMaterial(item).length === 0);
  if (validItems.length === 0) {
    const rawOutputPath = resolve("content/drafts/last-generation-response.txt");
    await writeFile(rawOutputPath, content, "utf8");
    throw new Error(`generator returned no valid practical materials; raw response saved to ${rawOutputPath}`);
  }
}
await writeFile(resolve(outputPath), `${JSON.stringify({ generatedAt: new Date().toISOString(), source: sourceTextPath, model, mode, queue: mode === "practical_material" ? "practical" : "written", generationPolicy: mode, items: normalizedItems }, null, 2)}\n`);
console.log(`Wrote ${normalizedItems.length} pending-review items to ${outputPath}`);
