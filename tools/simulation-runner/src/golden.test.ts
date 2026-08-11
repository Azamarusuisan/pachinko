import { describe, expect, it } from "vitest";
import type { SimulationMetrics } from "./index.js";
import { compareGolden, createGoldenBaseline } from "./golden.js";

const metrics: SimulationMetrics = {
  boardId: "eva15_inspired_physics_v2", boardVersion: "test", physicsVersion: "test", seed: 123456,
  launchPower: 0.68, fireRate: 100, physicsHz: 240, ccdEnabled: true, substeps: 1,
  totalBalls: 1000, startWins: 100, outCount: 900, otherSensorCount: 0, sensorEnterCounts: {}, timeoutCount: 0, ballsLaunched: 1000,
  startEntries: 100, outEntries: 900, otherPocketEntries: 0, timeouts: 0, startRate: 0.1,
  outRate: 0.9, averageLifetime: 3, medianLifetime: 3, p95Lifetime: 4,
  averageCollisionCount: 20, medianCollisionCount: 20, p95CollisionCount: 30,
  averageVelocity: 1, maxVelocity: 5, averageCollisionSpeedBefore: 2, averageCollisionSpeedAfter: 1.8,
  maxCollisionSpeedBefore: 5, maxCollisionSpeedAfter: 4.5, collisionVelocityMeasurement: "SUBSTEP_BOUNDARY_PROXY", velocityClampCount: 0,
  nailCollisionCount: 15000, railCollisionCount: 4000, windmillCollisionCount: 1000,
  leftRouteRate: 0.4, centerRouteRate: 0.3, rightRouteRate: 0.3,
  firstLeftRouteRate: 0.4, firstCenterRouteRate: 0.3, firstRightRouteRate: 0.3,
  routeEnterCounts: { left: 400, center: 300, right: 300 }, routeExposureRates: { left: 0.4, center: 0.3, right: 0.3 },
  simulatedSeconds: 600, wallClockMilliseconds: 1, finite: true, remainingBodies: 0, heatmap: null,
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
