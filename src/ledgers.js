// 七类台账分账留存：评级依据、明查暗访、游客反馈、设施风险、
// 运营数据、整改投资、复核结论。台账只增不改，指标更正通过
// 追加更正条目完成（见 metrics.js），历史条目永不覆盖。

export const LEDGER_TYPES = Object.freeze([
  "rating_basis",
  "inspection",
  "visitor_feedback",
  "facility_risk",
  "operations_data",
  "rectification_investment",
  "review_conclusion",
]);

const REQUIRED_FIELDS = ["id", "scenicId", "recordedAt", "source"];

function assertLedgerType(type) {
  if (!LEDGER_TYPES.includes(type)) {
    throw new Error(`未知台账类型: ${type}`);
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) {
      deepFreeze(value[key]);
    }
    Object.freeze(value);
  }
  return value;
}

export function createLedgers() {
  const ledgers = {};
  for (const type of LEDGER_TYPES) {
    ledgers[type] = [];
  }
  return ledgers;
}

// 追加台账条目。条目一旦写入即冻结，不提供修改与删除接口。
export function appendEntry(ledgers, type, entry) {
  assertLedgerType(type);
  for (const field of REQUIRED_FIELDS) {
    if (entry[field] === undefined || entry[field] === null || entry[field] === "") {
      throw new Error(`台账条目缺少必要字段: ${field}`);
    }
  }
  if (ledgers[type].some((item) => item.id === entry.id)) {
    throw new Error(`台账条目编号重复: ${entry.id}`);
  }
  const stored = deepFreeze({ ...entry });
  ledgers[type].push(stored);
  return stored;
}

export function entriesFor(ledgers, type, scenicId) {
  assertLedgerType(type);
  return ledgers[type].filter((entry) => entry.scenicId === scenicId);
}

export function findEntry(ledgers, type, id) {
  assertLedgerType(type);
  return ledgers[type].find((entry) => entry.id === id) ?? null;
}

// 汇总某景区的全量档案，供规则引擎与复牌评审使用。
export function buildDossier(ledgers, scenicId) {
  return {
    scenicId,
    ratingBasis: entriesFor(ledgers, "rating_basis", scenicId),
    inspections: entriesFor(ledgers, "inspection", scenicId),
    feedback: entriesFor(ledgers, "visitor_feedback", scenicId),
    facilityRisks: entriesFor(ledgers, "facility_risk", scenicId),
    operations: entriesFor(ledgers, "operations_data", scenicId),
    investments: entriesFor(ledgers, "rectification_investment", scenicId),
    conclusions: entriesFor(ledgers, "review_conclusion", scenicId),
  };
}
