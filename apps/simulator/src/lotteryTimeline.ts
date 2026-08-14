export type LotteryPhase = "IDLE" | "CHANCE" | "REACH" | "FREEZE" | "RESULT" | "JACKPOT";
export type HoldColor = "blue" | "green" | "red" | "rainbow";
export type ReelMotion = readonly [boolean, boolean, boolean];
export type PlayPhase = "NORMAL" | "RUSH";

export interface LotteryStartTransition {
  readonly randomState: number;
  readonly holds: readonly number[];
  readonly drawNow?: number;
  readonly disposition: "ignored-rush" | "started" | "held" | "dropped-full";
}

export interface LotteryHoldTransition {
  readonly next?: number;
  readonly holds: readonly number[];
}

export interface RushShotTransition {
  readonly phase: PlayPhase;
  readonly remainingShots: number;
}

export interface LotteryPresentation {
  readonly phase: LotteryPhase;
  readonly digits: readonly [number, number, number];
  readonly spinning: ReelMotion;
  readonly jackpot: boolean;
  readonly reach: boolean;
  readonly hot: boolean;
  readonly hotCue: boolean;
  readonly holdColor: HoldColor;
  readonly drawId: number;
}

export interface LotteryClockSnapshot {
  readonly active: boolean;
  readonly drawId: number;
  readonly elapsedMs: number;
  readonly pushed: boolean;
}

export type LotteryClockReader = () => LotteryClockSnapshot;

export interface StoryPlaybackPlan {
  readonly mediaFrame: number;
  readonly mediaTimeSeconds: number;
  readonly playbackRate: number;
  readonly play: boolean;
  readonly reason: "idle" | "hidden" | "reduced-motion" | "freeze" | "miss" | "ended" | "playing";
}

export interface LotteryOutcome {
  readonly rawState: number;
  readonly jackpot: boolean;
  readonly reach: boolean;
  readonly hot: boolean;
  readonly holdColor: HoldColor;
  readonly reachDigit: number;
  readonly previewDigits: readonly [number, number, number];
  readonly resultDigits: readonly [number, number, number];
}

export type LotteryAudioCueId =
  | "storyAlarm"
  | "storyLaunch"
  | "hotAlert"
  | "storyImpact"
  | "storySync"
  | "storyStrike"
  | "kyuin"
  | "rush";

/** Keeps confirmation sounds coupled to the draw they are allowed to reveal. */
export function lotteryAudioCueAllowed(outcome: Pick<LotteryOutcome, "jackpot" | "reach" | "hot">, cueId: LotteryAudioCueId): boolean {
  switch (cueId) {
    case "storyAlarm":
    case "hotAlert":
      return outcome.hot;
    case "storyLaunch":
    case "storyImpact":
    case "storySync":
    case "storyStrike":
      return outcome.reach;
    case "kyuin":
    case "rush":
      return outcome.jackpot;
  }
}

export const LOTTERY_TIMING = {
  leftStop: 750,
  reach: 1_500,
  normalResult: 1_500,
  normalFinish: 2_200,
  hot: 2_250,
  impact: 3_000,
  hotEnd: 3_600,
  sync: 3_900,
  freeze: 4_550,
  result: 7_500,
  jackpot: 7_850,
  finish: 8_600,
  jackpotFinish: 11_400,
} as const;

export const STORY_VIDEO_TIMING = {
  fps: 30,
  totalFrames: 255,
  durationSeconds: 8.5,
  pauseFrame: 139,
  resumeFrame: 140,
  pauseSeconds: 139 / 30,
  resumeSeconds: 140 / 30,
} as const;

export const MAX_LOTTERY_HOLDS = 4;
export const RUSH_SHOTS = 100;

export function nextLotteryRandomState(rawState: number): number {
  let state = rawState >>> 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
}

