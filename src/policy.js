// 版本化政策：整改期开放范围、预算占用、复核回避、公众公告均按版本留存，
// 任何时点都能追溯到当时生效的版本。

export const POLICY_KINDS = Object.freeze([
  "opening_scope",
  "budget_occupancy",
  "review_recusal",
  "public_announcement",
]);

export class VersionedPolicy {
  constructor(kind) {
    if (!POLICY_KINDS.includes(kind)) {
      throw new Error(`未知政策类别: ${kind}`);
    }
    this.kind = kind;
    this.versions = [];
  }

  publish({ rules, effectiveAt, publishedBy }) {
    if (!rules || !publishedBy) {
      throw new Error("政策版本必须包含规则内容与发布人");
    }
    const version = {
      version_no: this.versions.length + 1,
      kind: this.kind,
      rules,
      effective_at: effectiveAt ?? new Date().toISOString(),
      published_by: publishedBy,
    };
    this.versions.push(version);
    return version;
  }

  // 指定时点生效的版本；缺省取最新版本。
  active(at) {
    const eligible = at ? this.versions.filter((v) => v.effective_at <= at) : this.versions;
    return eligible.length > 0 ? eligible[eligible.length - 1] : null;
  }
}

// 整改期开放范围：拟开放区域必须在生效版本的允许清单内。
export function assertOpeningAllowed(policy, area, at) {
  const v = policy.active(at);
  if (!v) {
    throw new Error("整改期开放范围政策尚未发布");
  }
  const allowed = v.rules.allowed_areas ?? [];
  if (!allowed.includes(area)) {
    throw new Error(`整改期未获批准开放的区域: ${area}（政策版本 v${v.version_no}）`);
  }
  return v.version_no;
}

// 预算占用：整改投资累计不得超过生效版本的上限。
export function assertBudgetAvailable(policy, investmentLedger, scenicId, amount, at) {
  const v = policy.active(at);
  if (!v) {
    throw new Error("预算占用政策尚未发布");
  }
  const cap = v.rules.cap;
  const used = investmentLedger
    .current(scenicId)
    .filter((e) => e.kind === "investment")
    .reduce((sum, e) => sum + (e.payload.amount ?? 0), 0);
  if (used + amount > cap) {
    throw new Error(
      `超出整改预算占用上限: 已占用 ${used}，拟新增 ${amount}，上限 ${cap}（政策版本 v${v.version_no}）`,
    );
  }
  return { used, cap, version_no: v.version_no };
}

// 复核回避：复核人员不得曾参与同一景区的明查暗访。
export function assertReviewerEligible(policy, inspectionLedger, scenicId, reviewerId, at) {
  const v = policy.active(at);
  if (!v) {
    throw new Error("复核回避政策尚未发布");
  }
  const priorInspectors = inspectionLedger
    .forScenic(scenicId)
    .flatMap((e) => e.payload.inspectors ?? []);
  if (priorInspectors.includes(reviewerId)) {
    throw new Error(`复核人员须回避: ${reviewerId} 曾参与该景区检查（政策版本 v${v.version_no}）`);
  }
  return v.version_no;
}

// 公众公告：决定生效前必须已有公告记录，且公告政策已发布。
export function assertAnnounced(policy, announcementRecord, at) {
  const v = policy.active(at);
  if (!v) {
    throw new Error("公众公告政策尚未发布");
  }
  if (!announcementRecord) {
    throw new Error(`公众公告缺失（政策版本 v${v.version_no} 要求决定前公告）`);
  }
  return v.version_no;
}
