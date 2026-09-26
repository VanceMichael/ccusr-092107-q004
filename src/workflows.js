// 三类退出流程：主动申请退出、行政摘牌、降级。
// 各自独立的状态机；部分节点设有守卫，须存在已生效的
// 政策版本（见 versions.js）方可推进，保证公告与开放范围受版本控制。
import { policyAt } from "./versions.js";

export const EXIT_WORKFLOWS = Object.freeze({
  voluntary_exit: {
    title: "主动申请退出",
    initial: "applied",
    transitions: {
      applied: { accept: "accepted", reject: "closed" },
      accepted: { complete_asset_inventory: "assets_inventoried" },
      assets_inventoried: { publish_notice: "announced" },
      announced: { take_effect: "exited" },
    },
    terminal: ["exited", "closed"],
  },
  administrative_delisting: {
    title: "行政摘牌",
    initial: "case_filed",
    transitions: {
      case_filed: { collect_evidence: "evidence_collected" },
      evidence_collected: { serve_notice: "notified" },
      notified: { hold_hearing: "heard", waive_hearing: "decided" },
      heard: { decide: "decided" },
      decided: { publish_notice: "announced" },
      announced: { take_effect: "delisted" },
    },
    terminal: ["delisted"],
  },
  downgrade: {
    title: "降级",
    initial: "triggered",
    transitions: {
      triggered: { issue_rectification_notice: "rectifying" },
      rectifying: { apply_re_review: "under_re_review" },
      under_re_review: {
        restore: "restored",
        hold: "rectifying",
        further_downgrade: "triggered",
        delist: "delisted",
      },
    },
    terminal: ["restored", "delisted"],
  },
});

function requireActivePolicy(context, type, scenicId, at, label) {
  const active = context?.policyBook ? policyAt(context.policyBook, type, scenicId, at) : null;
  if (!active) {
    throw new Error(`推进前须存在已生效的${label}版本（景区 ${scenicId}）`);
  }
  return active;
}

const GUARDS = {
  "voluntary_exit:publish_notice": (caseRecord, context, at) =>
    requireActivePolicy(context, "public_announcement", caseRecord.scenicId, at, "公众公告"),
  "administrative_delisting:publish_notice": (caseRecord, context, at) =>
    requireActivePolicy(context, "public_announcement", caseRecord.scenicId, at, "公众公告"),
  "downgrade:apply_re_review": (caseRecord, context, at) =>
    requireActivePolicy(context, "rectification_opening_scope", caseRecord.scenicId, at, "整改期开放范围"),
};

export function createCase({ caseId, workflow, scenicId, openedAt, openedBy }) {
  const definition = EXIT_WORKFLOWS[workflow];
  if (!definition) {
    throw new Error(`未知退出流程: ${workflow}`);
  }
  if (!caseId || !scenicId) {
    throw new Error("流程案件须含 caseId 与 scenicId");
  }
  return {
    caseId,
    workflow,
    scenicId,
    state: definition.initial,
    openedAt: openedAt ?? null,
    openedBy: openedBy ?? null,
    history: [],
  };
}

// 推进流程：校验状态迁移与守卫，返回包含新履历的案件副本。
export function advance(caseRecord, event, meta = {}, context = {}) {
  const definition = EXIT_WORKFLOWS[caseRecord.workflow];
  const next = definition.transitions[caseRecord.state]?.[event];
  if (!next) {
    throw new Error(`流程「${definition.title}」状态 ${caseRecord.state} 不接受事件 ${event}`);
  }
  const guard = GUARDS[`${caseRecord.workflow}:${event}`];
  if (guard) {
    guard(caseRecord, context, meta.at);
  }
  const step = {
    event,
    from: caseRecord.state,
    to: next,
    at: meta.at ?? null,
    by: meta.by ?? null,
    note: meta.note ?? "",
    evidenceRefs: meta.evidenceRefs ?? [],
  };
  return { ...caseRecord, state: next, history: [...caseRecord.history, step] };
}

export function availableEvents(caseRecord) {
  const definition = EXIT_WORKFLOWS[caseRecord.workflow];
  return Object.keys(definition.transitions[caseRecord.state] ?? {});
}

export function isTerminal(caseRecord) {
  return EXIT_WORKFLOWS[caseRecord.workflow].terminal.includes(caseRecord.state);
}
