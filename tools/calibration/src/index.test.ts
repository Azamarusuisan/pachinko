import { describe, expect, it } from "vitest";
import { createBoardTemplate } from "@pachinko/board-schema";
import { applyCalibration, compareCalibration, type ComparableMetrics } from "./index.js";

describe("calibration model", () => {
  it("applies explicit parameters through board validation", () => {
    const changed = applyCalibration(createBoardTemplate({ nails: [{ id: "n", positionX: 1, positionY: 1, radius: 1, friction: 0.1, restitution: 0.4, enabled: true, group: "test" }] }), {
      gravityScale: 0.9, ballMassGrams: 5.6, nailRadiusMillimeters: 1.3, launchAngleDegrees: -92, physicsHz: 480,
    });
    expect(changed.physics).toMatchObject({ gravityScale: 0.9, physicsHz: 480 });
    expect(changed.ball.massGrams).toBe(5.6);
    expect(changed.nails[0]?.radius).toBe(1.3);
    expect(changed.launcher.angleDegrees).toBe(-92);
  });

  it("compares before and after metrics without changing simulation semantics", () => {
    const before: ComparableMetrics = { startRate: 0.1, averageLifetime: 2, averageCollisionCount: 10, leftRouteRate: 0.4, centerRouteRate: 0.3, rightRouteRate: 0.3 };
    const result = compareCalibration("before", before, "after", { ...before, startRate: 0.12, averageCollisionCount: 11 });
    expect(result.delta.startRate).toBeCloseTo(0.02);
    expect(result.delta.averageCollisionCount).toBe(1);
  });
});
