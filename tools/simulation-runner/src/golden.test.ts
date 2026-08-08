import { describe, expect, it } from "vitest";
import type { SimulationMetrics } from "./index.js";
import { compareGolden, createGoldenBaseline } from "./golden.js";

const metrics: SimulationMetrics = {
  boardId: "eva15_inspired_physics_v2", boardVersion: "test", physicsVersion: "test", seed: 123456,
  launchPower: 0.68, fireRate: 100, physicsHz: 240, ccdEnabled: true, ballsLaunched: 1000,
  startEntries: 100, outEntries: 900, otherPocketEntries: 0, timeouts: 0, startRate: 0.1,
  averageLifetime: 3, averageCollisionCount: 20, leftRouteRate: 0.4, centerRouteRate: 0.3,
  rightRouteRate: 0.3, simulatedSeconds: 600, wallClockMilliseconds: 1, finite: true, remainingBodies: 0,
};

describe("golden comparison", () => {
  it("accepts the measured baseline and reports drift outside tolerance", () => {
    const baseline = createGoldenBaseline(metrics, "2026-08-08T00:00:00.000Z");
    expect(compareGolden(metrics, baseline)).toEqual([]);
    expect(compareGolden({ ...metrics, startRate: 0.2 }, baseline)).toEqual([
      { metric: "startRate", expected: 0.1, actual: 0.2, delta: 0.1, tolerance: 0.005 },
    ]);
  });
});
