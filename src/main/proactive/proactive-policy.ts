import type {
  ProactiveCandidate,
  ProactiveCommitDecision,
  ProactiveRuntimeSnapshot,
  ProactiveState,
} from "./proactive-types";

export const NORMAL_QUIET_MS = 30 * 60 * 1000;
export const GLOBAL_PROACTIVE_INTERVAL_MS = 2 * 60 * 60 * 1000;
export const FOLLOWUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const NIGHT_ACTIVE_IDLE_LIMIT_SEC = 60;
export const FOLLOWUP_MIN_SCORE = 85;

function minutesOfDay(value: string | undefined, fallback: number): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value ?? "");
  if (!match) return fallback;
  return Number(match[1]) * 60 + Number(match[2]);
}

function isInConfiguredQuietHours(snapshot: ProactiveRuntimeSnapshot): boolean {
  const current = snapshot.localHour * 60 + (snapshot.localMinute ?? 0);
  const start = minutesOfDay(snapshot.quietStart, 23 * 60);
  const end = minutesOfDay(snapshot.quietEnd, 7 * 60);
  return start <= end ? current >= start && current < end : current >= start || current < end;
}

function proactiveIntervalMs(mode: ProactiveRuntimeSnapshot["openerMode"]): number {
  if (mode === "lively") return 60 * 60 * 1000;
  if (mode === "quiet") return 4 * 60 * 60 * 1000;
  return GLOBAL_PROACTIVE_INTERVAL_MS;
}

function isSameLocalDay(left: number, right: number): boolean {
  const a = new Date(left);
  const b = new Date(right);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const allow = (): ProactiveCommitDecision => ({ allowed: true, reason: "allowed" });
const block = (reason: ProactiveCommitDecision["reason"]): ProactiveCommitDecision => ({ allowed: false, reason });

export function createDefaultProactiveState(): ProactiveState {
  return {
    proactiveEpoch: 0,
    unansweredCount: 0,
    lastProactiveAt: null,
    lastProactiveScene: null,
    lastNormalConversationEndedAt: null,
    globalDesire: 0,
    affinity: {},
    lastFiredAt: {},
  };
}

function isNight(hour: number): boolean {
  return hour >= 22 || hour < 8;
}

export function canStartProactiveGeneration(
  snapshot: ProactiveRuntimeSnapshot,
  state: ProactiveState,
  candidate: ProactiveCandidate,
): ProactiveCommitDecision {
  if (!snapshot.enabled) return block("disabled");
  if (snapshot.screenLocked) return block("screen_locked");
  if (snapshot.conversationBusy) return block("conversation_busy");
  if (snapshot.generationBusy) return block("generation_busy");
  if (isNight(snapshot.localHour) && snapshot.idleSec >= NIGHT_ACTIVE_IDLE_LIMIT_SEC) return block("night_inactive");
  if (isInConfiguredQuietHours(snapshot)) return block("configured_quiet_hours");
  const firedToday = Object.values(state.lastFiredAt).filter((stamp) => typeof stamp === "number" && isSameLocalDay(stamp, snapshot.now)).length;
  if (firedToday >= Math.max(1, snapshot.dailyLimit ?? 4)) return block("daily_limit");
  if (state.unansweredCount >= 2) return block("unanswered_limit");

  if (
    state.lastNormalConversationEndedAt !== null &&
    snapshot.now - state.lastNormalConversationEndedAt < NORMAL_QUIET_MS
  ) return block("normal_quiet_period");

  if (
    state.lastProactiveAt !== null &&
    snapshot.now - state.lastProactiveAt < proactiveIntervalMs(snapshot.openerMode)
  ) return block("global_cooldown");

  const sceneLastFiredAt = state.lastFiredAt[candidate.sceneId];
  if (
    typeof sceneLastFiredAt === "number" &&
    snapshot.now - sceneLastFiredAt < candidate.sceneCooldownMs
  ) return block("scene_cooldown");

  if (state.unansweredCount === 1) {
    if (
      state.lastProactiveAt !== null &&
      snapshot.now - state.lastProactiveAt < FOLLOWUP_INTERVAL_MS
    ) return block("followup_cooldown");
    if (state.lastProactiveScene === candidate.sceneId) return block("followup_same_scene");
    if (candidate.score < FOLLOWUP_MIN_SCORE) return block("followup_score_too_low");
  }

  return allow();
}

export function canCommitProactiveMessage(
  snapshot: ProactiveRuntimeSnapshot,
  state: ProactiveState,
  candidate: ProactiveCandidate,
  generationEpoch: number,
): ProactiveCommitDecision {
  if (generationEpoch !== state.proactiveEpoch) return block("stale_epoch");
  return canStartProactiveGeneration(snapshot, state, candidate);
}

export function markUserActivity(state: ProactiveState): void {
  state.proactiveEpoch += 1;
  state.unansweredCount = 0;
}

export function markNormalConversationStarted(state: ProactiveState): void {
  state.proactiveEpoch += 1;
}

export function markNormalConversationEnded(state: ProactiveState, now: number): void {
  state.proactiveEpoch += 1;
  state.lastNormalConversationEndedAt = now;
  state.globalDesire = 0;
}

export function markProactiveCommitted(
  state: ProactiveState,
  candidate: ProactiveCandidate,
  now: number,
): void {
  state.unansweredCount = Math.min(2, state.unansweredCount + 1) as 0 | 1 | 2;
  state.lastProactiveAt = now;
  state.lastProactiveScene = candidate.sceneId;
  state.lastFiredAt[candidate.sceneId] = now;
  state.globalDesire = 0;
}
