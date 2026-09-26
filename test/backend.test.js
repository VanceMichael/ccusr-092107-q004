import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { ScenicExitBackend } from "../src/backend.js";


async function makeBackend() {
  const rules = JSON.parse(await readFile(new URL("../fixtures/rules.json", import.meta.url), "utf8"));
  const b = new ScenicExitBackend({ rules });
  b.publishPolicy("opening_scope", {
    rules: { allowed_areas: ["东区"] },
    effectiveAt: "2026-01-01T00:00:00Z",
    publishedBy: "主管部门",
  });
  b.publishPolicy("budget_occupancy", {
    rules: { cap: 1000000 },
    effectiveAt: "2026-01-01T00:00:00Z",
    publishedBy: "主管部门",
  });
  b.publishPolicy("review_recusal", {
    rules: { recuse_prior_inspectors: true },
    effectiveAt: "2026-01-01T00:00:00Z",
    publishedBy: "主管部门",
  });
  b.publishPolicy("public_announcement", {
    rules: { channels: ["官网"] },
    effectiveAt: "2026-01-01T00:00:00Z",
    publishedBy: "主管部门",
  });
  return b;
}

test("复牌评审全链路：隐患整改但投诉与老化未决，新业态无改善", async () => {
  const b = await makeBackend();

  // 评级依据与明查暗访分账留存
  b.record("rating_basis", {
    scenicId: "sc-1",
    kind: "grading",
    payload: { level: "4A", year: 2023 },
    source: "评级委员会",
  });
  b.record("inspection", {
    scenicId: "sc-1",
    kind: "covert",
    payload: { inspectors: ["inspector-a"], note: "索道隐患" },
    source: "暗访组",
    at: "2026-03-01T00:00:00Z",
  });
  const hazardOpen = b.record("facility_risk", {
    scenicId: "sc-1",
    kind: "hazard",
    payload: { severity: "major", status: "open", evidence_of: "item-safety" },
    source: "明查记录",
  });

  // 客流数据漂亮但被审计更正：原值与来源留痕
  const reported = b.record("operation_data", {
    scenicId: "sc-1",
    kind: "metric",
    payload: { metric: "visitor_volume", value: 120000 },
    source: "景区自报",
  });
  b.correctMetric("operation_data", reported.id, {
    value: 86000,
    source: "第三方审计",
    reason: "客流数据注水",
  });

  // 隐患闭环以更正条目留痕，原隐患记录保留
  b.record("facility_risk", {
    scenicId: "sc-1",
    kind: "hazard",
    payload: { severity: "major", status: "closed", evidence_of: "item-safety", result: "pass" },
    source: "复查记录",
    supersedes: hazardOpen.id,
  });
  b.record("visitor_feedback", {
    scenicId: "sc-1",
    kind: "complaint",
    payload: { status: "open", age_days: 45, evidence_of: "item-service" },
    source: "游客热线",
  });
  b.record("operation_data", {
    scenicId: "sc-1",
    kind: "metric",
    payload: { metric: "new_business_revenue", value: -5000, evidence_of: "item-newbiz" },
    source: "景区自报",
  });

  // 规则求值：投诉逾期、数据更正、新业态无改善均被触发
  const findings = b.evaluate("sc-1");
  const codes = findings.map((f) => f.finding.code).sort();
  assert.deepEqual(codes, ["COMPLAINT_OVERDUE", "DATA_CORRECTED", "NEW_BUSINESS_NO_GAIN"]);

  // 整改期开放范围与预算占用受版本控制
  assert.equal(b.openAreaDuringRectification("sc-1", "东区", "2026-04-01T00:00:00Z").policy_version, 1);
  assert.throws(() => b.openAreaDuringRectification("sc-1", "西区", "2026-04-01T00:00:00Z"), /未获批准/);
  b.recordInvestment("sc-1", { amount: 800000, project: "索道检修", source: "财政专户", at: "2026-04-01T00:00:00Z" });
  assert.throws(
    () => b.recordInvestment("sc-1", { amount: 300000, project: "夜游项目", source: "财政专户" }),
    /超出整改预算占用上限/,
  );

  // 降级流程推进到复核
  const proc = b.startProcess("downgrade", "sc-1");
  b.advance(proc.id, "rectification_ordered", { actor: "评审员", artifacts: { rule_findings: codes } });
  b.advance(proc.id, "rectifying", { actor: "评审员", artifacts: { rectification_order: "o-1" } });
  b.advance(proc.id, "review", { actor: "复核员", artifacts: { evidence_chain: "chain-1" } });

  // 复核回避：暗访人员不得担任复核
  assert.throws(
    () =>
      b.concludeReview("sc-1", {
        reviewerId: "inspector-a",
        items: [{ item_id: "item-safety", requirement: "重大隐患闭环" }],
        outcome: "restored",
      }),
    /须回避/,
  );

  // 合格复核员出具结论：逐项展示现场证据
  const { entry, report } = b.concludeReview("sc-1", {
    reviewerId: "inspector-b",
    items: [
      { item_id: "item-safety", requirement: "重大隐患闭环" },
      { item_id: "item-service", requirement: "投诉办结" },
      { item_id: "item-newbiz", requirement: "新业态改善经营" },
    ],
    outcome: "further_downgraded",
    at: "2026-08-01T00:00:00Z",
  });
  assert.equal(entry.category, "review_conclusion");
  assert.match(report, /继续降级/);
  assert.match(report, /item-safety.*pass/);
  assert.match(report, /item-service.*fail|item-service.*pending/);
  assert.match(report, /item-newbiz/);

  // 继续降级须公告后方可生效
  assert.throws(
    () => b.advance(proc.id, "further_downgraded", { actor: "复核员", artifacts: { review_conclusion: entry.id } }),
    /缺少要件: announcement_record/,
  );
  b.advance(proc.id, "further_downgraded", {
    actor: "复核员",
    artifacts: { review_conclusion: entry.id, announcement_record: "a-2026-081" },
  });
  assert.equal(proc.state, "further_downgraded");

  // 指标沿革可追溯原值与来源
  const history = b.metricHistory("operation_data", "sc-1", "visitor_volume");
  assert.equal(history[0].value, 120000);
  assert.equal(history[1].correction.original_source, "景区自报");
});

