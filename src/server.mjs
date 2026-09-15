import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFParse } from "pdf-parse";

const root = fileURLToPath(new URL("../", import.meta.url));
const publicDirectory = join(root, "public");
const contentPath = join(root, "content/exam.json");
const practicalPath = join(root, "content/sichuan-practical.json");
const sourceDirectory = join(root, "content/sources");
const draftDirectory = join(root, "content/drafts");
const draftPath = join(draftDirectory, "questions-pending-review.json");
const materialsPath = join(sourceDirectory, "materials.json");
const uploadMaxBytes = 200 * 1024 * 1024;
const contentTypes = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" };
const requests = new Map();
const windowMs = 60_000;
const configuredLimit = Number.parseInt(process.env.RATE_LIMIT ?? "120", 10);
const limit = Number.isInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : 120;

function headers(extra = {}) {
  return { "cache-control": "no-store", "x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "no-referrer", ...extra };
}
function sendJson(response, status, body) {
  response.writeHead(status, headers({ "content-type": "application/json; charset=utf-8" }));
  response.end(JSON.stringify(body));
}
async function readBody(request, maxBytes = 15 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error("request_too_large"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function adminAllowed(request) {
  const configured = process.env.ADMIN_TOKEN?.trim();
  return configured && request.headers.authorization === `Bearer ${configured}`;
}
function decodeMultipartText(value) {
  return Buffer.from(value, "latin1").toString("utf8");
}
function parseMultipart(body, contentType) {
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1] ?? contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2];
  if (!boundary) throw Object.assign(new Error("invalid_multipart"), { status: 400 });
  const result = {};
  for (const part of body.toString("latin1").split(`--${boundary}`).slice(1, -1)) {
    const separator = part.indexOf("\r\n\r\n");
    if (separator < 0) continue;
    const headersText = part.slice(0, separator);
    const name = headersText.match(/name="([^"]+)"/i)?.[1];
    const filename = headersText.match(/filename="([^"]*)"/i)?.[1];
    if (!name) continue;
    const value = part.slice(separator + 4).replace(/\r\n$/, "");
    const parsed = filename
      ? { filename: decodeMultipartText(filename), fieldName: name, data: Buffer.from(value, "latin1") }
      : decodeMultipartText(value);
    result[name] = result[name] ? [].concat(result[name], parsed) : parsed;
  }
  return result;
}
function runDeepSeekOcr(inputPath, outputPath, watermark = "") {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ["scripts/ocr-source-deepseek.mjs", inputPath, outputPath], {
      cwd: root,
      env: { ...process.env, DEEPSEEK_OCR_WATERMARKS: watermark },
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0
      ? resolvePromise()
      : reject(new Error(stderr.trim() || `DeepSeek OCR exited with ${code}`)));
  });
}
function generateDraft(textPath, outputPath, context = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ["scripts/generate-question-draft.mjs", textPath, outputPath], {
      cwd: root,
      env: { ...process.env, GENERATION_MODE: context.mode ?? "written_simulation", GENERATION_SUBJECT: context.subject ?? "", GENERATION_REGION: context.region ?? "全国", GENERATION_CHAPTER: context.chapter ?? "" },
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolvePromise({ outputPath }) : reject(new Error(stderr.trim() || `generator exited with ${code}`)));
  });
}
function syllabusCoverage(syllabusText, items) {
  const scopeLines = [...new Set(syllabusText.split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 4 && line.length <= 100)
    .filter((line) => /^(第[一二三四五六七八九十百零0-9]+章|[一二三四五六七八九十百零0-9]+[、.)]|[（(]?[一二三四五六七八九十百零0-9]+[）)])/.test(line)))];
  const requirements = [...new Set((items ?? []).map((item) => item.syllabusRequirement?.trim())
    .filter((value) => value && !["待补充", "待确认", "必须填写对应大纲要求"].includes(value)))];
  const covered = requirements.filter((requirement) => scopeLines.some((scope) => scope.includes(requirement) || requirement.includes(scope)));
  return {
    total: scopeLines.length,
    covered: covered.length,
    percent: scopeLines.length ? Math.min(100, Math.round(covered.length / scopeLines.length * 100)) : 0,
    estimated: true,
  };
}
function reviewFlags(item) {
  const text = JSON.stringify(item);
  const placeholderValues = new Set(["必须填写教材章节", "必须填写支持答案的原文短引文", "待补充", "待确认"]);
  const hasMeaningfulValue = (value) => typeof value === "string"
    ? value.trim().length > 0 && !placeholderValues.has(value.trim())
    : Boolean(value);
  const hasMeaningfulPages = Array.isArray(item.sourcePages)
    && item.sourcePages.length > 0
    && item.sourcePages.every((page) => hasMeaningfulValue(page));
  return [
    ...["id", "chapterId", "sourceType", "sourceNote"].filter((field) => !item[field]).map((field) => `缺少${field}`),
    !item.prompt && !item.title ? "缺少题目内容" : null,
    ["single_choice", "multiple_choice", "true_false"].includes(item.type) && (!Array.isArray(item.options) || item.options.length < 2) ? "选项不足" : null,
    item.type === "multiple_choice" && (!Array.isArray(item.answer) || item.answer.length === 0 || item.answer.some((answer) => !Number.isInteger(answer))) ? "答案未确认" : null,
    item.type !== "multiple_choice" && ["single_choice", "true_false"].includes(item.type) && !Number.isInteger(item.answer) ? "答案未确认" : null,
    item.type === "multiple_choice" && (!Array.isArray(item.options) || item.answer.some((answer) => answer < 0 || answer >= item.options.length)) ? "答案超出选项范围" : null,
    item.type !== "multiple_choice" && ["single_choice", "true_false"].includes(item.type) && (!Array.isArray(item.options) || item.answer < 0 || item.answer >= item.options.length) ? "答案超出选项范围" : null,
    !["single_choice", "multiple_choice", "true_false", "practical_material"].includes(item.type) ? "题型不受支持" : null,
    text.includes("[无法识别]") ? "包含 OCR 无法识别标记" : null,
    !hasMeaningfulValue(item.syllabusRequirement) ? "缺少大纲要求定位" : null,
    !hasMeaningfulValue(item.textbookSubject) || !hasMeaningfulValue(item.textbookChapter) ? "缺少教材章节定位" : null,
    !hasMeaningfulPages || !hasMeaningfulValue(item.sourceExcerpt) ? "缺少来源页码或引用" : null,
  ].filter(Boolean);
}
function nextContentVersion(version) {
  const match = /^(\d{4})\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`invalid contentVersion: ${version}`);
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}
async function readDraft() {
  return JSON.parse(await readFile(draftPath, "utf8"));
}
async function publishApprovedDraft() {
  const draft = await readDraft();
  const items = draft.items ?? draft.questions ?? [];
  const approved = items.filter((item) => item.reviewStatus === "approved");
  if (!approved.length) throw Object.assign(new Error("no_approved_items"), { status: 400 });
  const publishable = approved.filter((item) => !reviewFlags(item).length && ["single_choice", "multiple_choice", "true_false"].includes(item.type));
  const skipped = approved
    .filter((item) => !publishable.includes(item))
    .map((item) => ({ id: item.id ?? "missing-id", reasons: reviewFlags(item).length ? reviewFlags(item) : ["题型不受支持"] }));
  if (!publishable.length) throw Object.assign(new Error(`no_publishable_items:${skipped.map((item) => item.id).join(",")}`), { status: 400 });
  const exam = JSON.parse(await readFile(contentPath, "utf8"));
  const existingIds = new Set(exam.questions.map((question) => question.id));
  const usedIds = new Set(existingIds);
  const generatedIdPrefix = `draft-${Date.now()}`;
  const publishedItems = publishable.map((item, index) => {
    let id = item.id;
    if (!id || usedIds.has(id)) id = `${generatedIdPrefix}-${index + 1}`;
    while (usedIds.has(id)) id = `${generatedIdPrefix}-${index + 1}-${usedIds.size}`;
    usedIds.add(id);
    return { ...item, id };
  });
  const publishedAt = new Date().toISOString();
  const contentVersion = nextContentVersion(exam.contentVersion);
  const publishedQuestions = publishedItems.map(({ reviewStatus, reviewFlags: ignored, ...item }) => ({
    ...item,
    sourceStatus: "published",
    publishedAt,
  }));
  const updatedExam = {
    ...exam,
    contentVersion,
    publishedAt,
    questions: [...exam.questions, ...publishedQuestions],
  };
  await writeFile(contentPath, `${JSON.stringify(updatedExam, null, 2)}\n`);
  const remaining = items.filter((item) => !publishable.includes(item)).map((item) => ({
    ...item,
    ...(approved.includes(item) ? { reviewStatus: "pending" } : {}),
  }));
  const updatedDraft = { ...draft, items: remaining, publishedAt, publishedCount: publishedQuestions.length, skipped };
  await writeFile(draftPath, `${JSON.stringify(updatedDraft, null, 2)}\n`);
  await writeFile(join(draftDirectory, "publish-history.jsonl"), `${JSON.stringify({
    publishedAt, contentVersion, count: publishedQuestions.length, ids: publishedQuestions.map((item) => item.id),
  })}\n`, { flag: "a" });
  return { published: publishedQuestions.length, contentVersion, skipped };
}
async function importUploadedFile(file, fields) {
  const files = Array.isArray(file) ? file : [file];
  if (!files.length || files.some((item) => !item?.filename || !/\.(pdf|txt|md)$/i.test(item.filename))) {
    throw Object.assign(new Error("only_pdf_or_text"), { status: 400 });
  }
  const sourceId = `${Date.now()}-${files[0].filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  await mkdir(sourceDirectory, { recursive: true });
  const stored = join(sourceDirectory, sourceId);
  const sections = [];
  const materials = await readMaterials();
  const roleLabels = {
    textbook: "教材",
    syllabus: "考纲",
    pastPaper: "历年真题",
    answerFile: "答案",
    file: "材料",
  };
  let ocrUsed = false;
  for (const item of files) {
    const hash = createHash("sha256").update(item.data).digest("hex");
    const existing = materials.find((material) => material.hash === hash);
    if (existing) {
      sections.push(`\n\n===== ${existing.role}：${existing.filename}（已保存，跳过重复 OCR） =====\n${await readFile(resolve(root, existing.textPath), "utf8")}`);
      continue;
    }
    const storedFile = `${stored}-${item.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await writeFile(storedFile, item.data);
    let section = item.data.toString("utf8");
    if (/\.pdf$/i.test(item.filename)) {
      if (fields.extractionMethod === "ocr") {
        const ocrPath = `${storedFile}.ocr.txt`;
        await runDeepSeekOcr(storedFile, ocrPath, fields.watermark ?? "");
        section = await readFile(ocrPath, "utf8");
        ocrUsed = true;
      } else {
        const parser = new PDFParse({ data: item.data });
        const parsed = await parser.getText();
        section = parsed.text;
        await parser.destroy();
      }
    }
    const heading = item.fieldName && item.fieldName !== "file"
      ? `${roleLabels[item.fieldName] ?? "材料"}：${item.filename}`
      : item.filename;
    sections.push(`\n\n===== ${heading} =====\n${section}`);
    if (fields.addToLibrary !== "false") {
      materials.push({
        id: hash.slice(0, 16),
        hash,
        filename: item.filename,
        role: roleLabels[item.fieldName] ?? "材料",
        subject: fields.subject ?? null,
        region: fields.region ?? "全国",
        active: true,
        textPath: `content/sources/${sourceId}.txt`,
        importedAt: new Date().toISOString(),
      });
    }
  }
  const text = sections.join("");
  const extractedByTextLayer = text.replace(/[=\s-]/g, "").length;
  await writeFile(`${stored}.txt`, text, "utf8");
  await writeFile(`${stored}.json`, `${JSON.stringify({
    sourceId, originalName: files.map((item) => item.filename), extractionMethod: fields.extractionMethod ?? "local", fileRoles: files.map((item) => ({
      filename: item.filename, role: roleLabels[item.fieldName] ?? "材料",
    })), storedFile: stored, extractedText: `${stored}.txt`,
    subject: fields.subject ?? null, region: fields.region ?? "全国", mode: fields.mode ?? "written_simulation",
    year: fields.year ?? null, answerFile: fields.answerFile ?? null, watermark: fields.watermark ?? null,
    status: "extracted", extractedByTextLayer, ocrUsed, ocrRequired: extractedByTextLayer < 100 && !ocrUsed,
    importedAt: new Date().toISOString(), questionStatus: "not_generated",
  }, null, 2)}\n`);
  await writeFile(materialsPath, `${JSON.stringify(materials, null, 2)}\n`);
  return {
    sourceId, textPath: `content/sources/${sourceId}.txt`, extractedCharacters: text.length,
    ocrRequired: extractedByTextLayer < 100 && !ocrUsed,
    ocrUsed,
    extractionMethod: fields.extractionMethod ?? "local",
    message: extractedByTextLayer < 100 ? "PDF 没有足够文本层，请先 OCR 后再生成。" : "文本已提取。",
  };
}
async function readMaterials() {
  try {
    const materials = JSON.parse(await readFile(materialsPath, "utf8"));
    return materials.map((material) => ({
      ...material,
      filename: repairMojibake(material.filename),
      subject: repairMojibake(material.subject),
      region: repairMojibake(material.region),
      role: repairMojibake(material.role),
    }));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  function repairMojibake(value) {
    if (typeof value !== "string" || !/[ÃÂâ€žœžšŸæåçèéêëìíîïðñòóôõöùúûü]/.test(value)) return value;
    return Buffer.from(value, "latin1").toString("utf8");
  }
}
function sourcePath(candidate) {
  const resolved = resolve(root, candidate);
  if (!resolved.startsWith(`${sourceDirectory}/`) || !resolved.endsWith(".txt")) {
    throw Object.assign(new Error("invalid_source_path"), { status: 400 });
  }
  return resolved;
}
function published(content) {
  return { ...content, questions: content.questions.filter((question) => question.sourceStatus === "published") };
}
function allowed(request) {
  const now = Date.now();
  const key = request.socket.remoteAddress ?? "unknown";
  const entry = requests.get(key) ?? { start: now, count: 0 };
  if (now - entry.start >= windowMs) { entry.start = now; entry.count = 0; }
  entry.count += 1; requests.set(key, entry);
  return entry.count <= limit;
}
async function sendStaticFile(response, pathname) {
  const relative = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(publicDirectory, relative));
  if (!filePath.startsWith(`${publicDirectory}/`)) return sendJson(response, 400, { error: "invalid_path" });
  try {
    const body = await readFile(filePath);
    response.writeHead(200, headers({ "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream" }));
    response.end(body);
  } catch (error) {
    if (error.code === "ENOENT") return sendJson(response, 404, { error: "not_found" });
    throw error;
  }
}

