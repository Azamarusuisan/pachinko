import type { BoardDefinition } from "@pachinko/board-schema";
import type { PhysicsEvent, Vector2 } from "@pachinko/event-system";

export const PHYSICS_VERSION = "phase1-rapier-0.19.3-v5";

export type BallState = "SPAWNED" | "LAUNCHING" | "PLAYING" | "ENTERED_POCKET" | "OUT" | "DESTROYED";
export type Route = "left" | "center" | "right";
export type SensorRole = BoardDefinition["sensors"][number]["role"];
export type SensorEnterCounts = Readonly<Partial<Record<SensorRole, number>>>;

export interface BallSnapshot {
  readonly id: string;
  readonly position: Vector2;
  readonly previousPosition: Vector2;
  readonly velocity: Vector2;
  readonly angularVelocity: number;
  readonly radius: number;
  readonly mass: number;
  readonly friction: number;
  readonly restitution: number;
  readonly spawnTime: number;
  readonly collisionCount: number;
  readonly state: BallState;
  readonly route: Route | null;
  readonly routeSequence: readonly Route[];
}

export interface SimulationSnapshot {
  readonly tick: number;
  readonly simulationTime: number;
  readonly balls: readonly BallSnapshot[];
  readonly contacts: readonly DebugContact[];
  readonly mechanisms: readonly MechanismSnapshot[];
}

export interface MechanismSnapshot {
  readonly mechanismId: string;
  readonly colliderId: string;
  readonly from: Vector2;
  readonly to: Vector2;
  readonly thickness: number;
  readonly rotation: number;
}

export interface DebugContact {
  readonly ballId: string;
  readonly colliderId: string;
  readonly point: Vector2;
  readonly normal: Vector2;
  readonly tick: number;
}

export interface LaunchCommand {
  readonly type: "launch";
  readonly tick: number;
  readonly sequence: number;
  readonly power: number;
}

export type InputCommand = LaunchCommand;

export interface EngineOptions {
  readonly board: BoardDefinition;
  readonly seed: number;
  readonly ccdEnabled?: boolean;
  readonly physicsHz?: 120 | 240 | 480;
  readonly substeps?: number;
  readonly heatmapCellSizeMillimeters?: number;
  readonly collectTrajectories?: boolean;
}

export interface ReplayLog {
  readonly boardVersion: string;
  readonly physicsVersion: string;
  readonly seed: number;
  readonly inputSequence: readonly InputCommand[];
}

export interface CompletedBall {
  readonly id: string;
  readonly lifetime: number;
  readonly collisionCount: number;
  readonly terminal: "start" | "out" | "otherPocket" | "timeout";
  readonly route: Route;
  readonly routeSequence: readonly Route[];
  readonly sensorEnterCounts: SensorEnterCounts;
  readonly finalPosition: Vector2;
  readonly velocitySampleCount: number;
  readonly velocitySum: number;
  readonly maxVelocity: number;
  readonly velocityClampCount: number;
  readonly nailCollisionCount: number;
  readonly railCollisionCount: number;
  readonly windmillCollisionCount: number;
  readonly otherSensorCount: number;
  readonly collisionVelocity: CollisionVelocitySummary;
  readonly trajectory?: readonly TrajectoryCellSummary[];
  readonly trajectorySamples?: readonly TrajectorySample[];
}

export interface TrajectorySample {
  readonly tick: number;
  readonly simulationTime: number;
  readonly position: Vector2;
  readonly velocity: Vector2;
}

export interface CollisionVelocitySummary {
  readonly samples: number;
  readonly speedBeforeSum: number;
  readonly speedAfterSum: number;
  readonly maxSpeedBefore: number;
  readonly maxSpeedAfter: number;
}

export interface TrajectoryCellSummary {
  readonly column: number;
  readonly row: number;
  readonly passages: number;
  readonly collisions: number;
  /** Equal-duration physics substeps whose endpoint occupied this cell. */
  readonly velocitySamples: number;
  readonly velocitySum: number;
}

export interface HeatmapCell {
  readonly column: number;
  readonly row: number;
  readonly xMillimeters: number;
  readonly yMillimeters: number;
  readonly widthMillimeters: number;
  readonly heightMillimeters: number;
  readonly ballPassages: number;
  readonly collisions: number;
  /** Equal-duration physics substeps whose endpoint occupied this cell. */
  readonly velocitySamples: number;
  /** Arithmetic mean of those endpoint speeds. */
  readonly averageVelocity: number;
}

export interface HeatmapResult {
  readonly cellSizeMillimeters: number;
  readonly columns: number;
  readonly rows: number;
  readonly cells: readonly HeatmapCell[];
  readonly outcomes: readonly { readonly terminal: CompletedBall["terminal"]; readonly cells: readonly HeatmapCell[] }[];
}

export interface PhysicsDiagnostics {
  readonly dynamicBodyCount: number;
  readonly activeBallCount: number;
  readonly lastStepDurationMs: number;
  readonly finite: boolean;
  readonly velocityClampCount: number;
  readonly maxObservedVelocity: number;
  readonly averageVelocity: number;
}

export type EventSink = (event: PhysicsEvent) => void;
