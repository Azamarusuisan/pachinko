import { describe, expect, it } from "vitest";
import { createBoardTemplate } from "@pachinko/board-schema";
import {
  applyCalibration,
  assertIndependentTrainHoldout,
  assessModelDimensionality,
  calibrationLoss,
  compareCalibration,
  heatmapJensenShannonDivergence,
  meanAbsoluteError,
  parseObservedCapture,
  parseObservedDataset,
  summarizeObservedCapture,
  type ComparableMetrics,
} from "./index.js";

const observedFixture = {
  schemaVersion: "1",
  datasetId: "synthetic_test_fixture",
  split: "TRAIN",
  capturedAt: "2026-08-10T12:00:00+09:00",
  sourceFileSha256: "a".repeat(64),
  rightsStatus: "CLEARED",
  provenanceStatus: "FIRST_PARTY_CAPTURE",
  machineId: "test-machine",
  boardId: "test-board",
  ballCount: 30,
  launchPower: 0.68,
  fireRatePerMinute: 100,
  boardTiltDegrees: 0,
  measurements: { startRate: 0.1 },
} as const;

const captureFixture = {
  schemaVersion: "1",
  captureId: "machine_capture_train",
  captureSessionId: "session_train",
  split: "TRAIN",
  capturedAt: "2026-08-10T12:00:00+09:00",
  sourceFileSha256: "b".repeat(64),
  rightsStatus: "CLEARED",
  provenanceStatus: "FIRST_PARTY_CAPTURE",
  machineId: "test-machine",
  boardId: "test-board",
  launchPower: 0.68,
  fireRatePerMinute: 25,
  boardTiltDegrees: 0.5,
  glassSpacingMillimeters: 12,
  frameRateHz: 240,
  sourceFrame: { widthPixels: 1920, heightPixels: 1080 },
  coordinateSystem: "board-mm-top-left-y-down",
  controlPoints: [
    { sourcePixels: { x: 10, y: 10 }, boardMillimeters: { x: 0, y: 0 } },
    { sourcePixels: { x: 1910, y: 10 }, boardMillimeters: { x: 500, y: 0 } },
    { sourcePixels: { x: 1910, y: 1070 }, boardMillimeters: { x: 500, y: 500 } },
    { sourcePixels: { x: 10, y: 1070 }, boardMillimeters: { x: 0, y: 500 } },
  ],
  reprojectionErrorMillimeters: { median: 0.4, p95: 0.8 },
  balls: [
    {
      ballId: "ball-1",
      launchedAtSeconds: 0,
      samples: [
        { frame: 0, timeSeconds: 0, xMillimeters: 0, yMillimeters: 0 },
        { frame: 240, timeSeconds: 1, xMillimeters: 100, yMillimeters: 0 },
      ],
      collisions: [{
        timeSeconds: 0.5,
        colliderRole: "NAIL",
        colliderId: "n1",
        positionMillimeters: { x: 50, y: 0 },
        velocityBeforeMetersPerSecond: { x: 1, y: 0 },
        velocityAfterMetersPerSecond: { x: 0, y: 1 },
      }],
      firstRoute: "LEFT",
      terminal: { role: "START", timeSeconds: 1 },
    },
    {
      ballId: "ball-2",
      launchedAtSeconds: 2,
      samples: [
        { frame: 480, timeSeconds: 2, xMillimeters: 0, yMillimeters: 0 },
        { frame: 960, timeSeconds: 4, xMillimeters: 0, yMillimeters: 200 },
      ],
      collisions: [],
      firstRoute: "RIGHT",
      terminal: { role: "OUT", timeSeconds: 4 },
    },
  ],
} as const;

