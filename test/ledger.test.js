import test from "node:test";
import assert from "node:assert/strict";

import { Ledger, createLedgers, LEDGER_CATEGORIES } from "../src/ledger.js";
import { correctMetric, metricHistory } from "../src/corrections.js";


test("七类台账分开留存", () => {
  const ledgers = createLedgers();
  assert.deepEqual(Object.keys(ledgers), LEDGER_CATEGORIES);
  ledgers.inspection.append({ scenicId: "sc-1", kind: "covert", source: "暗访组" });
  ledgers.visitor_feedback.append({ scenicId: "sc-1", kind: "complaint", source: "热线" });
  assert.equal(ledgers.inspection.entries.length, 1);
  assert.equal(ledgers.visitor_feedback.entries.length, 1);
  assert.equal(ledgers.operation_data.entries.length, 0);
});

test("未知类别与缺字段被拒绝", () => {
  assert.throws(() => new Ledger("unknown"), /未知台账类别/);
  const ledger = new Ledger("inspection");
  assert.throws(() => ledger.append({ scenicId: "sc-1", kind: "covert" }), /来源/);
});

test("指标更正展示原值和来源，原条目保留", () => {
  const ledgers = createLedgers();
  const original = ledgers.operation_data.append({
    scenicId: "sc-1",
    kind: "metric",
    payload: { metric: "visitor_volume", value: 120000 },
    source: "景区自报",
    at: "2026-05-01T00:00:00Z",
  });
  const correction = correctMetric(ledgers.operation_data, original.id, {
    value: 86000,
    source: "第三方审计",
    reason: "客流数据注水",
    at: "2026-06-01T00:00:00Z",
  });
  assert.equal(correction.supersedes, original.id);
  assert.deepEqual(correction.payload.correction, {
    metric: "visitor_volume",
    original_value: 120000,
    original_source: "景区自报",
    corrected_value: 86000,
    correction_source: "第三方审计",
    reason: "客流数据注水",
  });
  // 原条目保留，当前有效条目只有更正后的值
  assert.equal(ledgers.operation_data.entries.length, 2);
  assert.equal(ledgers.operation_data.current("sc-1").length, 1);
  assert.equal(ledgers.operation_data.current("sc-1")[0].payload.value, 86000);
});

test("指标沿革逐项列出原值与来源", () => {
  const ledgers = createLedgers();
  const e1 = ledgers.operation_data.append({
    scenicId: "sc-1",
    kind: "metric",
    payload: { metric: "visitor_volume", value: 120000 },
    source: "景区自报",
  });
  correctMetric(ledgers.operation_data, e1.id, {
    value: 86000,
    source: "第三方审计",
    reason: "客流数据注水",
  });
  const history = metricHistory(ledgers.operation_data, "sc-1", "visitor_volume");
  assert.equal(history.length, 2);
  assert.equal(history[0].value, 120000);
  assert.equal(history[0].source, "景区自报");
  assert.equal(history[1].correction.original_value, 120000);
});

test("更正必须说明来源与理由", () => {
  const ledgers = createLedgers();
  const e1 = ledgers.operation_data.append({
    scenicId: "sc-1",
    kind: "metric",
    payload: { metric: "revenue", value: 100 },
    source: "景区自报",
  });
  assert.throws(() => correctMetric(ledgers.operation_data, e1.id, { value: 90 }), /来源与理由/);
  assert.throws(
    () => correctMetric(ledgers.operation_data, "missing", { value: 1, source: "s", reason: "r" }),
    /不存在/,
  );
});
