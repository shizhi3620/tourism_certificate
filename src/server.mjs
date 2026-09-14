import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));
const contentPath = fileURLToPath(new URL("../content/exam.json", import.meta.url));
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function sendStaticFile(response, pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = join(publicDirectory, requestedPath);
  if (!filePath.startsWith(publicDirectory)) {
    sendJson(response, 400, { error: "invalid_path" });
    return;
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream",
    });
    response.end(body);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(response, 404, { error: "not_found" });
      return;
    }
    throw error;
  }
}

export function createTourismServer() {
  return createServer(async (request, response) => {
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "method_not_allowed" });
      return;
    }

    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname === "/health") {
      sendJson(response, 200, { status: "ok", service: "tourism" });
      return;
    }

    if (pathname === "/api/exam") {
      const content = JSON.parse(await readFile(contentPath, "utf8"));
      sendJson(response, 200, {
        ...content,
        ...(process.env.DONATION_URL?.trim()
          ? { donationUrl: process.env.DONATION_URL.trim() }
          : {}),
      });
      return;
    }

    await sendStaticFile(response, pathname);
  });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const server = createTourismServer();

  server.listen(port, () => {
    console.log(`tourism listening on port ${port}`);
  });
}
