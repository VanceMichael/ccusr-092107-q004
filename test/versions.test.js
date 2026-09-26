import test from "node:test";
import assert from "node:assert/strict";

import {
  createPolicyBook,
  publishPolicy,
  policyAt,
  policyHistory,
} from "../src/versions.js";


const META = { publishedBy: "市场管理处", publishedAt: "2026-03-20" };

test("政策按版本发布，按时间点查询生效版本", () => {
  const book = createPolicyBook();
  const v1 = publishPolicy(book, {
    type: "rectification_opening_scope",
    scenicId: "JQ-001",
    payload: { mode: "closed", areas: [] },
    effectiveFrom: "2026-03-20",
    ...META,
  });
  const v2 = publishPolicy(book, {
    type: "rectification_opening_scope",
    scenicId: "JQ-001",
    payload: { mode: "partial", areas: ["索道站"] },
    effectiveFrom: "2026-06-01",
    publishedBy: "市场管理处",
    publishedAt: "2026-05-28",
  });
  assert.equal(v1.version, 1);
  assert.equal(v2.version, 2);
  assert.equal(v2.supersedes, 1);

  assert.equal(policyAt(book, "rectification_opening_scope", "JQ-001", "2026-03-01"), null);
  assert.equal(policyAt(book, "rectification_opening_scope", "JQ-001", "2026-05-01").version, 1);
  assert.equal(policyAt(book, "rectification_opening_scope", "JQ-001", "2026-06-01").version, 2);
  assert.equal(policyAt(book, "rectification_opening_scope", "JQ-001", "2026-06-01").payload.mode, "partial");
});

test("版本沿革完整且不同类型、不同景区各自编号", () => {
  const book = createPolicyBook();
  publishPolicy(book, { type: "rectification_opening_scope", scenicId: "JQ-001", payload: { mode: "closed", areas: [] }, effectiveFrom: "2026-03-20", ...META });
  const other = publishPolicy(book, { type: "review_recusal", scenicId: "JQ-001", payload: { recused: ["评审员-甲"], reason: "参与过初评" }, effectiveFrom: "2026-08-01", publishedBy: "复核评审组", publishedAt: "2026-08-01" });
  assert.equal(other.version, 1);
  assert.equal(policyHistory(book, "rectification_opening_scope", "JQ-001").length, 1);
  assert.equal(policyHistory(book, "rectification_opening_scope", "JQ-002").length, 0);
});

test("政策内容按类型校验", () => {
  const book = createPolicyBook();
  assert.throws(
    () => publishPolicy(book, { type: "rectification_opening_scope", scenicId: "JQ-001", payload: { mode: "partial", areas: [] }, effectiveFrom: "2026-03-20", ...META }),
    /开放区域/,
  );
  assert.throws(
    () => publishPolicy(book, { type: "budget_occupation", scenicId: "JQ-001", payload: { amount: -5, purpose: "整改", budgetLine: "专项" }, effectiveFrom: "2026-03-20", ...META }),
    /正数/,
  );
  assert.throws(
    () => publishPolicy(book, { type: "review_recusal", scenicId: "JQ-001", payload: { recused: [], reason: "x" }, effectiveFrom: "2026-03-20", ...META }),
    /回避名单/,
  );
  assert.throws(
    () => publishPolicy(book, { type: "public_announcement", scenicId: "JQ-001", payload: { title: "t" }, effectiveFrom: "2026-03-20", ...META }),
    /公告/,
  );
  assert.throws(
    () => publishPolicy(book, { type: "unknown", scenicId: "JQ-001", payload: {}, effectiveFrom: "2026-03-20", ...META }),
    /未知政策类型/,
  );
});

test("新版本生效时间不得早于上一版本", () => {
  const book = createPolicyBook();
  publishPolicy(book, { type: "rectification_opening_scope", scenicId: "JQ-001", payload: { mode: "closed", areas: [] }, effectiveFrom: "2026-06-01", ...META });
  assert.throws(
    () => publishPolicy(book, { type: "rectification_opening_scope", scenicId: "JQ-001", payload: { mode: "full", areas: [] }, effectiveFrom: "2026-05-01", ...META }),
    /不得早于上一版本/,
  );
});
