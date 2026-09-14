import { readFile } from "node:fs/promises";

const examPath = new URL("../content/exam.json", import.meta.url);
const practicalPath = new URL("../content/sichuan-practical.json", import.meta.url);

const exam = JSON.parse(await readFile(examPath, "utf8"));
const practical = JSON.parse(await readFile(practicalPath, "utf8"));
const requiredQuestionFields = [
  "id",
  "chapterId",
  "type",
  "sourceType",
  "sourceStatus",
  "sourceNote",
  "prompt",
  "options",
  "answer",
  "explanation",
];

if (exam.exam.writtenExam.subjectCount !== 4) {
  throw new Error("exam.json must declare four national written-exam subjects");
}
if (exam.exam.practicalExam.interviewLanguage !== "英语") {
  throw new Error("exam.json must declare English as the practical interview language");
}
if (!/^\d{4}\.\d+\.\d+$/.test(exam.contentVersion)) {
  throw new Error(`invalid contentVersion: ${exam.contentVersion}`);
}
if (new Set(exam.questions.map((question) => question.id)).size !== exam.questions.length) {
  throw new Error("exam.json contains duplicate question IDs");
}
for (const question of exam.questions) {
  for (const field of requiredQuestionFields) {
    if (!(field in question)) throw new Error(`${question.id} is missing ${field}`);
  }
  if (!Array.isArray(question.options) || question.answer < 0 || question.answer >= question.options.length) {
    throw new Error(`${question.id} has an invalid answer`);
  }
}
for (const attraction of practical.attractions) {
  if (!attraction.status || !Array.isArray(attraction.questions)) {
    throw new Error(`${attraction.id} has an invalid practical content shape`);
  }
}

console.log(`validated exam ${exam.contentVersion}: ${exam.questions.length} questions, ${practical.attractions.length} practical attractions`);
