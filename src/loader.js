// 从 JSON 文档载入台账、政策版本与现场证据（用于示例与测试）。
import { appendEntry, LEDGER_TYPES } from "./ledgers.js";
import { publishPolicy } from "./versions.js";
import { addEvidence } from "./evidence.js";

export function loadLedgers(ledgers, doc) {
  for (const type of LEDGER_TYPES) {
    for (const entry of doc[type] ?? []) {
      appendEntry(ledgers, type, entry);
    }
  }
  return ledgers;
}

export function loadPolicies(book, doc) {
  for (const policy of doc.policies ?? []) {
    publishPolicy(book, policy);
  }
  return book;
}

export function loadEvidence(book, doc) {
  for (const item of doc.evidence ?? []) {
    addEvidence(book, item);
  }
  return book;
}
