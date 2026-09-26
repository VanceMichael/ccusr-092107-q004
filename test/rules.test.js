import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createLedgers } from "../src/ledger.js";
import { evaluateRule, evaluateScenic, matchWhere } from "../src/rules.js";


test("where 匹配支持点路径与比较符", () => {
  const entry = { kind: "complaint", payload: { status: "open", age_days: 45 } };
  assert.ok(matchWhere(entry, { kind: "complaint", "payload.age_days": { gte: 30 } }));
  assert.ok(!matchWhere(entry, { "payload.age_days": { lt: 30 } }));
  assert.ok(matchWhere(entry, { "payload.status": { in: ["open", "pending"] } }));
});

test("规则样例可执行：未闭环重大隐患触发降级发现项", async () => {
  const rules = JSON.parse(await readFile(new URL("../fixtures/rules.json", import.meta.url), "utf8"));
  const ledgers = createLedgers();
  ledgers.facility_risk.append({
    scenicId: "sc-1",
    kind: "hazard",
    payload: { severity: "major", status: "open" },
    source: "明查记录",
  });
  const findings = evaluateScenic(rules, { ledgers, scenicId: "sc-1" });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].finding.code, "FACILITY_MAJOR_OPEN");
  assert.equal(findings[0].finding.action, "downgrade");
});

test("数据更正记录触发数据造假线索", async () => {
  const rules = JSON.parse(await readFile(new URL("../fixtures/rules.json", import.meta.url), "utf8"));
  const ledgers = createLedgers();
  ledgers.operation_data.append({
    scenicId: "sc-1",
    kind: "metric",
    payload: {
      metric: "visitor_volume",
      value: 86000,
      correction: { original_value: 120000, original_source: "景区自报" },
    },
    source: "第三方审计",
  });
  const result = evaluateRule(
    rules.find((r) => r.id === "rule-data-integrity"),
    { ledgers, scenicId: "sc-1" },
  );
  assert.ok(result.triggered);
  assert.equal(result.matched_count, 1);
});

test("被更正条目不再计入规则匹配", async () => {
  const rules = JSON.parse(await readFile(new URL("../fixtures/rules.json", import.meta.url), "utf8"));
  const ledgers = createLedgers();
  const e1 = ledgers.operation_data.append({
    scenicId: "sc-1",
    kind: "metric",
    payload: { metric: "new_business_revenue", value: -5000 },
    source: "景区自报",
  });
  ledgers.operation_data.append({
    scenicId: "sc-1",
    kind: "metric",
    payload: { metric: "new_business_revenue", value: 3000 },
    source: "第三方审计",
    supersedes: e1.id,
  });
  const result = evaluateRule(
    rules.find((r) => r.id === "rule-new-business-no-gain"),
    { ledgers, scenicId: "sc-1" },
  );
  assert.ok(!result.triggered);
});
