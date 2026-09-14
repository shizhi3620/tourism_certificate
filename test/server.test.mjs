import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createTourismServer } from "../src/server.mjs";

test("reports service health", async () => {
  const server = createTourismServer().listen(0);
  await once(server, "listening");
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "ok",
      service: "tourism",
    });
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("returns not found for unknown routes", async () => {
  const server = createTourismServer().listen(0);
  await once(server, "listening");
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/unknown`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "not_found" });
  } finally {
    server.close();
    await once(server, "close");
  }
});
