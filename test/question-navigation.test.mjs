import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { adjacentQuestionId, questionPosition, questionsForChapter } from "../public/question-navigation.js";

const content = JSON.parse(await readFile(new URL("../content/exam.json", import.meta.url), "utf8"));

test("all published questions are reachable from the practice queue", () => {
  const all = questionsForChapter(content);
  assert.equal(all.length, content.questions.length);
  assert.ok(all.some((question) => question.id === "draft-pl-028"));
  assert.equal(questionPosition(all, "draft-pl-028"), all.length - 1);
  assert.equal(adjacentQuestionId(all, all[0].id, -1), all.at(-1).id);
  assert.equal(adjacentQuestionId(all, all.at(-1).id, 1), all[0].id);
});

test("chapter practice uses configured chapter IDs", () => {
  const questions = questionsForChapter(content, "chapter-07");
  assert.equal(questions.length, 3);
  assert.ok(questions.every((question) => question.chapterId === "chapter-07"));
});
