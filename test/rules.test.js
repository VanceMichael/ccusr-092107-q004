import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createLedgers, appendEntry, buildDossier } from "../src/ledgers.js";
import { loadLedgers } from "../src/loader.js";
import { evaluateRules } from "../src/rules.js";


const NOW = "2026-09-26";

async function fixtureDossier(scenicId) {
  const raw = await readFile(new URL("../fixtures/ledgers.json", import.meta.url), "utf8");
  const ledgers = loadLedgers(createLedgers(), JSON.parse(raw));
  return buildDossier(ledgers, scenicId);
}

test("样例景区触发投诉、设施、数据与新业态规则", async () => {
  const dossier = await fixtureDossier("JQ-001");
  const findings = evaluateRules(dossier, { now: NOW });
  const byId = new Map(findings.map((f) => [f.ruleId, f]));

  // 安全隐患已整改，但服务投诉未办结、设施老化未闭环：复牌被阻断
  assert.equal(byId.get("R1").severity, "blocker");
  assert.deepEqual(byId.get("R1").refs, ["FB-001", "FB-002"]);
  assert.equal(byId.get("R2").severity, "blocker");
  assert.deepEqual(byId.get("R2").refs, ["FR-002"]);

  // 客流曾被下修更正、新业态缺少佐证：列为警示
  assert.equal(byId.get("R3").severity, "warning");
  assert.deepEqual(byId.get("R3").refs, ["OD-002"]);
  assert.equal(byId.get("R4").severity, "warning");
  assert.deepEqual(byId.get("R4").refs, ["OD-004"]);

  // 反馈超期未答复；整改期尚未届满，R5 不触发
  assert.ok(byId.has("R6"));
  assert.ok(!byId.has("R5"));

  // 阻断项排在警示之前
  assert.equal(findings[0].severity, "blocker");
});

test("整改期届满未复核触发继续降级评估", () => {
  const ledgers = createLedgers();
  appendEntry(ledgers, "review_conclusion", {
    id: "RC-T1",
    scenicId: "JQ-009",
    recordedAt: "2026-01-10",
    source: "复核评审组",
    payload: { decision: "downgrade", rectificationDeadline: "2026-06-30" },
  });
  const findings = evaluateRules(buildDossier(ledgers, "JQ-009"), { now: NOW });
  const r5 = findings.find((f) => f.ruleId === "R5");
  assert.equal(r5.severity, "blocker");
  assert.deepEqual(r5.refs, ["RC-T1"]);

  // 届满后已有复核结论的，不再触发
  appendEntry(ledgers, "review_conclusion", {
    id: "RC-T2",
    scenicId: "JQ-009",
    recordedAt: "2026-07-15",
    source: "复核评审组",
    payload: { decision: "hold" },
  });
  const again = evaluateRules(buildDossier(ledgers, "JQ-009"), { now: NOW });
  assert.ok(!again.some((f) => f.ruleId === "R5"));
});

test("新业态有投资与收入佐证时不触发警示", () => {
  const ledgers = createLedgers();
  appendEntry(ledgers, "operations_data", {
    id: "OD-T1",
    scenicId: "JQ-009",
    recordedAt: "2026-05-01",
    source: "经营月报",
    payload: { kind: "activity", activityId: "ACT-T1", name: "夜游项目" },
  });
  appendEntry(ledgers, "rectification_investment", {
    id: "RI-T1",
    scenicId: "JQ-009",
    recordedAt: "2026-04-20",
    source: "整改专项账",
    payload: { project: "夜游灯光", amount: 120, activityRef: "ACT-T1" },
  });
  appendEntry(ledgers, "operations_data", {
    id: "OD-T2",
    scenicId: "JQ-009",
    recordedAt: "2026-06-01",
    source: "闸机导出数据",
    payload: { kind: "metric", metric: "夜游收入万元", value: 35, activityRef: "ACT-T1" },
  });
  const findings = evaluateRules(buildDossier(ledgers, "JQ-009"), { now: NOW });
  assert.ok(!findings.some((f) => f.ruleId === "R4"));
});

test("规则评估必须给出评审日期", async () => {
  const dossier = await fixtureDossier("JQ-001");
  assert.throws(() => evaluateRules(dossier, {}), /评审日期/);
});
