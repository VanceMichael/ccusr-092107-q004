// 现场证据链：恢复评级或继续降级时，按整改事项逐项展示现场证据。
// 证据来自各类台账中标记了 evidence_of 的当前有效条目。

import { LEDGER_CATEGORIES } from "./ledger.js";

export function buildEvidenceChain(ledgers, scenicId, items) {
  const pool = LEDGER_CATEGORIES.flatMap((c) => ledgers[c].current(scenicId));
  return items.map((item) => {
    const evidences = pool.filter((e) => e.payload?.evidence_of === item.item_id);
    const status = evidences.some((e) => e.payload.result === "fail")
      ? "fail"
      : evidences.some((e) => e.payload.result === "pass")
        ? "pass"
        : "pending";
    return { ...item, status, evidences };
  });
}

const DECISION_LABELS = {
  restored: "恢复评级",
  maintained: "维持现等级",
  further_downgraded: "继续降级",
  delisted: "摘牌",
};

export function renderEvidenceReport(chain, decision) {
  const lines = [`复核结论：${DECISION_LABELS[decision] ?? decision}`, ""];
  for (const item of chain) {
    lines.push(`事项 ${item.item_id}：${item.requirement} —— ${item.status}`);
    if (item.evidences.length === 0) {
      lines.push("  （无现场证据）");
    }
    for (const e of item.evidences) {
      const result = e.payload.result ?? "记录";
      lines.push(`  [${e.category}] ${e.kind} —— ${result} —— 来源 ${e.source} —— ${e.at}`);
    }
  }
  return lines.join("\n");
}
