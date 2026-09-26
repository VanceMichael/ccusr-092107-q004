// 现场证据：按整改要求项登记，恢复评级或继续降级时逐项展示。

export const EVIDENCE_TYPES = Object.freeze([
  "photo",
  "document",
  "inspection_record",
  "witness",
  "data",
]);

const REQUIRED_FIELDS = [
  "id",
  "scenicId",
  "itemId",
  "requirement",
  "type",
  "ref",
  "collectedAt",
  "collectedBy",
];

export function createEvidenceBook() {
  return { items: [] };
}

export function addEvidence(book, entry) {
  for (const field of REQUIRED_FIELDS) {
    if (!entry[field]) {
      throw new Error(`证据缺少必要字段: ${field}`);
    }
  }
  if (!EVIDENCE_TYPES.includes(entry.type)) {
    throw new Error(`未知证据类型: ${entry.type}`);
  }
  if (book.items.some((item) => item.id === entry.id)) {
    throw new Error(`证据编号重复: ${entry.id}`);
  }
  const stored = Object.freeze({ ...entry });
  book.items.push(stored);
  return stored;
}

export function evidenceForItem(book, scenicId, itemId) {
  return book.items.filter((item) => item.scenicId === scenicId && item.itemId === itemId);
}

// 逐项展示：每个整改要求项列出对应现场证据与覆盖状态。
export function buildEvidenceReport(book, scenicId, requirements) {
  return requirements.map(({ itemId, requirement }) => {
    const evidence = evidenceForItem(book, scenicId, itemId);
    return { itemId, requirement, covered: evidence.length > 0, evidence };
  });
}