describe("calibration model", () => {
  it("applies explicit parameters through board validation", () => {
    const changed = applyCalibration(createBoardTemplate({ nails: [{ id: "n", positionX: 1, positionY: 1, radius: 1, friction: 0.1, restitution: 0.4, enabled: true, group: "test" }] }), {
      gravityScale: 0.9, ballMassGrams: 5.6, ballMaxVelocity: 8, nailRadiusMillimeters: 1.3,
      launchAngleDegrees: -92, launchStrength: 0.7, launchVarianceDegrees: 0.2, physicsHz: 480, substeps: 2,
    });
    expect(changed.physics).toMatchObject({ gravityScale: 0.9, physicsHz: 480 });
    expect(changed.ball.massGrams).toBe(5.6);
    expect(changed.ball.maxVelocity).toBe(8);
    expect(changed.nails[0]?.radius).toBe(1.3);
    expect(changed.launcher.angleDegrees).toBe(-92);
    expect(changed.launcher.strength).toBe(0.7);
    expect(changed.physics.substeps).toBe(2);
  });

  it("compares before and after metrics without changing simulation semantics", () => {
    const before: ComparableMetrics = { startRate: 0.1, averageLifetime: 2, averageCollisionCount: 10, leftRouteRate: 0.4, centerRouteRate: 0.3, rightRouteRate: 0.3 };
    const result = compareCalibration("before", before, "after", { ...before, startRate: 0.12, averageCollisionCount: 11 });
    expect(result.delta.startRate).toBeCloseTo(0.02);
    expect(result.delta.averageCollisionCount).toBe(1);
  });

  it("computes an explicit weighted loss without choosing calibration targets", () => {
    const result = calibrationLoss(
      { startRate: 0.05, averageLifetime: 2 },
      { startRate: 0.35, averageLifetime: 3 },
      { startRate: 10, averageLifetime: 0.5 },
    );
    expect(result.components.startRate?.squaredError).toBeCloseTo(0.9);
    expect(result.components.averageLifetime?.squaredError).toBeCloseTo(0.5);
    expect(result.total).toBeCloseTo(1.4);
  });

  it("rejects observed datasets with invalid rights, hash, or split", () => {
    expect(() => parseObservedDataset({ ...observedFixture, rightsStatus: "UNKNOWN" })).toThrow();
    expect(() => parseObservedDataset({ ...observedFixture, sourceFileSha256: "not-a-sha256" })).toThrow();
    expect(() => parseObservedDataset({ ...observedFixture, split: "BOTH" })).toThrow();
    expect(parseObservedDataset(observedFixture).datasetId).toBe("synthetic_test_fixture");
  });

  it("compares extended trajectory, heatmap, velocity, and reflection metrics", () => {
    const result = calibrationLoss(
      { averageTrajectoryPathLengthMillimeters: 900, heatmapEntropy: 2, maxVelocity: 3, collisionFrequencyPerSecond: 4, averageReflectionAngleDegrees: 35 },
      { averageTrajectoryPathLengthMillimeters: 910, heatmapEntropy: 2.5, maxVelocity: 3.2, collisionFrequencyPerSecond: 5, averageReflectionAngleDegrees: 37 },
    );
    expect(Object.keys(result.components)).toEqual([
      "averageTrajectoryPathLengthMillimeters", "heatmapEntropy", "maxVelocity", "collisionFrequencyPerSecond", "averageReflectionAngleDegrees",
    ]);
    expect(result.total).toBeCloseTo(105.29);
  });

  it("compares heatmap distributions with explicit zero-total behavior", () => {
    expect(heatmapJensenShannonDivergence([1, 3], [1, 3])).toBeCloseTo(0);
    expect(heatmapJensenShannonDivergence([0, 0], [0, 0])).toBe(0);
    expect(heatmapJensenShannonDivergence([0, 0], [1, 0])).toBe(Math.LN2);
  });

  it("compares trajectories and rejects incomparable arrays", () => {
    expect(meanAbsoluteError([0, 2], [1, 4])).toBe(1.5);
    expect(() => meanAbsoluteError([0], [0, 1])).toThrow();
    expect(() => meanAbsoluteError([Number.NaN], [0])).toThrow();
    expect(() => heatmapJensenShannonDivergence([1], [1, 0])).toThrow();
    expect(() => heatmapJensenShannonDivergence([1, Number.POSITIVE_INFINITY], [1, 0])).toThrow();
    expect(() => heatmapJensenShannonDivergence([1, -1], [1, 0])).toThrow();
  });

  it("stores derived comparison metrics in calibration loss", () => {
    const result = calibrationLoss(
      { heatmapJensenShannonDivergence: 0, trajectoryMeanAbsoluteErrorMillimeters: 0, reflectionAngleMaeDegrees: 0 },
      { heatmapJensenShannonDivergence: 0.04, trajectoryMeanAbsoluteErrorMillimeters: 2, reflectionAngleMaeDegrees: 3 },
    );
    expect(result.total).toBeCloseTo(13.0016);
    expect(result.components.reflectionAngleMaeDegrees?.simulated).toBe(3);
  });

  it("keeps 2D only when complete evidence clears every project gate", () => {
    const result = assessModelDimensionality({
      zDisplacementOver2mmRate: 0.009,
      boardGlassContactRate: 0.009,
      reflectionAngleMaeDegrees: 5,
      startRateAbsoluteError: 0.02,
      outRateAbsoluteError: 0.02,
      heatmapJensenShannonDivergence: 0.05,
      threeDimensionalHoldoutLossImprovementRate: 0.199,
    });
    expect(result).toEqual({ decision: "KEEP_2D", triggeredReasons: [], missingEvidence: [] });
  });

  it("requests a 3D playground with every triggered reason", () => {
    const result = assessModelDimensionality({
      zDisplacementOver2mmRate: 0.01,
      boardGlassContactRate: 0.01,
      reflectionAngleMaeDegrees: 5.1,
      startRateAbsoluteError: 0.021,
      outRateAbsoluteError: 0.021,
      heatmapJensenShannonDivergence: 0.051,
      threeDimensionalHoldoutLossImprovementRate: 0.2,
    });
    expect(result.decision).toBe("BUILD_3D_PLAYGROUND");
    expect(result.triggeredReasons).toHaveLength(7);
  });

  it("never silently keeps 2D with missing or invalid evidence", () => {
    expect(assessModelDimensionality({ startRateAbsoluteError: 0.01 })).toMatchObject({
      decision: "INSUFFICIENT_EVIDENCE",
      triggeredReasons: [],
    });
    expect(() => assessModelDimensionality({ startRateAbsoluteError: Number.NaN })).toThrow();
    expect(() => assessModelDimensionality({ startRateAbsoluteError: -0.01 })).toThrow();
  });

  it("validates frame-level real-machine observations and summarizes them", () => {
    expect(parseObservedCapture(captureFixture).balls).toHaveLength(2);
    const summary = summarizeObservedCapture(captureFixture);
    expect(summary).toMatchObject({ datasetId: "machine_capture_train", split: "TRAIN", ballCount: 2, trajectorySampleRateHz: 240 });
    expect(summary.measurements).toMatchObject({
      startRate: 0.5,
      outRate: 0.5,
      averageLifetime: 1.5,
      averageCollisionCount: 0.5,
      averageVelocity: 0.1,
      averageTrajectoryPathLengthMillimeters: 150,
      averageReflectionAngleDegrees: 90,
      leftRouteRate: 0.5,
      centerRouteRate: 0,
      rightRouteRate: 0.5,
    });
  });

  it("requires at least 240 captured frames per second", () => {
    expect(() => parseObservedCapture({ ...captureFixture, frameRateHz: 239 })).toThrow(/240/);
    expect(parseObservedCapture({ ...captureFixture, frameRateHz: 240 }).frameRateHz).toBe(240);
  });

  it("rejects unordered tracks, duplicate ball IDs, and invalid reprojection evidence", () => {
    const duplicate = { ...captureFixture, balls: [captureFixture.balls[0], captureFixture.balls[0]] };
    expect(() => parseObservedCapture(duplicate)).toThrow(/ballId/);
    const unordered = { ...captureFixture, balls: [{ ...captureFixture.balls[0], samples: [...captureFixture.balls[0].samples].reverse() }] };
    expect(() => parseObservedCapture(unordered)).toThrow(/increasing/);
    expect(() => parseObservedCapture({ ...captureFixture, reprojectionErrorMillimeters: { median: 1, p95: 0.5 } })).toThrow(/p95/);
  });

  it("requires an independent capture session for HOLDOUT", () => {
    const train = parseObservedCapture(captureFixture);
    const holdout = parseObservedCapture({
      ...captureFixture,
      captureId: "machine_capture_holdout",
      captureSessionId: "session_holdout",
      split: "HOLDOUT",
      sourceFileSha256: "c".repeat(64),
    });
    expect(() => assertIndependentTrainHoldout(train, holdout)).not.toThrow();
    expect(() => assertIndependentTrainHoldout(train, { ...holdout, captureSessionId: train.captureSessionId })).toThrow(/sessions/);
    expect(() => assertIndependentTrainHoldout(train, { ...holdout, sourceFileSha256: train.sourceFileSha256 })).toThrow(/source file/);
  });
});
