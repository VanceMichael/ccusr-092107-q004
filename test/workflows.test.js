import test from "node:test";
import assert from "node:assert/strict";

import { createPolicyBook, publishPolicy } from "../src/versions.js";
import {
  EXIT_WORKFLOWS,
  createCase,
  advance,
  availableEvents,
  isTerminal,
} from "../src/workflows.js";


function announcement(scenicId, effectiveFrom) {
  return {
    type: "public_announcement",
    scenicId,
    payload: { title: "公告", body: "正文", channel: "主管部门官网" },
    effectiveFrom,
    publishedBy: "省文旅厅办公室",
    publishedAt: effectiveFrom,
  };
}

test("三类退出流程各有独立路径", () => {
  assert.deepEqual(Object.keys(EXIT_WORKFLOWS), ["voluntary_exit", "administrative_delisting", "downgrade"]);
  // 主动退出须资产清点，行政摘牌须听证环节，降级含复核与继续降级回路
  assert.ok("complete_asset_inventory" in EXIT_WORKFLOWS.voluntary_exit.transitions.accepted);
  assert.ok("hold_hearing" in EXIT_WORKFLOWS.administrative_delisting.transitions.notified);
  assert.ok("further_downgrade" in EXIT_WORKFLOWS.downgrade.transitions.under_re_review);
});

test("主动申请退出：公告版本齐备方可公示并生效", () => {
  const policyBook = createPolicyBook();
  publishPolicy(policyBook, announcement("JQ-002", "2026-07-01"));

  let flow = createCase({ caseId: "CASE-1", workflow: "voluntary_exit", scenicId: "JQ-002", openedAt: "2026-06-15", openedBy: "景区经营方" });
  assert.deepEqual(availableEvents(flow), ["accept", "reject"]);

  flow = advance(flow, "accept", { at: "2026-06-20", by: "市场管理处" });
  flow = advance(flow, "complete_asset_inventory", { at: "2026-06-28", by: "资产清点组", evidenceRefs: ["ASSET-1"] });
  flow = advance(flow, "publish_notice", { at: "2026-07-02", by: "省文旅厅办公室" }, { policyBook });
  flow = advance(flow, "take_effect", { at: "2026-07-10", by: "省文旅厅" });

  assert.equal(flow.state, "exited");
  assert.ok(isTerminal(flow));
  assert.deepEqual(flow.history.map((s) => s.event), ["accept", "complete_asset_inventory", "publish_notice", "take_effect"]);
});

test("缺少生效公告版本时公示被拦截", () => {
  let flow = createCase({ caseId: "CASE-2", workflow: "voluntary_exit", scenicId: "JQ-002" });
  flow = advance(flow, "accept", { at: "2026-06-20" });
  flow = advance(flow, "complete_asset_inventory", { at: "2026-06-28" });
  assert.throws(
    () => advance(flow, "publish_notice", { at: "2026-07-02" }, { policyBook: createPolicyBook() }),
    /公众公告/,
  );
});

test("行政摘牌：听证与放弃听证两条路径，非法迁移被拒绝", () => {
  const policyBook = createPolicyBook();
  publishPolicy(policyBook, announcement("JQ-003", "2026-06-10"));

  let flow = createCase({ caseId: "CASE-3", workflow: "administrative_delisting", scenicId: "JQ-003" });
  assert.throws(() => advance(flow, "publish_notice", { at: "2026-06-01" }), /不接受事件/);

  flow = advance(flow, "collect_evidence", { at: "2026-05-20", evidenceRefs: ["IN-003", "OD-006"] });
  flow = advance(flow, "serve_notice", { at: "2026-05-25" });
  flow = advance(flow, "hold_hearing", { at: "2026-06-02" });
  flow = advance(flow, "decide", { at: "2026-06-05" });
  flow = advance(flow, "publish_notice", { at: "2026-06-10" }, { policyBook });
  flow = advance(flow, "take_effect", { at: "2026-06-20" });
  assert.equal(flow.state, "delisted");

  let waived = createCase({ caseId: "CASE-4", workflow: "administrative_delisting", scenicId: "JQ-003" });
  waived = advance(waived, "collect_evidence", { at: "2026-05-20" });
  waived = advance(waived, "serve_notice", { at: "2026-05-25" });
  waived = advance(waived, "waive_hearing", { at: "2026-05-30" });
  assert.equal(waived.state, "decided");
});

test("降级流程：复核可恢复、维持或继续降级，申请复核须先有开放范围版本", () => {
  const policyBook = createPolicyBook();
  let flow = createCase({ caseId: "CASE-5", workflow: "downgrade", scenicId: "JQ-001" });
  flow = advance(flow, "issue_rectification_notice", { at: "2026-03-16" });
  assert.throws(
    () => advance(flow, "apply_re_review", { at: "2026-09-01" }, { policyBook }),
    /整改期开放范围/,
  );

  publishPolicy(policyBook, {
    type: "rectification_opening_scope",
    scenicId: "JQ-001",
    payload: { mode: "partial", areas: ["索道站"] },
    effectiveFrom: "2026-06-01",
    publishedBy: "市场管理处",
    publishedAt: "2026-05-28",
  });
  flow = advance(flow, "apply_re_review", { at: "2026-09-01" }, { policyBook });
  assert.equal(flow.state, "under_re_review");

  const restored = advance(flow, "restore", { at: "2026-09-26" });
  assert.ok(isTerminal(restored));

  const held = advance(flow, "hold", { at: "2026-09-26" });
  assert.equal(held.state, "rectifying");

  const further = advance(flow, "further_downgrade", { at: "2026-09-26" });
  assert.equal(further.state, "triggered");
});
