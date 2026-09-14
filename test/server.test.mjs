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

test("exposes the optional voluntary-support link when configured", async () => {
  const previousDonationUrl = process.env.DONATION_URL;
  process.env.DONATION_URL = "https://example.com/support";
  const server = createTourismServer().listen(0);
  await once(server, "listening");
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/exam`);
    assert.equal(response.status, 200);
    assert.equal(
      (await response.json()).donationUrl,
      "https://example.com/support",
    );
  } finally {
    if (previousDonationUrl === undefined) {
      delete process.env.DONATION_URL;
    } else {
      process.env.DONATION_URL = previousDonationUrl;
    }
    server.close();
    await once(server, "close");
  }
});

test("serves the study app and versioned exam content", async () => {
  const server = createTourismServer().listen(0);
  await once(server, "listening");
  const { port } = server.address();

  try {
    const page = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /四川导游资格证备考/);
    const content = await fetch(`http://127.0.0.1:${port}/api/exam`);
    assert.equal(content.status, 200);
    assert.equal((await content.json()).version, "2026.0");
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("publishes only reviewed questions and exposes content versions", async () => {
  const server = createTourismServer().listen(0);
  await once(server, "listening");
  const { port } = server.address();
  try {
    const content = await (await fetch(`http://127.0.0.1:${port}/api/exam`)).json();
    assert.equal(content.contentVersion, "2026.1.2");
    assert.ok(content.questions.every((question) => question.sourceStatus === "published"));
    assert.equal(content.questions.some((question) => question.id === "pending-001"), false);
    assert.deepEqual((await (await fetch(`http://127.0.0.1:${port}/api/exam/versions`)).json()).versions[0], {
      contentVersion: "2026.1.2", syllabusVersion: "2026.0", status: "published",
    });
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("serves the reviewed Sichuan practical pack", async () => {
  const server = createTourismServer().listen(0);
  await once(server, "listening");
  const { port } = server.address();
  try {
    const pack = await (await fetch(`http://127.0.0.1:${port}/api/practical/sichuan`)).json();
    assert.equal(pack.region, "四川省");
    assert.ok(pack.attractions.every((attraction) => attraction.status === "published"));
    assert.ok(pack.attractions[0].questions[0].promptEn);
  } finally {
    server.close();
    await once(server, "close");
  }
});
