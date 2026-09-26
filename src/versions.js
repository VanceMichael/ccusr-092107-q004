// 版本控制：整改期开放范围、预算占用、复核回避、公众公告
// 均以版本形式发布，只增不改，可按时间点查询生效版本。

export const POLICY_TYPES = Object.freeze([
  "rectification_opening_scope",
  "budget_occupation",
  "review_recusal",
  "public_announcement",
]);

const PAYLOAD_RULES = {
  rectification_opening_scope(payload) {
    if (!["closed", "partial", "full"].includes(payload?.mode)) {
      return "开放范围 mode 须为 closed / partial / full";
    }
    if (payload.mode === "partial" && (!Array.isArray(payload.areas) || payload.areas.length === 0)) {
      return "部分开放须列明开放区域 areas";
    }
    return null;
  },
  budget_occupation(payload) {
    if (!(typeof payload?.amount === "number" && payload.amount > 0)) {
      return "预算占用金额 amount 须为正数";
    }
    if (!payload?.purpose || !payload?.budgetLine) {
      return "预算占用须注明用途 purpose 与预算科目 budgetLine";
    }
    return null;
  },
  review_recusal(payload) {
    if (!Array.isArray(payload?.recused) || payload.recused.length === 0) {
      return "回避名单 recused 不得为空";
    }
    if (!payload?.reason) {
      return "须注明回避原因 reason";
    }
    return null;
  },
  public_announcement(payload) {
    if (!payload?.title || !payload?.body || !payload?.channel) {
      return "公众公告须含 title、body 与 channel";
    }
    return null;
  },
};

export function createPolicyBook() {
  return { policies: [] };
}

// 发布新政策版本。版本号按（类型, 景区）递增，生效时间不得早于上一版本。
export function publishPolicy(book, { type, scenicId, payload, effectiveFrom, publishedBy, publishedAt }) {
  if (!POLICY_TYPES.includes(type)) {
    throw new Error(`未知政策类型: ${type}`);
  }
  for (const [field, value] of Object.entries({ scenicId, effectiveFrom, publishedBy, publishedAt })) {
    if (!value) {
      throw new Error(`政策版本缺少必要字段: ${field}`);
    }
  }
  const invalid = PAYLOAD_RULES[type](payload);
  if (invalid) {
    throw new Error(`政策内容不合法: ${invalid}`);
  }
  const versions = book.policies.filter((p) => p.type === type && p.scenicId === scenicId);
  const previous = versions[versions.length - 1] ?? null;
  if (previous && effectiveFrom < previous.effectiveFrom) {
    throw new Error(`生效时间 ${effectiveFrom} 不得早于上一版本 ${previous.effectiveFrom}`);
  }
  const record = Object.freeze({
    type,
    scenicId,
    version: versions.length + 1,
    payload: Object.freeze({ ...payload }),
    effectiveFrom,
    publishedBy,
    publishedAt,
    supersedes: previous ? previous.version : null,
  });
  book.policies.push(record);
  return record;
}

// 查询某时间点生效的版本；无生效版本时返回 null。
export function policyAt(book, type, scenicId, at) {
  const candidates = book.policies
    .filter((p) => p.type === type && p.scenicId === scenicId && p.effectiveFrom <= at)
    .sort((a, b) => a.version - b.version);
  return candidates[candidates.length - 1] ?? null;
}

// 完整版本沿革，便于审计与公告回溯。
export function policyHistory(book, type, scenicId) {
  return book.policies
    .filter((p) => p.type === type && p.scenicId === scenicId)
    .slice()
    .sort((a, b) => a.version - b.version);
}
