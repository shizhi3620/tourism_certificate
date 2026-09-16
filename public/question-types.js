const selectionModes = new Set(["single", "multiple"]);

const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;

export function questionTypeFor(catalog, typeId) {
  return Array.isArray(catalog) ? catalog.find((type) => type?.id === typeId) ?? null : null;
}

export function validateQuestionTypeCatalog(catalog) {
  const errors = [];
  if (!Array.isArray(catalog) || catalog.length === 0) return ["题型清单必须是非空数组"];
  const ids = new Set();
  for (const [index, type] of catalog.entries()) {
    const prefix = `题型清单第 ${index + 1} 项`;
    if (!type || typeof type !== "object") { errors.push(`${prefix}必须是对象`); continue; }
    if (typeof type.id !== "string" || !/^[a-z][a-z0-9_]*$/.test(type.id)) errors.push(`${prefix}的 id 无效`);
    else if (ids.has(type.id)) errors.push(`题型标识重复：${type.id}`);
    else ids.add(type.id);
    if (typeof type.label !== "string" || !type.label.trim()) errors.push(`${type.id ?? prefix}缺少显示名称`);
    if (!selectionModes.has(type.selectionMode)) errors.push(`${type.id ?? prefix}的 selectionMode 无效`);
    if (!isPositiveInteger(type.minCorrect)) errors.push(`${type.id ?? prefix}的 minCorrect 无效`);
    if (type.maxCorrect !== null && !isPositiveInteger(type.maxCorrect)) errors.push(`${type.id ?? prefix}的 maxCorrect 无效`);
    if (isPositiveInteger(type.minCorrect) && isPositiveInteger(type.maxCorrect) && type.maxCorrect < type.minCorrect) errors.push(`${type.id ?? prefix}的正确项上下限矛盾`);
    if (!isPositiveInteger(type.minOptions)) errors.push(`${type.id ?? prefix}的 minOptions 无效`);
    if (type.maxOptions !== null && !isPositiveInteger(type.maxOptions)) errors.push(`${type.id ?? prefix}的 maxOptions 无效`);
    if (isPositiveInteger(type.minOptions) && isPositiveInteger(type.maxOptions) && type.maxOptions < type.minOptions) errors.push(`${type.id ?? prefix}的选项上下限矛盾`);
    if (type.fixedOptions !== undefined) {
      if (!Array.isArray(type.fixedOptions) || type.fixedOptions.length < 2 || type.fixedOptions.some((option) => typeof option !== "string" || !option.trim())) {
        errors.push(`${type.id ?? prefix}的 fixedOptions 无效`);
      } else if (new Set(type.fixedOptions).size !== type.fixedOptions.length) {
        errors.push(`${type.id ?? prefix}的 fixedOptions 不能重复`);
      }
    }
  }
  return errors;
}

export function validateGenerationPolicies(writtenExam, catalog) {
  const errors = [];
  const policies = writtenExam?.generationPolicies;
  if (!policies || typeof policies !== "object") return ["generationPolicies 必须是对象"];
  const ids = new Set((catalog ?? []).map((type) => type.id));
  for (const [mode, policy] of Object.entries(policies)) {
    if (!policy || typeof policy !== "object") { errors.push(`${mode} 的生成策略无效`); continue; }
    if (policy.requiredTypes !== undefined) {
      if (!Array.isArray(policy.requiredTypes)) errors.push(`${mode} 的 requiredTypes 必须是数组`);
      else for (const typeId of policy.requiredTypes) if (!ids.has(typeId)) errors.push(`${mode} 引用了未知题型：${typeId}`);
    }
    if (policy.targetDistribution !== undefined) {
      if (!policy.targetDistribution || typeof policy.targetDistribution !== "object") errors.push(`${mode} 的 targetDistribution 无效`);
      else {
        const entries = Object.entries(policy.targetDistribution);
        if (!entries.length) errors.push(`${mode} 的 targetDistribution 不能为空`);
        for (const [typeId, ratio] of entries) {
          if (!ids.has(typeId)) errors.push(`${mode} 的生成比例引用了未知题型：${typeId}`);
          if (typeof ratio !== "number" || ratio <= 0) errors.push(`${mode} 的题型比例无效：${typeId}`);
        }
      }
    }
  }
  return errors;
}

export function validateWrittenQuestion(question, catalog) {
  const errors = [];
  const type = questionTypeFor(catalog, question?.type);
  if (!type) return [`题型不在题型清单中：${question?.type ?? "未指定"}`];
  const options = Array.isArray(question.options) ? question.options : null;
  if (!options) errors.push("options 必须是数组");
  if (options && options.length < type.minOptions) errors.push(`选项少于 ${type.minOptions} 项`);
  if (options && type.maxOptions !== null && options.length > type.maxOptions) errors.push(`选项多于 ${type.maxOptions} 项`);
  if (type.fixedOptions && (!options || options.length !== type.fixedOptions.length || options.some((option, index) => option !== type.fixedOptions[index]))) {
    errors.push(`固定选项必须为：${type.fixedOptions.join("、")}`);
  }
  let correctCount = 0;
  if (type.selectionMode === "single") {
    if (!Number.isInteger(question.answer)) errors.push("答案必须是单个选项下标");
    else if (options && (question.answer < 0 || question.answer >= options.length)) errors.push("答案超出选项范围");
    else correctCount = 1;
  } else {
    if (!Array.isArray(question.answer) || question.answer.length === 0) {
      errors.push("答案必须是非空下标数组");
    } else {
      if (new Set(question.answer).size !== question.answer.length) errors.push("答案不能包含重复下标");
      if (question.answer.some((answer) => !Number.isInteger(answer))) errors.push("答案必须全部是选项下标");
      else if (options && question.answer.some((answer) => answer < 0 || answer >= options.length)) errors.push("答案超出选项范围");
      else correctCount = question.answer.length;
    }
  }
  if (correctCount && correctCount < type.minCorrect) errors.push(`正确项少于 ${type.minCorrect} 项`);
  if (correctCount && type.maxCorrect !== null && correctCount > type.maxCorrect) errors.push(`正确项多于 ${type.maxCorrect} 项`);
  return errors;
}