export function createTourismServer() {
  return createServer(async (request, response) => {
    if (!allowed(request)) return sendJson(response, 429, { error: "rate_limited", message: "请求过于频繁，请稍后再试。" });
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/admin" && request.method === "GET") return sendStaticFile(response, "/admin.html");
    if (pathname === "/api/admin/import" && request.method === "POST") {
      if (!adminAllowed(request)) return sendJson(response, 401, { error: "admin_auth_required" });
      try {
        const fields = parseMultipart(await readBody(request, uploadMaxBytes), request.headers["content-type"] ?? "");
        const uploadedFiles = [
          fields.file,
          fields.textbook,
          fields.syllabus,
          fields.pastPaper,
          fields.answerFile,
        ].flat().filter(Boolean);
        return sendJson(response, 201, await importUploadedFile(uploadedFiles, fields));
      } catch (error) {
        return sendJson(response, error.status ?? 500, { error: error.message });
      }
    }
    if (pathname === "/api/admin/materials" && request.method === "GET") {
      if (!adminAllowed(request)) return sendJson(response, 401, { error: "admin_auth_required" });
      return sendJson(response, 200, { materials: await readMaterials() });
    }
    if (pathname === "/api/admin/materials" && request.method === "POST") {
      if (!adminAllowed(request)) return sendJson(response, 401, { error: "admin_auth_required" });
      try {
        const payload = JSON.parse((await readBody(request, 1024 * 1024)).toString("utf8"));
        const materials = await readMaterials();
        const material = materials.find((item) => item.id === payload.id);
        if (!material) return sendJson(response, 404, { error: "material_not_found" });
        material.active = payload.active === true;
        await writeFile(materialsPath, `${JSON.stringify(materials, null, 2)}\n`);
        return sendJson(response, 200, { material });
      } catch (error) {
        return sendJson(response, error.status ?? 400, { error: error.message });
      }
    }
    if (pathname === "/api/admin/generate" && request.method === "POST") {
      if (!adminAllowed(request)) return sendJson(response, 401, { error: "admin_auth_required" });
      try {
        const payload = JSON.parse((await readBody(request, 1024 * 1024)).toString("utf8"));
        const paths = payload.textPaths ?? (payload.textPath ? [payload.textPath] : []);
        if (!paths.length) return sendJson(response, 400, { error: "no_materials_selected" });
        const sourceCandidates = paths.map(sourcePath);
        try {
          await Promise.all(sourceCandidates.map((candidate) => access(candidate)));
        } catch {
          return sendJson(response, 400, { error: "source_not_found" });
        }
        const sourceText = (await Promise.all(sourceCandidates.map((candidate) => readFile(candidate, "utf8")))).join("\n\n");
        const generatedInput = join(draftDirectory, "generation-input.txt");
        await writeFile(generatedInput, sourceText, "utf8");
        await mkdir(draftDirectory, { recursive: true });
        const outputPath = "content/drafts/questions-pending-review.json";
        const generated = await generateDraft("content/drafts/generation-input.txt", outputPath, {
          mode: payload.mode,
          subject: payload.subject,
          region: payload.region,
          chapter: payload.chapter,
        });
        const selectedMaterials = await readMaterials();
        const syllabusPaths = paths.filter((path) => selectedMaterials.some((material) => material.textPath === path && material.role === "考纲"));
        const syllabusText = (await Promise.all(syllabusPaths.map((path) => readFile(sourcePath(path), "utf8")))).join("\n");
        const generatedDraft = await readDraft();
        const coverage = syllabusCoverage(syllabusText, generatedDraft.items ?? []);
        await writeFile(draftPath, `${JSON.stringify({ ...generatedDraft, syllabusCoverage: coverage }, null, 2)}\n`);
        return sendJson(response, 201, { ...generated, syllabusCoverage: coverage });
      } catch (error) {
        return sendJson(response, error.status ?? 500, { error: error.message });
      }
    }
    if (pathname === "/api/admin/review" && request.method === "GET") {
      if (!adminAllowed(request)) return sendJson(response, 401, { error: "admin_auth_required" });
      try {
        const draft = await readDraft();
        const items = (draft.items ?? draft.questions ?? []).map((item) => ({
          ...item,
          reviewStatus: item.reviewStatus ?? "pending",
          reviewFlags: reviewFlags(item),
        }));
        return sendJson(response, 200, { ...draft, items });
      } catch (error) {
        return sendJson(response, error.code === "ENOENT" ? 404 : 500, { error: error.code === "ENOENT" ? "draft_not_found" : error.message });
      }
    }
    if (pathname === "/api/admin/review" && request.method === "POST") {
      if (!adminAllowed(request)) return sendJson(response, 401, { error: "admin_auth_required" });
      try {
        const payload = JSON.parse((await readBody(request, 2 * 1024 * 1024)).toString("utf8"));
        const draft = await readDraft();
        const updates = new Map((payload.items ?? []).map((item) => [item.id, item]));
        const items = (draft.items ?? draft.questions ?? []).map((item) => {
          const update = updates.get(item.id);
          if (!update) return item;
          const merged = { ...item, ...update, sourceStatus: "pending_review" };
          if (merged.reviewStatus === "approved" && reviewFlags(merged).length) {
            return { ...merged, reviewStatus: "pending" };
          }
          return merged;
        });
        await writeFile(draftPath, `${JSON.stringify({ ...draft, items, updatedAt: new Date().toISOString() }, null, 2)}\n`);
        return sendJson(response, 200, { updated: updates.size });
      } catch (error) {
        return sendJson(response, error.code === "ENOENT" ? 404 : 400, { error: error.code === "ENOENT" ? "draft_not_found" : error.message });
      }
    }
    if (pathname === "/api/admin/publish" && request.method === "POST") {
      if (!adminAllowed(request)) return sendJson(response, 401, { error: "admin_auth_required" });
      try {
        return sendJson(response, 200, await publishApprovedDraft());
      } catch (error) {
        return sendJson(response, error.status ?? 500, { error: error.message });
      }
    }
    if (request.method !== "GET") return sendJson(response, 405, { error: "method_not_allowed" });
    if (pathname === "/health") return sendJson(response, 200, { status: "ok", service: "tourism" });
    if (pathname === "/api/exam" || pathname === "/api/exam/") {
      const content = published(JSON.parse(await readFile(contentPath, "utf8")));
      return sendJson(response, 200, { ...content, ...(process.env.DONATION_URL?.trim() ? { donationUrl: process.env.DONATION_URL.trim() } : {}) });
    }
    if (pathname === "/api/exam/versions") {
      const content = published(JSON.parse(await readFile(contentPath, "utf8")));
      return sendJson(response, 200, {
        versions: [{
          contentVersion: content.contentVersion,
          syllabusVersion: content.syllabusVersion,
          status: "published",
        }],
      });
    }
    if (pathname === "/api/practical/sichuan") {
      const pack = JSON.parse(await readFile(practicalPath, "utf8"));
      return sendJson(response, 200, {
        ...pack,
        attractions: pack.attractions
          .filter((item) => item.status === "published")
          .map((item) => ({
            ...item,
            questions: item.questions.filter((question) => question.status === "published"),
          })),
      });
    }
    return sendStaticFile(response, pathname);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  createTourismServer().listen(port, () => console.log(`tourism listening on port ${port}`));
}
