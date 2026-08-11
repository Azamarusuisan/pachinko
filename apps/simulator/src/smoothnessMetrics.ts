import { LOTTERY_TIMING, type LotteryPhase, type ReelMotion } from "./lotteryTimeline.js";

export interface TimelineSample {
  readonly phase: LotteryPhase;
  readonly digits: readonly [number, number, number];
  readonly spinning: ReelMotion;
  readonly actualMs: number;
}

export interface FrameSummary {
  readonly samples: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly maxMs: number;
  readonly estimatedFps: number;
  readonly gapsOver50Ms: number;
}

export const DEFAULT_TARGET_FPS = 60;
export const DEFAULT_MAX_VIDEO_DROP_RATE = 0.001;
export const DEFAULT_MAX_AV_P95_SKEW_MS = 50;
export const DEFAULT_MAX_AV_SKEW_MS = 100;

export function frameSummaryPasses(summary: FrameSummary, targetFps = DEFAULT_TARGET_FPS): boolean {
  const targetFrameMs = 1_000 / targetFps;
  return summary.samples > 0
    // 59.94 Hz panels and timer rounding must not fail a 60 Hz target.
    && summary.estimatedFps >= targetFps * 0.995
    && summary.p95Ms <= targetFrameMs * 1.2
    && summary.p95Ms <= summary.medianMs * 1.75
    && summary.gapsOver50Ms === 0;
}

export function summarizeVideoFrames(totalVideoFrames: number, droppedVideoFrames: number, maxDropRate = DEFAULT_MAX_VIDEO_DROP_RATE) {
  const measured = totalVideoFrames > 0;
  const dropRate = measured ? droppedVideoFrames / totalVideoFrames : null;
  return {
    totalVideoFrames,
    droppedVideoFrames,
    dropRate,
    measured,
    maxDropRate,
    pass: measured && dropRate !== null && dropRate <= maxDropRate,
  };
}

export function percentile(values: readonly number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))] ?? 0;
}

export function summarizeFrames(intervals: readonly number[]): FrameSummary {
  const medianMs = percentile(intervals, 0.5);
  return {
    samples: intervals.length,
    medianMs,
    p95Ms: percentile(intervals, 0.95),
    maxMs: intervals.length === 0 ? 0 : Math.max(...intervals),
    estimatedFps: medianMs === 0 ? 0 : 1_000 / medianMs,
    gapsOver50Ms: intervals.filter((value) => value >= 50).length,
  };
}

export function summarizeAvSkew(skewsMs: readonly number[], maxP95Ms = DEFAULT_MAX_AV_P95_SKEW_MS, maxMs = DEFAULT_MAX_AV_SKEW_MS) {
  const absolute = skewsMs.filter(Number.isFinite).map(Math.abs);
  const p95Ms = percentile(absolute, 0.95);
  const observedMaxMs = absolute.length === 0 ? 0 : Math.max(...absolute);
  return {
    samples: absolute.length,
    p95Ms,
    maxMs: observedMaxMs,
    limits: { p95Ms: maxP95Ms, maxMs },
    pass: absolute.length > 0 && p95Ms <= maxP95Ms && observedMaxMs <= maxMs,
  };
}

function stateKey(sample: Pick<TimelineSample, "phase" | "spinning">): string {
  return `${sample.phase}:${sample.spinning.map(Number).join("")}`;
}

export function expectedTimeline(jackpot: boolean): readonly { readonly key: string; readonly expectedMs: number }[] {
  const values = [
    { key: "CHANCE:111", expectedMs: 0 },
    { key: "CHANCE:011", expectedMs: LOTTERY_TIMING.leftStop },
    { key: "REACH:010", expectedMs: LOTTERY_TIMING.reach },
    { key: "FREEZE:010", expectedMs: LOTTERY_TIMING.freeze },
    { key: "RESULT:000", expectedMs: LOTTERY_TIMING.result },
  ];
  if (jackpot) values.push({ key: "JACKPOT:000", expectedMs: LOTTERY_TIMING.jackpot });
  values.push({ key: "IDLE:000", expectedMs: jackpot ? LOTTERY_TIMING.jackpotFinish : LOTTERY_TIMING.finish });
  return values;
}

export function evaluateTimeline(samples: readonly TimelineSample[], jackpot: boolean) {
  const expected = expectedTimeline(jackpot);
  const actualByKey = new Map<string, TimelineSample>();
  for (const sample of samples) if (!actualByKey.has(stateKey(sample))) actualByKey.set(stateKey(sample), sample);
  const timing = expected.map((item) => {
    const actual = actualByKey.get(item.key)?.actualMs;
    return { ...item, actualMs: actual ?? null, skewMs: actual === undefined ? null : actual - item.expectedMs };
  });
  const reach = samples.find((sample) => sample.phase === "REACH");
  const result = [...samples].reverse().find((sample) => sample.phase === (jackpot ? "JACKPOT" : "RESULT"));
  const reachValid = reach !== undefined && reach.digits[0] === reach.digits[2] && reach.spinning.join() === "false,true,false";
  const resultValid = result !== undefined && result.spinning.every((value) => !value)
    && (jackpot ? result.digits.join() === "7,7,7" : result.digits[0] === result.digits[2] && result.digits[1] !== result.digits[0]);
  const complete = timing.every((item) => item.actualMs !== null);
  const maxAbsSkewMs = Math.max(0, ...timing.map((item) => Math.abs(item.skewMs ?? 0)));
  return { pass: complete && reachValid && resultValid, complete, reachValid, resultValid, maxAbsSkewMs, timing };
}