export function consumeLotteryStart(rawState: number, phase: PlayPhase, busy: boolean, holds: readonly number[]): LotteryStartTransition {
  if (phase === "RUSH") return { randomState: rawState >>> 0, holds, disposition: "ignored-rush" };
  if (busy && holds.length >= MAX_LOTTERY_HOLDS) return { randomState: rawState >>> 0, holds, disposition: "dropped-full" };
  const randomState = nextLotteryRandomState(rawState);
  if (!busy) return { randomState, holds, drawNow: randomState, disposition: "started" };
  return { randomState, holds: [...holds, randomState], disposition: "held" };
}

export function dequeueLotteryHold(holds: readonly number[]): LotteryHoldTransition {
  const [next, ...remaining] = holds;
  return next === undefined ? { holds: remaining } : { next, holds: remaining };
}

export function consumeRushShot(phase: PlayPhase, remainingShots: number): RushShotTransition {
  if (phase !== "RUSH") return { phase, remainingShots: 0 };
  const next = Math.max(0, remainingShots - 1);
  return next === 0 ? { phase: "NORMAL", remainingShots: 0 } : { phase: "RUSH", remainingShots: next };
}

export function holdColorForState(rawState: number): HoldColor {
  const state = rawState >>> 0;
  if (state % 319 === 0) {
    const roll = (state / 319 * 37) % 100;
    return roll < 5 ? "blue" : roll < 20 ? "green" : roll < 85 ? "red" : "rainbow";
  }
  const roll = state % 1_000;
  return roll < 2 ? "red" : roll < 80 ? "green" : "blue";
}

export function createLotteryOutcome(rawState: number): LotteryOutcome {
  const state = rawState >>> 0;
  const jackpot = state % 319 === 0;
  const holdColor = holdColorForState(state);
  const hot = holdColor === "red" || holdColor === "rainbow";
  const routeRoll = (Math.imul(state, 0x9e3779b1) >>> 0) % 100;
  // ponytail: provisional presentation rates; replace with observed route data during calibration.
  const reach = jackpot || hot || (holdColor === "green" ? routeRoll < 25 : routeRoll < 5);
  const reachDigit = jackpot ? 7 : state % 10;
  const previewDigits = [state % 10, (state >>> 4) % 10, (state >>> 12) % 10] as const;
  const candidate = (state >>> 8) % 10;
  const missDigit = candidate === reachDigit ? (candidate + 1) % 10 : candidate;
  const normalRight = previewDigits[2] === previewDigits[0] ? (previewDigits[2] + 1) % 10 : previewDigits[2];
  return {
    rawState: state,
    jackpot,
    reach,
    hot,
    holdColor,
    reachDigit,
    previewDigits,
    resultDigits: jackpot ? [7, 7, 7] : reach ? [reachDigit, missDigit, reachDigit] : [previewDigits[0], candidate, normalRight],
  };
}

export function lotteryFinishAt(value: Pick<LotteryOutcome, "jackpot" | "reach">): number {
  return value.jackpot ? LOTTERY_TIMING.jackpotFinish : value.reach ? LOTTERY_TIMING.finish : LOTTERY_TIMING.normalFinish;
}

export function lotteryElapsedAfterPush(elapsedMs: number): number {
  return elapsedMs >= LOTTERY_TIMING.freeze ? LOTTERY_TIMING.result : elapsedMs;
}

export function lotteryElapsedAwaitingPush(elapsedMs: number): number {
  return Math.min(elapsedMs, LOTTERY_TIMING.freeze);
}

