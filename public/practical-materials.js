const requiredText = (value) => typeof value === "string" && value.trim().length > 0;

export function validatePracticalMaterial(item) {
  const errors = [];
  if (item?.kind !== "practical_material") errors.push("kind 必须是 practical_material");
  for (const field of ["id", "region", "attractionId", "name", "chineseDescription", "englishScript", "chineseMeaning", "sourceNote", "sourceExcerpt"]) {
    if (!requiredText(item?.[field])) errors.push(`缺少 ${field}`);
  }
  if (!Array.isArray(item?.sourcePages) || item.sourcePages.length === 0 || item.sourcePages.some((page) => !requiredText(page))) {
    errors.push("sourcePages 必须是非空文本数组");
  }
  if (!Array.isArray(item?.questions) || item.questions.length === 0) {
    errors.push("questions 必须是非空数组");
  } else {
    const ids = new Set();
    for (const [index, question] of item.questions.entries()) {
      const prefix = `questions[${index}]`;
      for (const field of ["id", "promptZh", "promptEn", "answerGuideZh"]) {
        if (!requiredText(question?.[field])) errors.push(`${prefix} 缺少 ${field}`);
      }
      if (requiredText(question?.id)) {
        if (ids.has(question.id)) errors.push(`${prefix} 的 id 重复`);
        ids.add(question.id);
      }
    }
  }
  return errors;
}

export function practicalMaterialToAttraction(item) {
  return {
    id: item.attractionId,
    name: item.name,
    status: "published",
    chineseDescription: item.chineseDescription,
    englishScript: item.englishScript,
    chineseMeaning: item.chineseMeaning,
    questions: item.questions.map((question) => ({
      id: question.id,
      promptZh: question.promptZh,
      promptEn: question.promptEn,
      answerGuideZh: question.answerGuideZh,
      status: "published",
    })),
    source: {
      note: item.sourceNote,
      pages: item.sourcePages,
      excerpt: item.sourceExcerpt,
    },
  };
}
