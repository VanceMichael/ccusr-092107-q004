// 景区动态退出与资产盘活后台门面：把分账台账、可执行规则、
// 三条退出流程与版本化政策接线为一个可执行的后台。

import { createLedgers } from "./ledger.js";
import { correctMetric, metricHistory } from "./corrections.js";
import { evaluateScenic } from "./rules.js";
import { ProcessInstance } from "./workflows.js";
import {
  POLICY_KINDS,
  VersionedPolicy,
  assertOpeningAllowed,
  assertBudgetAvailable,
  assertReviewerEligible,
  assertAnnounced,
} from "./policy.js";
import { buildEvidenceChain, renderEvidenceReport } from "./evidence.js";

export class ScenicExitBackend {
  constructor({ rules = [] } = {}) {
    this.ledgers = createLedgers();
    this.policies = Object.fromEntries(POLICY_KINDS.map((k) => [k, new VersionedPolicy(k)]));
    this.rules = rules;
    this.processes = new Map();
  }

  // 七类资料分账留存。
  record(category, entry) {
    const ledger = this.ledgers[category];
    if (!ledger) {
      throw new Error(`未知台账类别: ${category}`);
    }
    return ledger.append(entry);
  }

  // 指标更正：展示原值与来源。
  correctMetric(category, entryId, correction) {
    return correctMetric(this.ledgers[category], entryId, correction);
  }

  metricHistory(category, scenicId, metric) {
    return metricHistory(this.ledgers[category], scenicId, metric);
  }

  // 执行规则，得到该景区当前触发的发现项。
  evaluate(scenicId) {
    return evaluateScenic(this.rules, { ledgers: this.ledgers, scenicId });
  }

  // 发布政策版本（开放范围 / 预算占用 / 复核回避 / 公众公告）。
  publishPolicy(kind, version) {
    return this.policies[kind].publish(version);
  }

  // 整改期开放区域，须符合生效版本允许清单。
  openAreaDuringRectification(scenicId, area, at) {
    const versionNo = assertOpeningAllowed(this.policies.opening_scope, area, at);
    return { scenic_id: scenicId, area, policy_version: versionNo };
  }

  // 登记整改投资，占用预算不得超过生效版本上限。
  recordInvestment(scenicId, { amount, project, source, at }) {
    const budget = assertBudgetAvailable(
      this.policies.budget_occupancy,
      this.ledgers.rectification_investment,
      scenicId,
      amount,
      at,
    );
    const entry = this.record("rectification_investment", {
      scenicId,
      kind: "investment",
      payload: { project, amount },
      source,
      at,
    });
    return { entry, budget };
  }

  startProcess(type, scenicId, opts) {
    const proc = new ProcessInstance(type, scenicId, opts);
    this.processes.set(proc.id, proc);
    return proc;
  }

  // 流程流转：除状态机与要件校验外，公告类流转还校验公众公告政策已发布。
  advance(processId, to, { actor, at, artifacts = {}, note } = {}) {
    const proc = this.processes.get(processId);
    if (!proc) {
      throw new Error(`流程不存在: ${processId}`);
    }
    if ("announcement_record" in artifacts) {
      assertAnnounced(this.policies.public_announcement, artifacts.announcement_record, at);
    }
    return proc.transition(to, { actor, at, artifacts, note });
  }

  // 复核结论：复核人员回避校验 + 逐项现场证据链 + 结论入复核台账。
  concludeReview(scenicId, { reviewerId, items, outcome, at }) {
    const recusalVersion = assertReviewerEligible(
      this.policies.review_recusal,
      this.ledgers.inspection,
      scenicId,
      reviewerId,
      at,
    );
    const chain = buildEvidenceChain(this.ledgers, scenicId, items);
    const entry = this.record("review_conclusion", {
      scenicId,
      kind: "review",
      payload: {
        reviewer: reviewerId,
        outcome,
        recusal_policy_version: recusalVersion,
        items: chain.map((i) => ({
          item_id: i.item_id,
          status: i.status,
          evidence_ids: i.evidences.map((e) => e.id),
        })),
      },
      source: `reviewer:${reviewerId}`,
      at,
    });
    return { entry, chain, report: renderEvidenceReport(chain, outcome) };
  }
}
