export const EXPORT_VERSION = 1;

const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isNonNegativeInteger = (value) => Number.isInteger(value) && value >= 0;

export function exportStudyRecord({ records, mocks, contentVersion, now = new Date() }) {
  return {
    exportVersion: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    contentVersion: typeof contentVersion === "string" ? contentVersion : "",
    records: isPlainObject(records) ? records : {},
    mocks: Array.isArray(mocks) ? mocks : [],
  };
}

function validateRecord(id, record) {
  const errors = [];
  if (!isPlainObject(record)) return [`${id} 的记录不是对象`];
  if (!isNonNegativeInteger(record.attempts)) errors.push(`${id} 的 attempts 无效`);
  if (!isNonNegativeInteger(record.correct)) errors.push(`${id} 的 correct 无效`);
  if (typeof record.wrong !== "boolean") errors.push(`${id} 的 wrong 无效`);
  if (isNonNegativeInteger(record.correct) && isNonNegativeInteger(record.attempts) && record.correct > record.attempts) errors.push(`${id} 的 correct 大于 attempts`);
  return errors;
}

export function importStudyRecord(payload) {
  if (!isPlainObject(payload)) throw new Error("导入文件不是有效的学习记录");
  if (payload.exportVersion !== EXPORT_VERSION) throw new Error(`不支持的导出格式版本：${payload.exportVersion ?? "缺失"}`);
  if (!isPlainObject(payload.records)) throw new Error("导入文件缺少 records");
  if (!Array.isArray(payload.mocks)) throw new Error("导入文件缺少 mocks");
  const errors = Object.entries(payload.records).flatMap(([id, record]) => validateRecord(id, record));
  if (errors.length) throw new Error(`导入文件校验失败：${errors.slice(0, 3).join("；")}`);
  if (payload.mocks.some((mock) => !isPlainObject(mock) || !isNonNegativeInteger(mock.score) || !isNonNegativeInteger(mock.total))) {
    throw new Error("导入文件的模考记录无效");
  }
  return {
    exportVersion: payload.exportVersion,
    exportedAt: typeof payload.exportedAt === "string" ? payload.exportedAt : "",
    contentVersion: typeof payload.contentVersion === "string" ? payload.contentVersion : "",
    records: payload.records,
    mocks: payload.mocks,
  };
}

export function describeVersionMismatch(exportedVersion, currentVersion) {
  if (!exportedVersion || !currentVersion || exportedVersion === currentVersion) return "";
  return `这份记录来自内容版本 ${exportedVersion}，当前题库为 ${currentVersion}。部分统计可能以旧答案为准。`;
}
