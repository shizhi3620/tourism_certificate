import assert from "node:assert/strict";
import test from "node:test";
import { EXPORT_VERSION, describeVersionMismatch, exportStudyRecord, importStudyRecord } from "../public/study-record.js";

test("exports a versioned study record without answer history", () => {
  const payload = exportStudyRecord({
    records: { q1: { attempts: 3, correct: 2, wrong: true } },
    mocks: [{ finishedAt: "2026-09-16T00:00:00.000Z", score: 30, total: 100, percent: 30 }],
    contentVersion: "2026.1.8",
    now: new Date("2026-09-16T12:00:00.000Z"),
  });
  assert.equal(payload.exportVersion, EXPORT_VERSION);
  assert.equal(payload.contentVersion, "2026.1.8");
  assert.equal(payload.exportedAt, "2026-09-16T12:00:00.000Z");
  assert.deepEqual(payload.records.q1, { attempts: 3, correct: 2, wrong: true });
});

test("round-trips a valid export", () => {
  const payload = exportStudyRecord({ records: { q1: { attempts: 1, correct: 1, wrong: false } }, mocks: [], contentVersion: "2026.1.8" });
  const imported = importStudyRecord(JSON.parse(JSON.stringify(payload)));
  assert.deepEqual(imported.records, payload.records);
  assert.equal(imported.contentVersion, "2026.1.8");
});

test("rejects unknown export versions and malformed records", () => {
  assert.throws(() => importStudyRecord({ exportVersion: 99, records: {}, mocks: [] }), /不支持的导出格式版本/);
  assert.throws(() => importStudyRecord({ exportVersion: 1, records: [], mocks: [] }), /缺少 records/);
  assert.throws(() => importStudyRecord({ exportVersion: 1, records: {}, mocks: "no" }), /缺少 mocks/);
  assert.throws(() => importStudyRecord({ exportVersion: 1, records: { q1: { attempts: 1, correct: 2, wrong: false } }, mocks: [] }), /correct 大于 attempts/);
  assert.throws(() => importStudyRecord({ exportVersion: 1, records: { q1: { attempts: 1, correct: 1, wrong: "no" } }, mocks: [] }), /wrong 无效/);
});

test("only warns about a version mismatch when versions differ", () => {
  assert.equal(describeVersionMismatch("2026.1.8", "2026.1.8"), "");
  assert.equal(describeVersionMismatch("", "2026.1.8"), "");
  assert.match(describeVersionMismatch("2026.1.7", "2026.1.8"), /2026\.1\.7/);
});
