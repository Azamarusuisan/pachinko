import { createBoardTemplate, type BoardDefinition } from "@pachinko/board-schema";

export function makeTestBoard(overrides: Partial<BoardDefinition> = {}): BoardDefinition {
  return createBoardTemplate({
    id: "physics_test",
    physics: { gravity: 9.80665, gravityScale: 1, physicsHz: 240, linearDamping: 0, angularDamping: 0, maxBallLifetimeSeconds: 2, terminalRetentionSeconds: 0 },
    ball: { diameter: 11, massGrams: 5.55, friction: 0, restitution: 0.8 },
    launcher: { position: { x: 250, y: 50 }, angleDegrees: 90, minVelocity: 0, maxVelocity: 1, angleJitterDegrees: 0 },
    ...overrides,
  });
}
