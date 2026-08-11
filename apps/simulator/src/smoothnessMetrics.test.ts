import { describe, expect, it } from "vitest";
import { LOTTERY_TIMING } from "./lotteryTimeline.js";
import { evaluateTimeline, frameSummaryPasses, summarizeAvSkew, summarizeFrames, summarizeVideoFrames, type TimelineSample } from "./smoothnessMetrics.js";

const sample = (phase: TimelineSample["phase"], spinning: TimelineSample["spinning"], actualMs: number, digits: TimelineSample["digits"] = [2, 4, 2]): TimelineSample => ({ phase, spinning, actualMs, digits });

describe("smoothness metrics", () => {
  it("summarizes refresh-aware frame intervals", () => {
    const summary = summarizeFrames([16, 17, 16, 33, 16]);
    expect(summary.medianMs).toBe(16);
    expect(summary.p95Ms).toBe(17);
    expect(summary.maxMs).toBe(33);
    expect(summary.gapsOver50Ms).toBe(0);
  });

  it("rejects stable rendering below the explicit frame-rate target", () => {
    expect(frameSummaryPasses(summarizeFrames([20, 20, 20, 20]))).toBe(false);
    expect(frameSummaryPasses(summarizeFrames([16.7, 16.7, 16.7, 16.7]))).toBe(true);
    expect(frameSummaryPasses(summarizeFrames([10, 10, 10, 10]), 90)).toBe(true);
  });

  it("rejects excessive or unmeasured video frame drops", () => {
    expect(summarizeVideoFrames(1_000, 2).pass).toBe(false);
    expect(summarizeVideoFrames(0, 0)).toMatchObject({ measured: false, dropRate: null, pass: false });
  });

  it("gates AV skew at p95 50 ms and absolute max 100 ms", () => {
    expect(summarizeAvSkew([0, -20, 40, 50, 100])).toMatchObject({ samples: 5, p95Ms: 50, maxMs: 100, pass: true });
    expect(summarizeAvSkew([0, 20, 51, 51, 99]).pass).toBe(false);
    expect(summarizeAvSkew([0, 20, 40, 50, 101]).pass).toBe(false);
    expect(summarizeAvSkew([]).pass).toBe(false);
  });

  it("passes only a complete semantic reach sequence", () => {
    const result = evaluateTimeline([
      sample("CHANCE", [true, true, true], 0),
      sample("CHANCE", [false, true, true], 750),
      sample("REACH", [false, true, false], 1_500),
      sample("FREEZE", [false, true, false], LOTTERY_TIMING.freeze),
      sample("RESULT", [false, false, false], LOTTERY_TIMING.result),
      sample("IDLE", [false, false, false], LOTTERY_TIMING.finish),
    ], false);
    expect(result.pass).toBe(true);
    expect(result.maxAbsSkewMs).toBe(0);
  });

  it("rejects a fake reach with unmatched outer reels", () => {
    const result = evaluateTimeline([
      sample("REACH", [false, true, false], 1_500, [2, 4, 3]),
    ], false);
    expect(result.reachValid).toBe(false);
    expect(result.pass).toBe(false);
  });
});
