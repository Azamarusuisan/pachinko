import { parseBoard, type BoardDefinition } from "@pachinko/board-schema";

export type PhysicsHz = 120 | 240 | 480;
export type FireRate = 25 | 50 | 75 | 100;
export type SimulationSpeed = 1 | 2 | 4 | 8 | 16;

export interface CalibrationPatch {
  readonly gravity?: number;
  readonly gravityScale?: number;
  readonly ballMassGrams?: number;
  readonly ballDiameterMillimeters?: number;
  readonly ballRestitution?: number;
  readonly ballFriction?: number;
  readonly linearDamping?: number;
  readonly angularDamping?: number;
  readonly nailRadiusMillimeters?: number;
  readonly nailRestitution?: number;
  readonly nailFriction?: number;
  readonly launchAngleDegrees?: number;
  readonly launchMinVelocity?: number;
  readonly launchMaxVelocity?: number;
  readonly physicsHz?: PhysicsHz;
}

export interface CalibrationScenario {
  readonly id: string;
  readonly board: BoardDefinition;
  readonly seed: number;
  readonly balls: number;
  readonly launchPower: number;
  readonly fireRate: FireRate;
  readonly simulationSpeed: SimulationSpeed;
  readonly ccdEnabled: boolean;
}

export interface ComparableMetrics {
  readonly startRate: number;
  readonly averageLifetime: number;
  readonly averageCollisionCount: number;
  readonly leftRouteRate: number;
  readonly centerRouteRate: number;
  readonly rightRouteRate: number;
}

export interface CalibrationComparison {
  readonly beforeScenarioId: string;
  readonly afterScenarioId: string;
  readonly delta: ComparableMetrics;
}

export function applyCalibration(board: BoardDefinition, patch: CalibrationPatch): BoardDefinition {
  const physics = board.physics;
  const ball = board.ball;
  const launcher = board.launcher;
  return parseBoard({
    ...board,
    physics: {
      ...physics,
      gravity: patch.gravity ?? physics.gravity,
      gravityScale: patch.gravityScale ?? physics.gravityScale,
      physicsHz: patch.physicsHz ?? physics.physicsHz,
      linearDamping: patch.linearDamping ?? physics.linearDamping,
      angularDamping: patch.angularDamping ?? physics.angularDamping,
    },
    ball: {
      ...ball,
      massGrams: patch.ballMassGrams ?? ball.massGrams,
      diameter: patch.ballDiameterMillimeters ?? ball.diameter,
      restitution: patch.ballRestitution ?? ball.restitution,
      friction: patch.ballFriction ?? ball.friction,
    },
    launcher: {
      ...launcher,
      angleDegrees: patch.launchAngleDegrees ?? launcher.angleDegrees,
      minVelocity: patch.launchMinVelocity ?? launcher.minVelocity,
      maxVelocity: patch.launchMaxVelocity ?? launcher.maxVelocity,
    },
    nails: board.nails.map((nail) => ({
      ...nail,
      radius: patch.nailRadiusMillimeters ?? nail.radius,
      restitution: patch.nailRestitution ?? nail.restitution,
      friction: patch.nailFriction ?? nail.friction,
    })),
  });
}

export function compareCalibration(beforeScenarioId: string, before: ComparableMetrics, afterScenarioId: string, after: ComparableMetrics): CalibrationComparison {
  return {
    beforeScenarioId,
    afterScenarioId,
    delta: {
      startRate: after.startRate - before.startRate,
      averageLifetime: after.averageLifetime - before.averageLifetime,
      averageCollisionCount: after.averageCollisionCount - before.averageCollisionCount,
      leftRouteRate: after.leftRouteRate - before.leftRouteRate,
      centerRouteRate: after.centerRouteRate - before.centerRouteRate,
      rightRouteRate: after.rightRouteRate - before.rightRouteRate,
    },
  };
}
