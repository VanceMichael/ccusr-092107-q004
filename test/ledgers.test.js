import test from "node:test";
import assert from "node:assert/strict";

import {
  LEDGER_TYPES,
  createLedgers,
  appendEntry,
  entriesFor,
  findEntry,
  buildDossier,
} from "../src/ledgers.js";


function sampleEntry(id, scenicId = "JQ-001") {
  return { id, scenicId, recordedAt: "2026-09-01", source: "测试来源", payload: { note: "样例" } };
}

test("七类台账分开留存", () => {
  assert.deepEqual(LEDGER_TYPES, [
    "rating_basis",
    "inspection",
    "visitor_feedback",
    "facility_risk",
    "operations_data",
    "rectification_investment",
    "review_conclusion",
  ]);
  const ledgers = createLedgers();
  for (const type of LEDGER_TYPES) {
    appendEntry(ledgers, type, sampleEntry(`${type}-1`));
  }
  for (const type of LEDGER_TYPES) {
    assert.equal(ledgers[type].length, 1);
    assert.equal(ledgers[type][0].id, `${type}-1`);
  }
});

test("台账条目只增不改且按景区隔离", () => {
  const ledgers = createLedgers();
  const stored = appendEntry(ledgers, "inspection", sampleEntry("IN-T1"));
  assert.ok(Object.isFrozen(stored));
  assert.ok(Object.isFrozen(stored.payload));
  appendEntry(ledgers, "inspection", sampleEntry("IN-T2", "JQ-002"));
  assert.equal(entriesFor(ledgers, "inspection", "JQ-001").length, 1);
  assert.equal(findEntry(ledgers, "inspection", "IN-T2").scenicId, "JQ-002");
});

test("缺少必要字段、未知类型与重复编号均被拒绝", () => {
  const ledgers = createLedgers();
  assert.throws(() => appendEntry(ledgers, "unknown_type", sampleEntry("X-1")), /未知台账类型/);
  assert.throws(
    () => appendEntry(ledgers, "inspection", { id: "X-2", scenicId: "JQ-001", recordedAt: "2026-09-01" }),
    /缺少必要字段: source/,
  );
  appendEntry(ledgers, "inspection", sampleEntry("X-3"));
  assert.throws(() => appendEntry(ledgers, "inspection", sampleEntry("X-3")), /编号重复/);
});

test("档案汇总按七类分组", () => {
  const ledgers = createLedgers();
  appendEntry(ledgers, "visitor_feedback", sampleEntry("FB-T1"));
  appendEntry(ledgers, "facility_risk", sampleEntry("FR-T1"));
  const dossier = buildDossier(ledgers, "JQ-001");
  assert.equal(dossier.feedback.length, 1);
  assert.equal(dossier.facilityRisks.length, 1);
  assert.equal(dossier.inspections.length, 0);
  assert.equal(dossier.scenicId, "JQ-001");
});
