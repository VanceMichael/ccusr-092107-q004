// 指标更正：任何运营指标的更正都必须引用原条目，
// 并展示原值与原来源，更正链完整可查、不可抹除。
import { appendEntry, findEntry } from "./ledgers.js";

// 登记指标读数（写入运营数据台账）。
export function recordMetric(ledgers, { id, scenicId, metric, value, source, recordedAt, activityRef }) {
  if (!metric || value === undefined || value === null) {
    throw new Error("指标读数须含 metric 与 value");
  }
  return appendEntry(ledgers, "operations_data", {
    id,
    scenicId,
    recordedAt,
    source,
    payload: { kind: "metric", metric, value, ...(activityRef ? { activityRef } : {}) },
  });
}

// 更正指标：必须引用原条目、注明来源与原因；
// 原值与原来源从被更正条目中取出并随更正永久留存。
export function correctMetric(ledgers, { id, scenicId, corrects, value, source, reason, recordedAt }) {
  if (!source) {
    throw new Error("指标更正须注明来源 source");
  }
  if (!reason) {
    throw new Error("指标更正须注明原因 reason");
  }
  const original = findEntry(ledgers, "operations_data", corrects);
  if (!original) {
    throw new Error(`更正对象不存在: ${corrects}`);
  }
  if (original.scenicId !== scenicId) {
    throw new Error("更正对象与景区不一致");
  }
  return appendEntry(ledgers, "operations_data", {
    id,
    scenicId,
    recordedAt,
    source,
    payload: {
      kind: "correction",
      metric: original.payload.metric,
      value,
      corrects,
      originalValue: original.payload.value,
      originalSource: original.source,
      reason,
    },
  });
}

// 指标更正链：按时间逐项展示读数与更正，每条更正都带原值与原来源。
export function metricHistory(ledgers, scenicId, metric) {
  return ledgers.operations_data
    .filter((entry) => entry.scenicId === scenicId && entry.payload?.metric === metric)
    .slice()
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
    .map((entry) => ({
      id: entry.id,
      metric,
      kind: entry.payload.kind,
      value: entry.payload.value,
      source: entry.source,
      recordedAt: entry.recordedAt,
      corrects: entry.payload.corrects ?? null,
      originalValue: entry.payload.originalValue ?? null,
      originalSource: entry.payload.originalSource ?? null,
      reason: entry.payload.reason ?? null,
    }));
}
