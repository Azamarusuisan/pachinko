import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { parseBoard, type BoardDefinition } from "@pachinko/board-schema";
import { runBatch, type SimulationMetrics } from "./index.js";

export interface ExperimentPhysicsConfig {
  readonly gravity: number;
  readonly gravityScale: number;
  readonly physicsHz: 120 | 240 | 480;
  readonly substeps: number;
  readonly ccdEnabled: boolean;
  readonly linearDamping: number;
  readonly angularDamping: number;
  readonly ballRadiusMillimeters: number;
  readonly ballMassGrams: number;
  readonly ballRestitution: number;
  readonly ballFriction: number;
  readonly maxVelocity: number | null;
}

export interface ExperimentLauncherConfig {
  readonly strength: number;
  readonly positionMillimeters: { readonly x: number; readonly y: number };
  readonly angleDegrees: number;
  readonly varianceDegrees: number;
  readonly minVelocity: number;
  readonly maxVelocity: number;
}

export interface ExperimentConfig {
  readonly boardVersion: string;
  readonly seed: number;
  readonly balls: number;
  readonly fireRate: 25 | 50 | 75 | 100;
  readonly physicsConfig: ExperimentPhysicsConfig;
  readonly launcherConfig: ExperimentLauncherConfig;
  readonly heatmapCellSizeMillimeters?: number;
  readonly collectTrajectories?: boolean;
}

export interface ExperimentResult {
  readonly metrics: SimulationMetrics;
  readonly configHash: string;
  readonly boardHash: string;
  readonly timestamp: string;
}

export interface ExperimentComparison {
  readonly beforeBoardHash: string;
  readonly afterBoardHash: string;
  readonly beforeConfigHash: string;
  readonly afterConfigHash: string;
  readonly delta: Pick<SimulationMetrics, "startRate" | "outRate" | "averageLifetime" | "averageCollisionCount" | "averageVelocity" | "maxVelocity">;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

export function canonicalJson(value: unknown): string { return JSON.stringify(canonicalize(value)); }
export function sha256(value: unknown): string { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }
export function boardGeometryHash(board: BoardDefinition): string {
  return sha256({
    board: board.board,
    nails: board.nails,
    rails: board.rails,
    arcRails: board.arcRails,
    walls: board.walls,
    sensors: board.sensors,
    gates: board.gates,
    mechanisms: board.mechanisms,
  });
}

export function createExperimentConfig(board: BoardDefinition, overrides: Partial<Pick<ExperimentConfig, "seed" | "balls" | "fireRate" | "heatmapCellSizeMillimeters" | "collectTrajectories">> = {}): ExperimentConfig {
  return {
    boardVersion: board.version,
    seed: overrides.seed ?? 123456,
    balls: overrides.balls ?? 1000,
    fireRate: overrides.fireRate ?? 100,
    physicsConfig: {
      gravity: board.physics.gravity,
      gravityScale: board.physics.gravityScale,
      physicsHz: board.physics.physicsHz,
      substeps: board.physics.substeps,
      ccdEnabled: board.physics.ccdEnabled,
      linearDamping: board.physics.linearDamping,
      angularDamping: board.physics.angularDamping,
      ballRadiusMillimeters: board.ball.diameter / 2,
      ballMassGrams: board.ball.massGrams,
      ballRestitution: board.ball.restitution,
      ballFriction: board.ball.friction,
      maxVelocity: board.ball.maxVelocity,
    },
    launcherConfig: {
      strength: board.launcher.strength,
      positionMillimeters: board.launcher.position,
      angleDegrees: board.launcher.angleDegrees,
      varianceDegrees: board.launcher.angleJitterDegrees,
      minVelocity: board.launcher.minVelocity,
      maxVelocity: board.launcher.maxVelocity,
    },
    ...(overrides.heatmapCellSizeMillimeters === undefined ? {} : { heatmapCellSizeMillimeters: overrides.heatmapCellSizeMillimeters }),
    ...(overrides.collectTrajectories === undefined ? {} : { collectTrajectories: overrides.collectTrajectories }),
  };
}

export async function runExperiment(boardInput: BoardDefinition, config: ExperimentConfig, timestamp = new Date().toISOString()): Promise<ExperimentResult> {
  if (boardInput.version !== config.boardVersion) throw new Error(`Board version mismatch: ${boardInput.version} !== ${config.boardVersion}`);
  const physics = config.physicsConfig;
  const launcher = config.launcherConfig;
  const board = parseBoard({
    ...boardInput,
    physics: {
      ...boardInput.physics,
      gravity: physics.gravity,
      gravityScale: physics.gravityScale,
      physicsHz: physics.physicsHz,
      substeps: physics.substeps,
      ccdEnabled: physics.ccdEnabled,
      linearDamping: physics.linearDamping,
      angularDamping: physics.angularDamping,
    },
    ball: {
      ...boardInput.ball,
      diameter: physics.ballRadiusMillimeters * 2,
      massGrams: physics.ballMassGrams,
      restitution: physics.ballRestitution,
      friction: physics.ballFriction,
      maxVelocity: physics.maxVelocity,
    },
    launcher: {
      ...boardInput.launcher,
      position: launcher.positionMillimeters,
      strength: launcher.strength,
      angleDegrees: launcher.angleDegrees,
      angleJitterDegrees: launcher.varianceDegrees,
      minVelocity: launcher.minVelocity,
      maxVelocity: launcher.maxVelocity,
    },
  });
  const metrics = await runBatch({
    board,
    balls: config.balls,
    seed: config.seed,
    launchPower: launcher.strength,
    fireRate: config.fireRate,
    physicsHz: physics.physicsHz,
    substeps: physics.substeps,
    ccdEnabled: physics.ccdEnabled,
    ...(config.heatmapCellSizeMillimeters === undefined ? {} : { heatmapCellSizeMillimeters: config.heatmapCellSizeMillimeters }),
    ...(config.collectTrajectories === undefined ? {} : { collectTrajectories: config.collectTrajectories }),
  });
  return { metrics, configHash: sha256(config), boardHash: boardGeometryHash(boardInput), timestamp };
}

export async function saveExperimentResult(path: string, result: ExperimentResult): Promise<void> {
  await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

export function compareExperimentResults(before: ExperimentResult, after: ExperimentResult): ExperimentComparison {
  return {
    beforeBoardHash: before.boardHash,
    afterBoardHash: after.boardHash,
    beforeConfigHash: before.configHash,
    afterConfigHash: after.configHash,
    delta: {
      startRate: after.metrics.startRate - before.metrics.startRate,
      outRate: after.metrics.outRate - before.metrics.outRate,
      averageLifetime: after.metrics.averageLifetime - before.metrics.averageLifetime,
      averageCollisionCount: after.metrics.averageCollisionCount - before.metrics.averageCollisionCount,
      averageVelocity: after.metrics.averageVelocity - before.metrics.averageVelocity,
      maxVelocity: after.metrics.maxVelocity - before.metrics.maxVelocity,
    },
  };
}
