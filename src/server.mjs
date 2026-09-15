import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFParse } from "pdf-parse";

const root = fileURLToPath(new URL("../", import.meta.url));
const publicDirectory = join(root, "public");
const contentPath = join(root, "content/exam.json");
const practicalPath = join(root, "content/sichuan-practical.json");
const sourceDirectory = join(root, "content/sources");
const draftDirectory = join(root, "content/drafts");
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
    result[name] = filename ? { filename, data: Buffer.from(value, "latin1") } : value;
  }
  function generateDraft(textPath, outputPath) {
    return new Promise((resolvePromise, reject) => {
      const child = spawn(process.execPath, ["scripts/generate-question-draft.mjs", textPath, outputPath], { cwd: root, env: process.env });
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (code) => code === 0 ? resolvePromise({ outputPath }) : reject(new Error(stderr.trim() || `generator exited with ${code}`)));
    });
  }
  return result;
}
async function importUploadedFile(file, fields) {
  if (!file?.filename || !/\.(pdf|txt|md)$/i.test(file.filename)) throw Object.assign(new Error("only_pdf_or_text"), { status: 400 });
  const sourceId = `${Date.now()}-${file.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  await mkdir(sourceDirectory, { recursive: true });
  const stored = join(sourceDirectory, sourceId);
  await writeFile(stored, file.data);
  let text = file.data.toString("utf8");
  if (/\.pdf$/i.test(file.filename)) {
    const parser = new PDFParse({ data: file.data });
    ({ text } = await parser.getText());
    await parser.destroy();
  }
  await writeFile(`${stored}.txt`, text, "utf8");
  await writeFile(`${stored}.json`, `${JSON.stringify({
    sourceId, originalName: file.filename, storedFile: stored, extractedText: `${stored}.txt`,
    subject: fields.subject ?? null, region: fields.region ?? "全国", mode: fields.mode ?? "written_simulation",
    status: "extracted", importedAt: new Date().toISOString(), questionStatus: "not_generated",
  }, null, 2)}\n`);
  return { sourceId, textPath: `content/sources/${sourceId}.txt`, extractedCharacters: text.length };
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
      const fields = parseMultipart(await readBody(request), request.headers["content-type"] ?? "");
      try {
        return sendJson(response, 201, await importUploadedFile(fields.file, fields));
      } catch (error) {
        return sendJson(response, error.status ?? 500, { error: error.message });
      }
      if (pathname === "/api/admin/generate" && request.method === "POST") {
        if (!adminAllowed(request)) return sendJson(response, 401, { error: "admin_auth_required" });
        try {
          const payload = JSON.parse((await readBody(request, 1024 * 1024)).toString("utf8"));
          const sourceCandidate = payload.textPath ? resolve(root, payload.textPath) : "";
          if (!payload.textPath || !sourceCandidate.startsWith(`${sourceDirectory}/`) || !sourceCandidate.endsWith(".txt")) {
            return sendJson(response, 400, { error: "invalid_source_path" });
          }
          await mkdir(draftDirectory, { recursive: true });
          const outputPath = "content/drafts/questions-pending-review.json";
          return sendJson(response, 201, await generateDraft(payload.textPath, outputPath));
        } catch (error) {
          return sendJson(response, error.status ?? 500, { error: error.message });
        }
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
