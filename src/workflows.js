// 三类退出流程：主动申请退出、行政摘牌、降级，各自独立的状态机。
// 每次流转记录经办人、时间与随附要件；缺少要件不得流转。

export const PROCESSES = {
  voluntary_exit: {
    label: "主动申请退出",
    initial: "applied",
    transitions: {
      applied: ["materials_review", "withdrawn"],
      materials_review: ["announced", "applied"],
      announced: ["asset_handover"],
      asset_handover: ["deregistered"],
      deregistered: [],
      withdrawn: [],
    },
    requires: {
      materials_review: ["application_form"],
      announced: ["announcement_record"],
      asset_handover: ["asset_inventory"],
      deregistered: ["handover_receipt"],
    },
  },
  administrative_delisting: {
    label: "行政摘牌",
    initial: "filed",
    transitions: {
      filed: ["investigation"],
      investigation: ["hearing"],
      hearing: ["decided"],
      decided: ["announced"],
      announced: ["delisted"],
      delisted: [],
    },
    requires: {
      investigation: ["case_file"],
      hearing: ["investigation_report"],
      decided: ["hearing_record"],
      announced: ["announcement_record"],
      delisted: ["delisting_notice"],
    },
  },
  downgrade: {
    label: "降级",
    initial: "triggered",
    transitions: {
      triggered: ["rectification_ordered"],
      rectification_ordered: ["rectifying"],
      rectifying: ["review"],
      review: ["restored", "maintained", "further_downgraded", "delisted"],
      restored: [],
      maintained: ["rectifying"],
      further_downgraded: [],
      delisted: [],
    },
    requires: {
      rectification_ordered: ["rule_findings"],
      rectifying: ["rectification_order"],
      review: ["evidence_chain"],
      restored: ["review_conclusion"],
      maintained: ["review_conclusion"],
      further_downgraded: ["review_conclusion", "announcement_record"],
      delisted: ["review_conclusion", "announcement_record"],
    },
  },
};

let counter = 0;

export class ProcessInstance {
  constructor(type, scenicId, { at } = {}) {
    const def = PROCESSES[type];
    if (!def) {
      throw new Error(`未知退出流程: ${type}`);
    }
    if (!scenicId) {
      throw new Error("流程必须关联景区");
    }
    counter += 1;
    this.id = `proc-${type}-${counter}`;
    this.type = type;
    this.scenic_id = scenicId;
    this.state = def.initial;
    this.created_at = at ?? new Date().toISOString();
    this.history = [];
  }

  transition(to, { actor, at, artifacts = {}, note } = {}) {
    const def = PROCESSES[this.type];
    const allowed = def.transitions[this.state] ?? [];
    if (!allowed.includes(to)) {
      throw new Error(`流程 ${this.id} 不允许从 ${this.state} 流转到 ${to}`);
    }
    if (!actor) {
      throw new Error("流程流转必须记录经办人");
    }
    const missing = (def.requires[to] ?? []).filter((k) => !(k in artifacts));
    if (missing.length > 0) {
      throw new Error(`流转到 ${to} 缺少要件: ${missing.join(", ")}`);
    }
    this.history.push({
      from: this.state,
      to,
      actor,
      at: at ?? new Date().toISOString(),
      note: note ?? null,
      artifacts: Object.keys(artifacts),
    });
    this.state = to;
    return this.state;
  }
}
