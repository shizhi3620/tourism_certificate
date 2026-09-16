import assert from "node:assert/strict";
import test from "node:test";
import { practicalMaterialToAttraction, validatePracticalMaterial } from "../public/practical-materials.js";

const material = {
  id: "draft-practical-1",
  kind: "practical_material",
  region: "四川省",
  attractionId: "jinsha-museum",
  name: "金沙遗址博物馆",
  chineseDescription: "讲解提纲",
  englishScript: "Welcome to the museum.",
  chineseMeaning: "欢迎来到博物馆。",
  sourceNote: "四川现场考试大纲",
  sourcePages: ["page 1"],
  sourceExcerpt: "要求介绍金沙遗址。",
  questions: [{ id: "q1", promptZh: "如何讲解？", promptEn: "How do you introduce it?", answerGuideZh: "按历史价值讲解。" }],
};

test("validates and converts practical material without a question type", () => {
  assert.deepEqual(validatePracticalMaterial(material), []);
  const attraction = practicalMaterialToAttraction(material);
  assert.equal(attraction.id, "jinsha-museum");
  assert.equal(attraction.status, "published");
  assert.equal(attraction.questions[0].status, "published");
  assert.equal("type" in attraction.questions[0], false);
});

test("rejects practical material with a question type or missing interview text", () => {
  assert.ok(validatePracticalMaterial({ ...material, kind: "written_question", type: "single_choice" }).includes("kind 必须是 practical_material"));
  assert.ok(validatePracticalMaterial({ ...material, questions: [{ id: "q1", promptZh: "中文", promptEn: "", answerGuideZh: "答案" }] }).includes("questions[0] 缺少 promptEn"));
});
