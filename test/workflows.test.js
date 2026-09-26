import test from "node:test";
import assert from "node:assert/strict";

import { ProcessInstance, PROCESSES } from "../src/workflows.js";


test("三条流程各自独立", () => {
  assert.equal(PROCESSES.voluntary_exit.initial, "applied");
  assert.equal(PROCESSES.administrative_delisting.initial, "filed");
  assert.equal(PROCESSES.downgrade.initial, "triggered");
});

test("主动申请退出全流程", () => {
  const p = new ProcessInstance("voluntary_exit", "sc-1", { at: "2026-07-01T00:00:00Z" });
  p.transition("materials_review", { actor: "受理员", artifacts: { application_form: "f-1" } });
  p.transition("announced", { actor: "公告员", artifacts: { announcement_record: "a-1" } });
  p.transition("asset_handover", { actor: "资产员", artifacts: { asset_inventory: "i-1" } });
  p.transition("deregistered", { actor: "资产员", artifacts: { handover_receipt: "r-1" } });
  assert.equal(p.state, "deregistered");
  assert.equal(p.history.length, 4);
  assert.deepEqual(p.history[0].artifacts, ["application_form"]);
});

test("行政摘牌缺要件不得流转", () => {
  const p = new ProcessInstance("administrative_delisting", "sc-1");
  p.transition("investigation", { actor: "执法人员", artifacts: { case_file: "c-1" } });
  assert.throws(
    () => p.transition("hearing", { actor: "执法人员" }),
    /缺少要件: investigation_report/,
  );
});

test("降级流程：复核结论可恢复、维持、继续降级或摘牌", () => {
  const p = new ProcessInstance("downgrade", "sc-1");
  p.transition("rectification_ordered", { actor: "评审员", artifacts: { rule_findings: ["FACILITY_MAJOR_OPEN"] } });
  p.transition("rectifying", { actor: "评审员", artifacts: { rectification_order: "o-1" } });
  p.transition("review", { actor: "复核员", artifacts: { evidence_chain: "chain-1" } });
  p.transition("further_downgraded", {
    actor: "复核员",
    artifacts: { review_conclusion: "rc-1", announcement_record: "a-1" },
  });
  assert.equal(p.state, "further_downgraded");
});

test("非法流转与缺经办人被拒绝", () => {
  const p = new ProcessInstance("downgrade", "sc-1");
  assert.throws(() => p.transition("restored", { actor: "x" }), /不允许/);
  assert.throws(
    () => p.transition("rectification_ordered", { artifacts: { rule_findings: [] } }),
    /经办人/,
  );
  assert.throws(() => new ProcessInstance("unknown_type", "sc-1"), /未知退出流程/);
});
