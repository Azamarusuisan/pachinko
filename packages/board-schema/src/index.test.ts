import { describe, expect, it } from "vitest";
import { boardSchema, gramsToKilograms, millimetersToMeters, parseBoard, toSI } from "./index.js";

const minimalBoard = {
  id: "test", version: "1", units: "mm",
  reference: { kind: "reference-based-approximation", description: "test fixture", measured: false },
  board: { width: 500, height: 500, routeBoundariesX: [170, 330] },
  physics: { gravity: 9.80665, gravityScale: 1, physicsHz: 240, linearDamping: 0, angularDamping: 0, maxBallLifetimeSeconds: 10, terminalRetentionSeconds: 0 },
  ball: { diameter: 11, massGrams: 5.55, friction: 0.1, restitution: 0.4 },
  launcher: { position: { x: 20, y: 450 }, angleDegrees: -90, minVelocity: 1, maxVelocity: 3, angleJitterDegrees: 0 },
  nails: [], rails: [], walls: [], sensors: [], gates: [], mechanisms: [],
} as const;

describe("board schema", () => {
  it("validates and converts authoring units to SI", () => {
    const si = toSI(parseBoard(minimalBoard));
    expect(si.width).toBe(0.5);
    expect(si.ball.radius).toBe(0.0055);
    expect(si.ball.mass).toBe(0.00555);
    expect(millimetersToMeters(11)).toBe(0.011);
    expect(gramsToKilograms(5.55)).toBe(0.00555);
  });

  it("rejects invalid board data and duplicate ids", () => {
    expect(boardSchema.safeParse({ ...minimalBoard, units: "pixels" }).success).toBe(false);
    const duplicate = { ...minimalBoard, nails: [
      { id: "n", positionX: 1, positionY: 1, radius: 1, friction: 0.1, restitution: 0.4, enabled: true, group: "a" },
      { id: "n", positionX: 2, positionY: 2, radius: 1, friction: 0.1, restitution: 0.4, enabled: true, group: "a" },
    ] };
    expect(boardSchema.safeParse(duplicate).success).toBe(false);
  });

  it.each(["THROUGH", "ELECTRIC_SUPPORT", "ATTACKER"] as const)("accepts the %s right-play sensor role", (role) => {
    const parsed = parseBoard({ ...minimalBoard, sensors: [{ id: role.toLowerCase(), role, center: { x: 400, y: 300 }, width: 12, height: 12 }] });
    expect(parsed.sensors[0]?.role).toBe(role);
  });
});
