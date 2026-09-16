export function questionsForChapter(content, chapterId = "") {
  const questions = Array.isArray(content?.questions) ? content.questions : [];
  return chapterId ? questions.filter((question) => question.chapterId === chapterId) : questions;
}

export function questionPosition(questions, questionId) {
  const position = questions.findIndex((question) => (typeof question === "string" ? question : question.id) === questionId);
  return position < 0 ? 0 : position;
}

export function adjacentQuestionId(questions, questionId, offset) {
  if (!questions.length) return null;
  const position = questionPosition(questions, questionId);
  const question = questions[(position + offset + questions.length) % questions.length];
  return typeof question === "string" ? question : question.id;
}