export function storyPlaybackPlanAt(clock: LotteryClockSnapshot, jackpot: boolean, reducedMotion: boolean, visible: boolean): StoryPlaybackPlan {
  if (!clock.active) return { mediaFrame: 0, mediaTimeSeconds: 0, playbackRate: 1, play: false, reason: "idle" };
  const elapsedMs = Math.max(0, Number.isFinite(clock.elapsedMs) ? clock.elapsedMs : 0);
  const beforePushRate = STORY_VIDEO_TIMING.pauseSeconds / (LOTTERY_TIMING.freeze / 1_000);
  const rawMediaFrame = clock.pushed
    ? jackpot
      ? STORY_VIDEO_TIMING.resumeFrame + Math.floor(Math.max(0, elapsedMs - LOTTERY_TIMING.result) / 1_000 * STORY_VIDEO_TIMING.fps)
      : STORY_VIDEO_TIMING.resumeFrame
    : Math.min(STORY_VIDEO_TIMING.pauseFrame, Math.floor(elapsedMs / LOTTERY_TIMING.freeze * STORY_VIDEO_TIMING.pauseFrame));
  const mediaFrame = Math.min(STORY_VIDEO_TIMING.totalFrames - 1, rawMediaFrame);
  const mediaTimeSeconds = mediaFrame / STORY_VIDEO_TIMING.fps;
  const playbackRate = clock.pushed ? 1 : beforePushRate;
  const plan = { mediaFrame, mediaTimeSeconds, playbackRate };
  if (!visible) return { ...plan, play: false, reason: "hidden" };
  if (reducedMotion) return { ...plan, play: false, reason: "reduced-motion" };
  if (!clock.pushed && elapsedMs >= LOTTERY_TIMING.freeze) return { ...plan, play: false, reason: "freeze" };
  if (clock.pushed && !jackpot) return { ...plan, play: false, reason: "miss" };
  if (rawMediaFrame >= STORY_VIDEO_TIMING.totalFrames) return { ...plan, play: false, reason: "ended" };
  return { ...plan, play: true, reason: "playing" };
}

export function lotteryPresentationAt(outcome: LotteryOutcome, elapsedMs: number, drawId: number): LotteryPresentation {
  const base = { jackpot: outcome.jackpot, reach: outcome.reach, hot: outcome.hot, hotCue: outcome.hot && elapsedMs >= LOTTERY_TIMING.hot && elapsedMs < LOTTERY_TIMING.hotEnd, holdColor: outcome.holdColor, drawId };
  if (elapsedMs >= lotteryFinishAt(outcome)) {
    return { ...base, phase: "IDLE", digits: outcome.resultDigits, spinning: [false, false, false] };
  }
  if (!outcome.reach) {
    if (elapsedMs >= LOTTERY_TIMING.normalResult) return { ...base, phase: "RESULT", digits: outcome.resultDigits, spinning: [false, false, false] };
    if (elapsedMs >= LOTTERY_TIMING.leftStop) return { ...base, phase: "CHANCE", digits: [outcome.resultDigits[0], outcome.previewDigits[1], outcome.previewDigits[2]], spinning: [false, true, true] };
    return { ...base, phase: "CHANCE", digits: outcome.previewDigits, spinning: [true, true, true] };
  }
  if (elapsedMs >= LOTTERY_TIMING.jackpot && outcome.jackpot) {
    return { ...base, phase: "JACKPOT", digits: outcome.resultDigits, spinning: [false, false, false] };
  }
  if (elapsedMs >= LOTTERY_TIMING.result) {
    return { ...base, phase: "RESULT", digits: outcome.resultDigits, spinning: [false, false, false] };
  }
  const reachDigits: readonly [number, number, number] = [outcome.reachDigit, outcome.resultDigits[1], outcome.reachDigit];
  if (elapsedMs >= LOTTERY_TIMING.freeze) {
    return { ...base, phase: "FREEZE", digits: reachDigits, spinning: [false, true, false] };
  }
  if (elapsedMs >= LOTTERY_TIMING.reach) {
    return { ...base, phase: "REACH", digits: reachDigits, spinning: [false, true, false] };
  }
  if (elapsedMs >= LOTTERY_TIMING.leftStop) {
    return { ...base, phase: "CHANCE", digits: reachDigits, spinning: [false, true, true] };
  }
  return { ...base, phase: "CHANCE", digits: outcome.previewDigits, spinning: [true, true, true] };
}

export function presentationKey(value: LotteryPresentation): string {
  return `${value.phase}:${value.digits.join("")}:${value.spinning.map(Number).join("")}:${Number(value.hotCue)}`;
}

export const IDLE_PRESENTATION: LotteryPresentation = {
  phase: "IDLE",
  digits: [0, 0, 0],
  spinning: [false, false, false],
  jackpot: false,
  reach: false,
  hot: false,
  hotCue: false,
  holdColor: "blue",
  drawId: 0,
};
