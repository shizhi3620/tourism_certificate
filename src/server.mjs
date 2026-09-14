import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const publicDirectory = join(root, "public");
const contentPath = join(root, "content/exam.json");
const practicalPath = join(root, "content/sichuan-practical.json");
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
    if (request.method !== "GET") return sendJson(response, 405, { error: "method_not_allowed" });
    const pathname = new URL(request.url, "http://localhost").pathname;
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
