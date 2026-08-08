import type { BoardDefinition } from "@pachinko/board-schema";
import type { PhysicsEvent, Vector2 } from "@pachinko/event-system";

export const PHYSICS_VERSION = "phase1-rapier-0.19.3-v2";

export type BallState = "SPAWNED" | "LAUNCHING" | "PLAYING" | "ENTERED_POCKET" | "OUT" | "DESTROYED";

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
  readonly route: "left" | "center" | "right" | null;
}

export interface SimulationSnapshot {
  readonly tick: number;
  readonly simulationTime: number;
  readonly balls: readonly BallSnapshot[];
  readonly contacts: readonly DebugContact[];
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
  readonly route: "left" | "center" | "right";
  readonly finalPosition: Vector2;
}

export interface PhysicsDiagnostics {
  readonly dynamicBodyCount: number;
  readonly activeBallCount: number;
  readonly lastStepDurationMs: number;
  readonly finite: boolean;
}

export type EventSink = (event: PhysicsEvent) => void;
