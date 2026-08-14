import { describe, expect, it } from "vitest";
import { createBoardTemplate } from "@pachinko/board-schema";
import { createBoardVisualGeometry, hanemonoVisualPolygon, pixiArcRunsAnticlockwise } from "./index.js";

const material = { friction: 0.1, restitution: 0.2 } as const;

describe("Pixi physics overlay", () => {
  it("draws a decreasing board arc in the same direction as its physics segments", () => {
    expect(pixiArcRunsAnticlockwise(-63, -225)).toBe(true);
    expect(pixiArcRunsAnticlockwise(15, 45)).toBe(false);
  });

  it("expands a physical wing into a visible four-corner mechanism", () => {
    expect(hanemonoVisualPolygon({ x: 64, y: 344.5 }, { x: 76, y: 344.5 }, 8))
      .toEqual([64, 352.5, 76, 348.9, 76, 340.1, 64, 336.5]);
  });

  it("shows exactly the enabled physical nails without synthesizing LCD nails", () => {
    const board = createBoardTemplate({
      nails: [
        { id: "physical-nail", positionX: 20, positionY: 20, radius: 1, enabled: true, group: "test", ...material },
        { id: "disabled-nail", positionX: 250, positionY: 250, radius: 1, enabled: false, group: "lcd", ...material },
      ],
      mechanisms: [{
        id: "center-display-collider", adapter: "fixed-outline-v1", enabled: true,
        massGrams: 5, angularDamping: 0.8, angularVelocityDegreesPerSecond: 0,
        motion: "ROTATE", oscillationAmplitudeDegrees: 0, oscillationFrequencyHz: 0, phaseDegrees: 0,
        colliders: [{ id: "lcd-top", from: { x: 100, y: 100 }, to: { x: 400, y: 100 }, thickness: 7, bodyType: "FIXED", ...material }],
      }],
    });
    const visual = createBoardVisualGeometry(board);
    expect(visual.nails.map((nail) => nail.id)).toEqual(["physical-nail"]);
    expect(visual.nails).toHaveLength(board.nails.filter((nail) => nail.enabled).length);
  });

  it("keeps world walls debug-only while exposing physical rails, gates, and fixed mechanisms", () => {
    const segment = { from: { x: 0, y: 0 }, to: { x: 10, y: 10 }, thickness: 1, ...material } as const;
    const board = createBoardTemplate({
      rails: [{ id: "rail", ...segment }],
      walls: [{ id: "world-wall", ...segment }],
      gates: [{ id: "gate", enabled: true, collisionMode: "BIDIRECTIONAL", ...segment }],
      mechanisms: [{
        id: "fixed-mechanism", adapter: "fixed-v1", enabled: true,
        massGrams: 5, angularDamping: 0.8, angularVelocityDegreesPerSecond: 0,
        motion: "ROTATE", oscillationAmplitudeDegrees: 0, oscillationFrequencyHz: 0, phaseDegrees: 0,
        colliders: [{ id: "fixed", bodyType: "FIXED", ...segment }],
      }, {
        id: "moving-mechanism", adapter: "dynamic-v1", enabled: true, pivot: { x: 0, y: 0 },
        massGrams: 5, angularDamping: 0.8, angularVelocityDegreesPerSecond: 10,
        motion: "ROTATE", oscillationAmplitudeDegrees: 0, oscillationFrequencyHz: 0, phaseDegrees: 0,
        colliders: [{ id: "moving", bodyType: "DYNAMIC", ...segment }],
      }],
    });
    const visual = createBoardVisualGeometry(board);
    expect(visual.rails.map((rail) => rail.id)).toEqual(["rail"]);
    expect(visual.gates.map((gate) => gate.id)).toEqual(["gate"]);
    expect(visual.mechanismColliders.map((collider) => collider.mechanismId)).toEqual(["fixed-mechanism"]);
    expect("walls" in visual).toBe(false);
  });
});
