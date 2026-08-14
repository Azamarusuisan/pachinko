import { describe, expect, it } from "vitest";
import { compareWindmillArchitectures } from "./index.js";

describe("windmill architecture playground", () => {
  it("compares exact kinematic tracking with a force-responsive revolute motor", async () => {
    const result = await compareWindmillArchitectures(240);
    expect(result.kinematic.maxTrackingError).toBeLessThan(1e-4);
    expect(Number.isFinite(result.revoluteMotor.finalAngularVelocity)).toBe(true);
    expect(result.revoluteMotor.maxTrackingError).toBeGreaterThan(result.kinematic.maxTrackingError);
  });
});
