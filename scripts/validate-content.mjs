import { readFile } from "node:fs/promises";
import { validateGenerationPolicies, validateQuestionTypeCatalog, validateWrittenQuestion } from "../public/question-types.js";

const examPath = new URL("../content/exam.json", import.meta.url);
const practicalPath = new URL("../content/sichuan-practical.json", import.meta.url);

const exam = JSON.parse(await readFile(examPath, "utf8"));
const writtenExam = exam.exam.writtenExam;
const questionTypes = writtenExam.questionTypes;
const questionTypeErrors = validateQuestionTypeCatalog(questionTypes);
if (questionTypeErrors.length) throw new Error(`invalid question type catalog: ${questionTypeErrors.join("; ")}`);
const generationPolicyErrors = validateGenerationPolicies(writtenExam, questionTypes);
if (generationPolicyErrors.length) throw new Error(`invalid generation policies: ${generationPolicyErrors.join("; ")}`);
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
  "syllabusRequirement",
  "textbookSubject",
  "textbookChapter",
  "sourcePages",
  "sourceExcerpt",
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
const chapterById = new Map(exam.chapters.map((chapter) => [chapter.id, chapter]));
const subjectById = new Map(exam.subjects.map((subject) => [subject.id, subject]));
for (const question of exam.questions) {
  for (const field of requiredQuestionFields) {
    if (!(field in question)) throw new Error(`${question.id} is missing ${field}`);
  }
  const typeErrors = validateWrittenQuestion(question, questionTypes);
  if (typeErrors.length) throw new Error(`${question.id} has an invalid question type contract: ${typeErrors.join("; ")}`);
  if (question.sourceStatus !== "published") {
    throw new Error(`${question.id} is not published in the canonical exam content`);
  }
  if (!question.syllabusRequirement || !question.textbookSubject || !question.textbookChapter
    || !Array.isArray(question.sourcePages) || !question.sourcePages.length || !question.sourceExcerpt) {
    throw new Error(`${question.id} is missing source traceability`);
  }
  const chapter = chapterById.get(question.chapterId);
  const subject = chapter ? subjectById.get(chapter.subjectId) : null;
  if (!chapter || !subject) throw new Error(`${question.id} has no configured chapter`);
  if (question.subject !== subject.name && question.subject !== subject.id) {
    throw new Error(`${question.id} subject does not match its chapter`);
  }
  if (question.textbookSubject !== subject.name) {
    throw new Error(`${question.id} textbook subject does not match its chapter`);
  }
}
for (const attraction of practical.attractions) {
  if (!attraction.status || !Array.isArray(attraction.questions)) {
    throw new Error(`${attraction.id} has an invalid practical content shape`);
  }
}

console.log(`validated exam ${exam.contentVersion}: ${exam.questions.length} questions, ${practical.attractions.length} practical attractions`);
