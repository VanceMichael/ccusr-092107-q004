import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createLedgers, appendEntry, buildDossier } from "../src/ledgers.js";
import { createPolicyBook } from "../src/versions.js";
import { createEvidenceBook, addEvidence } from "../src/evidence.js";
import { loadLedgers, loadPolicies, loadEvidence } from "../src/loader.js";
import { runReview, requirementsFromInspections } from "../src/review.js";


const NOW = "2026-09-26";

async function loadFixture(name) {
  const raw = await readFile(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
  return JSON.parse(raw);
}

async function buildWorld() {
  const ledgers = loadLedgers(createLedgers(), await loadFixture("ledgers.json"));
  const policyBook = loadPolicies(createPolicyBook(), await loadFixture("policies.json"));
  const evidenceBook = loadEvidence(createEvidenceBook(), await loadFixture("evidence.json"));
  return { ledgers, policyBook, evidenceBook };
}

test("复牌评审会：客流漂亮但投诉与设施未解决，不予复牌并逐项示证", async () => {
  const { ledgers, policyBook, evidenceBook } = await buildWorld();
  const dossier = buildDossier(ledgers, "JQ-001");

  const review = runReview({
    scenicId: "JQ-001",
    dossier,
    evidenceBook,
    policyBook,
    reviewerId: "评审员-乙",
    now: NOW,
  });

  // 结论：阻断项未消除，维持降级继续整改
  assert.equal(review.conclusion, "hold");
  const blockerIds = review.findings.filter((f) => f.severity === "blocker").map((f) => f.ruleId);
  assert.deepEqual(blockerIds, ["R1", "R2"]);

  // 逐项展示现场证据：安全整改有据，投诉机制、服务态度、设施维护无据
  const byItem = new Map(review.evidenceReport.map((item) => [item.itemId, item]));
  assert.deepEqual([...byItem.keys()], ["AQ-01", "FW-01", "FW-02", "SS-01"]);
  assert.equal(byItem.get("AQ-01").covered, true);
  assert.equal(byItem.get("AQ-01").evidence.length, 2);
  assert.equal(byItem.get("FW-01").covered, false);
  assert.equal(byItem.get("SS-01").covered, false);

  // 指标更正展示原值与来源
  assert.equal(review.corrections.length, 1);
  assert.deepEqual(review.corrections[0], {
    id: "OD-002",
    metric: "月度客流万人次",
    originalValue: 12.8,
    originalSource: "景区自报系统",
    value: 9.6,
    source: "闸机导出数据",
    reason: "自报口径含未核销团队预约",
  });

  // 生效政策版本随评审留存：开放范围已迭代到 v2
  assert.equal(review.activePolicies.rectification_opening_scope.version, 2);
  assert.equal(review.activePolicies.review_recusal.version, 1);
  assert.equal(review.activePolicies.budget_occupation.version, 1);
});

test("复核回避：回避名单内的评审人不得参与", async () => {
  const { ledgers, policyBook, evidenceBook } = await buildWorld();
  assert.throws(
    () =>
      runReview({
        scenicId: "JQ-001",
        dossier: buildDossier(ledgers, "JQ-001"),
        evidenceBook,
        policyBook,
        reviewerId: "评审员-甲",
        now: NOW,
      }),
    /回避名单/,
  );
});

test("整改要求项来自明查暗访记录", async () => {
  const { ledgers } = await buildWorld();
  const requirements = requirementsFromInspections(buildDossier(ledgers, "JQ-001"));
  assert.deepEqual(
    requirements.map((r) => r.itemId),
    ["AQ-01", "FW-01", "FW-02", "SS-01"],
  );
});

test("无阻断项且证据逐项覆盖时建议恢复评级", () => {
  const ledgers = createLedgers();
  appendEntry(ledgers, "inspection", {
    id: "IN-R1",
    scenicId: "JQ-008",
    recordedAt: "2026-08-01",
    source: "检查组-明查二组",
    payload: { mode: "明查", items: [{ itemId: "AQ-01", requirement: "消防演练记录", result: "rectified" }] },
  });
  appendEntry(ledgers, "visitor_feedback", {
    id: "FB-R1",
    scenicId: "JQ-008",
    recordedAt: "2026-08-05",
    source: "12301 平台",
    payload: { category: "投诉", status: "resolved", summary: "退票纠纷已办结" },
  });
  const evidenceBook = createEvidenceBook();
  addEvidence(evidenceBook, {
    id: "EV-R1",
    scenicId: "JQ-008",
    itemId: "AQ-01",
    requirement: "消防演练记录",
    type: "document",
    ref: "演练台账 2026-08",
    collectedAt: "2026-08-02",
    collectedBy: "检查组-明查二组",
  });

  const review = runReview({
    scenicId: "JQ-008",
    dossier: buildDossier(ledgers, "JQ-008"),
    evidenceBook,
    policyBook: createPolicyBook(),
    reviewerId: "评审员-丙",
    now: NOW,
  });
  assert.equal(review.conclusion, "restore");
  assert.ok(review.evidenceReport.every((item) => item.covered));
});

test("整改期届满仍有阻断项时建议继续降级，已达最低等级则摘牌", () => {
  const ledgers = createLedgers();
  appendEntry(ledgers, "review_conclusion", {
    id: "RC-D1",
    scenicId: "JQ-007",
    recordedAt: "2026-01-10",
    source: "复核评审组",
    payload: { decision: "downgrade", rectificationDeadline: "2026-06-30" },
  });
  appendEntry(ledgers, "visitor_feedback", {
    id: "FB-D1",
    scenicId: "JQ-007",
    recordedAt: "2026-08-01",
    source: "12301 平台",
    payload: { category: "投诉", status: "open", summary: "退款迟迟未到账" },
  });
  const base = {
    scenicId: "JQ-007",
    dossier: buildDossier(ledgers, "JQ-007"),
    evidenceBook: createEvidenceBook(),
    policyBook: createPolicyBook(),
    reviewerId: "评审员-丁",
    now: NOW,
  };
  assert.equal(runReview(base).conclusion, "further_downgrade");
  assert.equal(runReview({ ...base, lowestLevel: true }).conclusion, "delist");
});
