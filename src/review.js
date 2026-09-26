// 复牌评审：汇总规则发现、逐项现场证据、生效政策版本与指标
// 更正链，给出 恢复评级 / 维持 / 继续降级 / 摘牌 的评审结论。
// 复核回避按生效版本执行，回避名单内的评审人不得参与。
import { evaluateRules } from "./rules.js";
import { buildEvidenceReport } from "./evidence.js";
import { policyAt, POLICY_TYPES } from "./versions.js";

// 从明查暗访记录中汇总整改要求项（去重）。
export function requirementsFromInspections(dossier) {
  const seen = new Map();
  for (const inspection of dossier.inspections) {
    for (const item of inspection.payload?.items ?? []) {
      if (!seen.has(item.itemId)) {
        seen.set(item.itemId, { itemId: item.itemId, requirement: item.requirement });
      }
    }
  }
  return [...seen.values()];
}

export function runReview({
  scenicId,
  dossier,
  evidenceBook,
  policyBook,
  requirements,
  reviewerId,
  now,
  lowestLevel = false,
}) {
  const recusal = policyAt(policyBook, "review_recusal", scenicId, now);
  if (recusal?.payload.recused.includes(reviewerId)) {
    throw new Error(
      `评审人 ${reviewerId} 列入回避名单 v${recusal.version}（${recusal.payload.reason}），不得参与本次复核`,
    );
  }

  const items = requirements ?? requirementsFromInspections(dossier);
  const findings = evaluateRules(dossier, { now });
  const blockers = findings.filter((f) => f.severity === "blocker");
  const evidenceReport = buildEvidenceReport(evidenceBook, scenicId, items);
  const uncovered = evidenceReport.filter((item) => !item.covered);

  // 指标更正链随评审一并展示：原值、原来源、更正值、更正来源。
  const corrections = dossier.operations
    .filter((e) => e.payload?.kind === "correction")
    .map((e) => ({
      id: e.id,
      metric: e.payload.metric,
      originalValue: e.payload.originalValue,
      originalSource: e.payload.originalSource,
      value: e.payload.value,
      source: e.source,
      reason: e.payload.reason,
    }));

  const activePolicies = {};
  for (const type of POLICY_TYPES) {
    const policy = policyAt(policyBook, type, scenicId, now);
    if (policy) {
      activePolicies[type] = { version: policy.version, effectiveFrom: policy.effectiveFrom };
    }
  }

  const rationale = [];
  let conclusion;
  const overdue = findings.some((f) => f.ruleId === "R5");
  if (blockers.length > 0) {
    rationale.push(...blockers.map((b) => `阻断项 ${b.ruleId}：${b.message}`));
    if (overdue) {
      conclusion = lowestLevel ? "delist" : "further_downgrade";
      rationale.push(lowestLevel ? "整改期届满且已达最低等级，建议摘牌" : "整改期届满仍有阻断项，建议继续降级");
    } else {
      conclusion = "hold";
      rationale.push("阻断项未消除，维持当前等级并继续整改");
    }
  } else if (uncovered.length > 0) {
    conclusion = "hold";
    rationale.push(`现场证据未覆盖 ${uncovered.length} 个要求项：${uncovered.map((i) => i.itemId).join("、")}`);
  } else {
    conclusion = "restore";
    rationale.push("规则检查无阻断项，现场证据逐项覆盖，建议恢复评级");
  }

  return Object.freeze({
    scenicId,
    reviewerId,
    reviewedAt: now,
    conclusion,
    rationale,
    findings,
    evidenceReport,
    corrections,
    activePolicies,
  });
}
