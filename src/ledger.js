// 分类台账：评级依据、明查暗访、游客反馈、设施风险、运营数据、整改投资、复核结论
// 七类资料分开留存。台账只追加、不修改；指标更正以新条目形式留痕，原条目保留。

export const LEDGER_CATEGORIES = Object.freeze([
  "rating_basis",
  "inspection",
  "visitor_feedback",
  "facility_risk",
  "operation_data",
  "rectification_investment",
  "review_conclusion",
]);

let counter = 0;

export class Ledger {
  constructor(category) {
    if (!LEDGER_CATEGORIES.includes(category)) {
      throw new Error(`未知台账类别: ${category}`);
    }
    this.category = category;
    this.entries = [];
  }

  append({ scenicId, kind, payload = {}, source, at, supersedes = null }) {
    if (!scenicId || !kind || !source) {
      throw new Error("台账条目必须包含景区、类型与来源");
    }
    if (supersedes && !this.entries.some((e) => e.id === supersedes)) {
      throw new Error(`被更正的条目不存在: ${supersedes}`);
    }
    counter += 1;
    const entry = {
      id: `${this.category}-${counter}`,
      seq: this.entries.length + 1,
      category: this.category,
      scenic_id: scenicId,
      kind,
      payload,
      source,
      at: at ?? new Date().toISOString(),
      supersedes,
    };
    this.entries.push(entry);
    return entry;
  }

  forScenic(scenicId) {
    return this.entries.filter((e) => e.scenic_id === scenicId);
  }

  // 当前有效条目：被更正的条目让位于更正条目，但原始记录仍保留在 entries 中。
  current(scenicId) {
    const replaced = new Set(this.entries.map((e) => e.supersedes).filter(Boolean));
    return this.forScenic(scenicId).filter((e) => !replaced.has(e.id));
  }

  byId(id) {
    return this.entries.find((e) => e.id === id) ?? null;
  }
}

export function createLedgers() {
  return Object.fromEntries(LEDGER_CATEGORIES.map((c) => [c, new Ledger(c)]));
}
