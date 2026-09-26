import test from "node:test";
import assert from "node:assert/strict";

import { createLedgers } from "../src/ledger.js";
import {
  VersionedPolicy,
  assertOpeningAllowed,
  assertBudgetAvailable,
  assertReviewerEligible,
  assertAnnounced,
} from "../src/policy.js";


test("政策按版本留存，按时点取生效版本", () => {
  const p = new VersionedPolicy("opening_scope");
  p.publish({ rules: { allowed_areas: ["东区"] }, effectiveAt: "2026-01-01T00:00:00Z", publishedBy: "主管部门" });
  p.publish({ rules: { allowed_areas: ["东区", "西区"] }, effectiveAt: "2026-06-01T00:00:00Z", publishedBy: "主管部门" });
  assert.equal(p.active("2026-03-01T00:00:00Z").version_no, 1);
  assert.equal(p.active("2026-07-01T00:00:00Z").version_no, 2);
  assert.equal(p.versions.length, 2);
});

test("整改期开放范围受版本控制", () => {
  const p = new VersionedPolicy("opening_scope");
  p.publish({ rules: { allowed_areas: ["东区"] }, effectiveAt: "2026-01-01T00:00:00Z", publishedBy: "主管部门" });
  assert.equal(assertOpeningAllowed(p, "东区", "2026-02-01T00:00:00Z"), 1);
  assert.throws(() => assertOpeningAllowed(p, "西区", "2026-02-01T00:00:00Z"), /未获批准开放.*v1/);
});

test("预算占用不得超过生效版本上限", () => {
  const p = new VersionedPolicy("budget_occupancy");
  p.publish({ rules: { cap: 1000000 }, effectiveAt: "2026-01-01T00:00:00Z", publishedBy: "主管部门" });
  const ledgers = createLedgers();
  ledgers.rectification_investment.append({
    scenicId: "sc-1",
    kind: "investment",
    payload: { project: "索道检修", amount: 800000 },
    source: "财政专户",
  });
  const ok = assertBudgetAvailable(p, ledgers.rectification_investment, "sc-1", 150000, "2026-02-01T00:00:00Z");
  assert.equal(ok.used, 800000);
  assert.throws(
    () => assertBudgetAvailable(p, ledgers.rectification_investment, "sc-1", 300000, "2026-02-01T00:00:00Z"),
    /超出整改预算占用上限/,
  );
});

test("复核回避：曾参与检查的人员须回避", () => {
  const p = new VersionedPolicy("review_recusal");
  p.publish({ rules: { recuse_prior_inspectors: true }, effectiveAt: "2026-01-01T00:00:00Z", publishedBy: "主管部门" });
  const ledgers = createLedgers();
  ledgers.inspection.append({
    scenicId: "sc-1",
    kind: "covert",
    payload: { inspectors: ["inspector-a"] },
    source: "暗访组",
  });
  assert.throws(
    () => assertReviewerEligible(p, ledgers.inspection, "sc-1", "inspector-a", "2026-02-01T00:00:00Z"),
    /须回避/,
  );
  assert.equal(assertReviewerEligible(p, ledgers.inspection, "sc-1", "inspector-b", "2026-02-01T00:00:00Z"), 1);
});

test("公众公告：决定前必须有公告记录", () => {
  const p = new VersionedPolicy("public_announcement");
  assert.throws(() => assertAnnounced(p, { id: "a-1" }), /尚未发布/);
  p.publish({ rules: { channels: ["官网", "现场公示栏"] }, effectiveAt: "2026-01-01T00:00:00Z", publishedBy: "主管部门" });
  assert.throws(() => assertAnnounced(p, null, "2026-02-01T00:00:00Z"), /公众公告缺失/);
  assert.equal(assertAnnounced(p, { id: "a-1" }, "2026-02-01T00:00:00Z"), 1);
});
