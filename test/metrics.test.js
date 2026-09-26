import test from "node:test";
import assert from "node:assert/strict";

import { createLedgers } from "../src/ledgers.js";
import { recordMetric, correctMetric, metricHistory } from "../src/metrics.js";


test("指标更正必须展示原值和来源", () => {
  const ledgers = createLedgers();
  recordMetric(ledgers, {
    id: "M-1",
    scenicId: "JQ-001",
    metric: "月度客流万人次",
    value: 12.8,
    source: "景区自报系统",
    recordedAt: "2026-07-01",
  });
  const correction = correctMetric(ledgers, {
    id: "M-2",
    scenicId: "JQ-001",
    corrects: "M-1",
    value: 9.6,
    source: "闸机导出数据",
    reason: "自报口径含未核销团队预约",
    recordedAt: "2026-07-20",
  });
  assert.equal(correction.payload.originalValue, 12.8);
  assert.equal(correction.payload.originalSource, "景区自报系统");
  assert.equal(correction.payload.corrects, "M-1");
});

test("更正链逐次记录原值，历史完整可查", () => {
  const ledgers = createLedgers();
  recordMetric(ledgers, { id: "M-1", scenicId: "JQ-001", metric: "月度客流万人次", value: 12.8, source: "景区自报系统", recordedAt: "2026-07-01" });
  correctMetric(ledgers, { id: "M-2", scenicId: "JQ-001", corrects: "M-1", value: 10.4, source: "复核口径", reason: "剔除未核销预约", recordedAt: "2026-07-10" });
  correctMetric(ledgers, { id: "M-3", scenicId: "JQ-001", corrects: "M-2", value: 9.6, source: "闸机导出数据", reason: "以闸机为准", recordedAt: "2026-07-20" });

  const history = metricHistory(ledgers, "JQ-001", "月度客流万人次");
  assert.equal(history.length, 3);
  assert.deepEqual(
    history.map((h) => [h.value, h.originalValue, h.originalSource]),
    [
      [12.8, null, null],
      [10.4, 12.8, "景区自报系统"],
      [9.6, 10.4, "复核口径"],
    ],
  );
});

test("更正对象缺失、来源缺失、原因缺失均被拒绝", () => {
  const ledgers = createLedgers();
  recordMetric(ledgers, { id: "M-1", scenicId: "JQ-001", metric: "月度客流万人次", value: 12.8, source: "景区自报系统", recordedAt: "2026-07-01" });
  assert.throws(
    () => correctMetric(ledgers, { id: "M-2", scenicId: "JQ-001", corrects: "M-X", value: 9.6, source: "闸机", reason: "r", recordedAt: "2026-07-02" }),
    /更正对象不存在/,
  );
  assert.throws(
    () => correctMetric(ledgers, { id: "M-2", scenicId: "JQ-001", corrects: "M-1", value: 9.6, reason: "r", recordedAt: "2026-07-02" }),
    /须注明来源/,
  );
  assert.throws(
    () => correctMetric(ledgers, { id: "M-2", scenicId: "JQ-001", corrects: "M-1", value: 9.6, source: "闸机", recordedAt: "2026-07-02" }),
    /须注明原因/,
  );
  assert.throws(
    () => correctMetric(ledgers, { id: "M-2", scenicId: "JQ-002", corrects: "M-1", value: 9.6, source: "闸机", reason: "r", recordedAt: "2026-07-02" }),
    /与景区不一致/,
  );
});
