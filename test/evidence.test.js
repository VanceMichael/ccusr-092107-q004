import test from "node:test";
import assert from "node:assert/strict";

import {
  createEvidenceBook,
  addEvidence,
  evidenceForItem,
  buildEvidenceReport,
} from "../src/evidence.js";


function sampleEvidence(id, itemId = "AQ-01") {
  return {
    id,
    scenicId: "JQ-001",
    itemId,
    requirement: "索道安全隐患整改",
    type: "photo",
    ref: `照片 ${id}`,
    collectedAt: "2026-04-12",
    collectedBy: "检查组-明查一组",
  };
}

test("证据登记校验必要字段、类型与编号", () => {
  const book = createEvidenceBook();
  const stored = addEvidence(book, sampleEvidence("EV-1"));
  assert.ok(Object.isFrozen(stored));
  assert.throws(() => addEvidence(book, { ...sampleEvidence("EV-2"), type: "video" }), /未知证据类型/);
  assert.throws(() => addEvidence(book, { ...sampleEvidence("EV-3"), ref: "" }), /缺少必要字段: ref/);
  assert.throws(() => addEvidence(book, sampleEvidence("EV-1")), /编号重复/);
});

test("逐项展示现场证据：覆盖与缺口一目了然", () => {
  const book = createEvidenceBook();
  addEvidence(book, sampleEvidence("EV-1"));
  addEvidence(book, { ...sampleEvidence("EV-2"), type: "inspection_record", ref: "复检报告 特检-2026-0412" });

  const report = buildEvidenceReport(book, "JQ-001", [
    { itemId: "AQ-01", requirement: "索道安全隐患整改" },
    { itemId: "FW-01", requirement: "投诉处理机制运行" },
  ]);
  assert.equal(report.length, 2);
  assert.equal(report[0].covered, true);
  assert.equal(report[0].evidence.length, 2);
  assert.equal(report[1].covered, false);
  assert.equal(report[1].evidence.length, 0);

  assert.equal(evidenceForItem(book, "JQ-001", "AQ-01").length, 2);
  assert.equal(evidenceForItem(book, "JQ-002", "AQ-01").length, 0);
});
