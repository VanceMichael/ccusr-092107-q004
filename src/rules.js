// 可执行规则：由景区与检查样例扩展而来，以数据形式描述，可继续新增。
// 规则针对某类台账的最新有效条目做匹配，命中数量达到阈值即触发发现项。

const OPS = {
  eq: (a, b) => a === b,
  ne: (a, b) => a !== b,
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  in: (a, b) => Array.isArray(b) && b.includes(a),
  contains: (a, b) => Array.isArray(a) && a.includes(b),
  exists: (a, b) => (b ? a !== undefined && a !== null : a === undefined || a === null),
};

function getPath(obj, path) {
  return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function compare(count, condition) {
  return Object.entries(condition).every(([op, v]) => {
    const fn = OPS[op];
    if (!fn) throw new Error(`未知比较符: ${op}`);
    return fn(count, v);
  });
}

export function matchWhere(entry, where = {}) {
  return Object.entries(where).every(([path, expect]) => {
    const actual = getPath(entry, path);
    if (expect && typeof expect === "object" && !Array.isArray(expect)) {
      return Object.entries(expect).every(([op, v]) => {
        const fn = OPS[op];
        if (!fn) throw new Error(`未知比较符: ${op}`);
        return fn(actual, v);
      });
    }
    return actual === expect;
  });
}

export function evaluateRule(rule, { ledgers, scenicId }) {
  const ledger = ledgers[rule.category];
  if (!ledger) {
    throw new Error(`规则 ${rule.id} 引用了未知台账类别: ${rule.category}`);
  }
  const matched = ledger.current(scenicId).filter((e) => matchWhere(e, rule.where ?? {}));
  const triggered = compare(matched.length, rule.count ?? { gte: 1 });
  return {
    rule_id: rule.id,
    name: rule.name,
    triggered,
    matched_count: matched.length,
    matched_entry_ids: matched.map((m) => m.id),
    finding: triggered ? rule.finding : null,
  };
}

// 对单个景区执行全部规则，返回触发的发现项。
export function evaluateScenic(rules, ctx) {
  return rules.map((r) => evaluateRule(r, ctx)).filter((r) => r.triggered);
}
