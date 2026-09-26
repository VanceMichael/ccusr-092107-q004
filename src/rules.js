// 可执行规则：由项目中的景区与检查样例扩展而来。
// 每条规则接收景区档案（buildDossier 的结果），命中时返回
// 事实发现（含台账条目引用），供复牌评审与降级评估直接使用。

const DAY_MS = 24 * 60 * 60 * 1000;

// 游客反馈答复时限（天），超期未答复视为服务弱化。
export const FEEDBACK_REPLY_DAYS = 15;

function finding(rule, message, refs) {
  return { ruleId: rule.id, title: rule.title, severity: rule.severity, message, refs };
}

export const RULES = Object.freeze([
  {
    id: "R1",
    title: "服务投诉未办结不得复牌",
    severity: "blocker",
    evaluate(dossier) {
      const open = dossier.feedback.filter(
        (e) => e.payload?.category === "投诉" && e.payload?.status !== "resolved",
      );
      if (open.length === 0) return null;
      return finding(this, `仍有 ${open.length} 件游客投诉未办结`, open.map((e) => e.id));
    },
  },
  {
    id: "R2",
    title: "设施风险未闭环",
    severity: "blocker",
    evaluate(dossier) {
      const open = dossier.facilityRisks.filter((e) => e.payload?.status !== "closed");
      if (open.length === 0) return null;
      const serious = open.some((e) => e.payload?.riskLevel !== "低");
      return finding(
        { ...this, severity: serious ? "blocker" : "warning" },
        `设施风险未闭环 ${open.length} 项（如：${open[0].payload.issue}）`,
        open.map((e) => e.id),
      );
    },
  },
  {
    id: "R3",
    title: "客流指标更正核查",
    severity: "warning",
    evaluate(dossier) {
      const cuts = dossier.operations.filter(
        (e) =>
          e.payload?.kind === "correction" &&
          typeof e.payload.originalValue === "number" &&
          e.payload.originalValue > e.payload.value,
      );
      if (cuts.length === 0) return null;
      return finding(
        this,
        `运营指标存在 ${cuts.length} 次下修更正，须结合更正链核查数据真实性`,
        cuts.map((e) => e.id),
      );
    },
  },
  {
    id: "R4",
    title: "新业态经营改善佐证不足",
    severity: "warning",
    evaluate(dossier) {
      const activities = dossier.operations.filter((e) => e.payload?.kind === "activity");
      const unsupported = activities.filter((activity) => {
        const activityId = activity.payload.activityId;
        const hasInvestment = dossier.investments.some((i) => i.payload?.activityRef === activityId);
        const hasRevenue = dossier.operations.some(
          (e) => e.payload?.kind === "metric" && e.payload?.activityRef === activityId,
        );
        return !hasInvestment || !hasRevenue;
      });
      if (unsupported.length === 0) return null;
      const names = unsupported.map((e) => e.payload.name).join("、");
      return finding(
        this,
        `新业态活动缺少投资或收入佐证：${names}，其经营改善主张不计入评审依据`,
        unsupported.map((e) => e.id),
      );
    },
  },
  {
    id: "R5",
    title: "整改期届满未复核",
    severity: "blocker",
    evaluate(dossier, now) {
      const withDeadline = dossier.conclusions
        .filter((e) => e.payload?.rectificationDeadline)
        .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
      const last = withDeadline[withDeadline.length - 1];
      if (!last || now <= last.payload.rectificationDeadline) return null;
      const reviewedAfter = dossier.conclusions.some(
        (e) => e.recordedAt > last.payload.rectificationDeadline,
      );
      if (reviewedAfter) return null;
      return finding(
        this,
        `整改期已于 ${last.payload.rectificationDeadline} 届满，未见复核结论`,
        [last.id],
      );
    },
  },
  {
    id: "R6",
    title: "游客反馈超期未答复",
    severity: "warning",
    evaluate(dossier, now) {
      const overdue = dossier.feedback.filter((e) => {
        if (e.payload?.status !== "open") return false;
        const ageDays = (Date.parse(now) - Date.parse(e.recordedAt)) / DAY_MS;
        return ageDays > FEEDBACK_REPLY_DAYS;
      });
      if (overdue.length === 0) return null;
      return finding(
        this,
        `${overdue.length} 件游客反馈超过 ${FEEDBACK_REPLY_DAYS} 天未答复`,
        overdue.map((e) => e.id),
      );
    },
  },
]);

// 逐条执行规则，阻断项排在前面。
export function evaluateRules(dossier, { now }) {
  if (!now) {
    throw new Error("规则评估需要评审日期 now");
  }
  return RULES.map((rule) => rule.evaluate(dossier, now))
    .filter(Boolean)
    .sort((a, b) => {
      if (a.severity === b.severity) return 0;
      return a.severity === "blocker" ? -1 : 1;
    });
}
