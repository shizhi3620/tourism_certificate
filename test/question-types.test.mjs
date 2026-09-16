import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { questionTypeFor, validateGenerationPolicies, validateQuestionTypeCatalog, validateWrittenQuestion } from "../public/question-types.js";

const exam = JSON.parse(await readFile(new URL("../content/exam.json", import.meta.url), "utf8"));
const writtenExam = exam.exam.writtenExam;
const catalog = writtenExam.questionTypes;

test("content contains a valid versioned question type catalog", () => {
  assert.deepEqual(validateQuestionTypeCatalog(catalog), []);
  assert.deepEqual(validateGenerationPolicies(writtenExam, catalog), []);
  assert.equal(questionTypeFor(catalog, "multiple_choice").minCorrect, 2);
  assert.deepEqual(questionTypeFor(catalog, "true_false").fixedOptions, ["正确", "错误"]);
});

test("published questions satisfy their declared type contract", () => {
  for (const question of exam.questions) {
    assert.deepEqual(validateWrittenQuestion(question, catalog), [], question.id);
  }
});

test("unknown and structurally invalid types fail validation", () => {
  assert.deepEqual(validateWrittenQuestion({ type: "short_answer", options: [], answer: [] }, catalog), ["题型不在题型清单中：short_answer"]);
  assert.ok(validateWrittenQuestion({ type: "multiple_choice", options: ["A", "B"], answer: [0] }, catalog).includes("正确项少于 2 项"));
  assert.ok(validateWrittenQuestion({ type: "true_false", options: ["对", "错"], answer: 0 }, catalog).includes("固定选项必须为：正确、错误"));
});
