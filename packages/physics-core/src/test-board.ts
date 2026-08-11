import { createBoardTemplate, type BoardDefinition } from "@pachinko/board-schema";

type TestBoardOverrides = Omit<Partial<BoardDefinition>, "physics" | "ball" | "launcher"> & {
  readonly physics?: Partial<BoardDefinition["physics"]>;
  readonly ball?: Partial<BoardDefinition["ball"]>;
  readonly launcher?: Partial<BoardDefinition["launcher"]>;
};

export function makeTestBoard(overrides: TestBoardOverrides = {}): BoardDefinition {
  const base = createBoardTemplate({
    id: "physics_test",
    physics: { gravity: 9.80665, gravityScale: 1, physicsHz: 240, substeps: 1, ccdEnabled: true, linearDamping: 0, angularDamping: 0, maxBallLifetimeSeconds: 2, terminalRetentionSeconds: 0 },
    ball: { diameter: 11, massGrams: 5.55, maxVelocity: null, friction: 0, restitution: 0.8 },
    launcher: { position: { x: 250, y: 50 }, strength: 0.68, angleDegrees: 90, minVelocity: 0, maxVelocity: 1, angleJitterDegrees: 0 },
  });
  return createBoardTemplate({
    ...base,
    ...overrides,
    physics: { ...base.physics, ...overrides.physics },
    ball: { ...base.ball, ...overrides.ball },
    launcher: { ...base.launcher, ...overrides.launcher },
  });
}
