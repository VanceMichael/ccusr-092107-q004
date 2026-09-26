// 指标更正：更正条目必须展示原值与来源，原条目保留不删改。

export function correctMetric(ledger, entryId, { value, source, reason, at }) {
  const original = ledger.byId(entryId);
  if (!original) {
    throw new Error(`被更正的指标不存在: ${entryId}`);
  }
  if (!source || !reason) {
    throw new Error("指标更正必须说明来源与理由");
  }
  return ledger.append({
    scenicId: original.scenic_id,
    kind: original.kind,
    payload: {
      ...original.payload,
      value,
      correction: {
        metric: original.payload.metric ?? original.kind,
        original_value: original.payload.value,
        original_source: original.source,
        corrected_value: value,
        correction_source: source,
        reason,
      },
    },
    source,
    at,
    supersedes: original.id,
  });
}

// 指标沿革：逐项列出原值、来源与历次更正，供评审核对。
export function metricHistory(ledger, scenicId, metric) {
  return ledger
    .forScenic(scenicId)
    .filter((e) => (e.payload.metric ?? e.kind) === metric)
    .map((e) => ({
      id: e.id,
      value: e.payload.value,
      source: e.source,
      at: e.at,
      supersedes: e.supersedes,
      correction: e.payload.correction ?? null,
    }));
}