test("主动申请退出流程经公告与资产交割后注销", async () => {
  const b = await makeBackend();
  const proc = b.startProcess("voluntary_exit", "sc-2");
  b.advance(proc.id, "materials_review", { actor: "受理员", artifacts: { application_form: "f-1" } });
  b.advance(proc.id, "announced", { actor: "公告员", artifacts: { announcement_record: "a-1" } });
  b.advance(proc.id, "asset_handover", { actor: "资产员", artifacts: { asset_inventory: "i-1" } });
  b.advance(proc.id, "deregistered", { actor: "资产员", artifacts: { handover_receipt: "r-1" } });
  assert.equal(proc.state, "deregistered");
});

test("行政摘牌流程：立案、调查、听证、决定、公告、摘牌", async () => {
  const b = await makeBackend();
  const proc = b.startProcess("administrative_delisting", "sc-3");
  b.advance(proc.id, "investigation", { actor: "执法人员", artifacts: { case_file: "c-1" } });
  b.advance(proc.id, "hearing", { actor: "执法人员", artifacts: { investigation_report: "r-1" } });
  b.advance(proc.id, "decided", { actor: "听证员", artifacts: { hearing_record: "h-1" } });
  b.advance(proc.id, "announced", { actor: "公告员", artifacts: { announcement_record: "a-1" } });
  b.advance(proc.id, "delisted", { actor: "执法人员", artifacts: { delisting_notice: "n-1" } });
  assert.equal(proc.state, "delisted");
});
