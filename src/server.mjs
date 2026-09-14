import { createServer } from "node:http";

export function createTourismServer() {
  return createServer((request, response) => {
    if (request.method !== "GET") {
      response.writeHead(405, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "method_not_allowed" }));
      return;
    }

    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "ok", service: "tourism" }));
      return;
    }

    if (request.url === "/") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          service: "tourism",
          routes: ["/health"],
        }),
      );
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const server = createTourismServer();

  server.listen(port, () => {
    console.log(`tourism listening on port ${port}`);
  });
}
