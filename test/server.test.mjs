import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createTourismServer } from "../src/server.mjs";

async function startServer() {
  const server = createTourismServer().listen(0);
  await once(server, "listening");
  return server;
}

test("reports service health", async () => {
  const server = await startServer();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok", service: "tourism" });
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("returns not found for unknown routes", async () => {
  const server = await startServer();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/unknown`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "not_found" });
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("exposes the optional voluntary-support link when configured", async () => {
  const previousDonationUrl = process.env.DONATION_URL;
  process.env.DONATION_URL = "https://example.com/support";
  const server = await startServer();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/exam`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).donationUrl, "https://example.com/support");
  } finally {
    if (previousDonationUrl === undefined) delete process.env.DONATION_URL;
    else process.env.DONATION_URL = previousDonationUrl;
    server.close();
    await once(server, "close");
  }
});

test("serves the study app and versioned exam content", async () => {
  const server = await startServer();
  try {
    const page = await fetch(`http://127.0.0.1:${server.address().port}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /四川导游资格证备考/);
    const content = await fetch(`http://127.0.0.1:${server.address().port}/api/exam`);
    assert.equal(content.status, 200);
    assert.equal((await content.json()).version, "2026.0");
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("publishes only reviewed questions and exposes content versions", async () => {
  const server = await startServer();
  try {
    const content = await (await fetch(`http://127.0.0.1:${server.address().port}/api/exam`)).json();
    assert.equal(content.contentVersion, "2026.1.2");
    assert.ok(content.questions.every((question) => question.sourceStatus === "published"));
    assert.equal(content.questions.some((question) => question.id === "pending-001"), false);
    assert.deepEqual((await (await fetch(`http://127.0.0.1:${server.address().port}/api/exam/versions`)).json()).versions[0], {
      contentVersion: "2026.1.2", syllabusVersion: "2026.0", status: "published",
    });
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("serves the reviewed Sichuan practical pack", async () => {
  const server = await startServer();
  try {
    const pack = await (await fetch(`http://127.0.0.1:${server.address().port}/api/practical/sichuan`)).json();
    assert.equal(pack.region, "四川省");
    assert.ok(pack.attractions.every((attraction) => attraction.status === "published"));
    assert.ok(pack.attractions[0].questions[0].promptEn);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("protects the content admin page and accepts authenticated source uploads", async () => {
  const previousToken = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = "test-admin-token";
  const server = await startServer();
  try {
    const port = server.address().port;
    const unauthorized = await fetch(`http://127.0.0.1:${port}/api/admin/import`, { method: "POST" });
    assert.equal(unauthorized.status, 401);
    const form = new FormData();
    form.append("mode", "past_paper");
    form.append("subject", "政策与法律法规");
    form.append("file", new Blob(["1. 示例题\nA. 甲\nB. 乙\n答案：A"], { type: "text/plain" }), "past-paper.txt");
    form.append("file", new Blob(["2. 第二题\nA. 丙\nB. 丁\n答案：B"], { type: "text/plain" }), "past-paper-2.txt");
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/import`, {
      method: "POST",
      headers: { authorization: "Bearer test-admin-token" },
      body: form,
    });
    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.match(payload.textPath, /^content\/sources\//);
    assert.ok(payload.extractedCharacters > 0);
    const extracted = await readFile(payload.textPath, "utf8");
    assert.match(extracted, /===== past-paper\.txt =====/);
    assert.match(extracted, /===== past-paper-2\.txt =====/);
    const materials = await fetch(`http://127.0.0.1:${port}/api/admin/materials`, {
      headers: { authorization: "Bearer test-admin-token" },
    });
    assert.equal(materials.status, 200);
    assert.ok((await materials.json()).materials.some((material) => (
      material.filename === "past-paper.txt" && material.subject === "政策与法律法规"
    )));
  } finally {
    if (previousToken === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = previousToken;
    server.close();
    await once(server, "close");
  }
});

test("returns upload parsing errors without terminating the service", async () => {
  const previousToken = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = "test-admin-token";
  const server = await startServer();
  try {
    const port = server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/import`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-admin-token",
        "content-type": "multipart/form-data; boundary=invalid",
      },
      body: "not-a-valid-multipart-body",
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "only_pdf_or_text" });
    assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200);
  } finally {
    if (previousToken === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = previousToken;
    server.close();
    await once(server, "close");
  }
});

test("requires authentication for draft generation", async () => {
  const server = await startServer();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ textPath: "content/sources/not-found.txt" }),
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "admin_auth_required" });
  } finally {
    server.close();
    await once(server, "close");
  }
});
