import type { BoardDefinition } from "@pachinko/board-schema";
import type { InputCommand } from "@pachinko/physics-core";

export const FIRE_RATE_PRESETS = [25, 50, 75, 100] as const;
export const REALISTIC_FIRE_RATE = 100;
export type FireRate = typeof FIRE_RATE_PRESETS[number];

export interface LauncherConfig {
  readonly strength: number;
  readonly positionMillimeters: { readonly x: number; readonly y: number };
  readonly angleDegrees: number;
  readonly varianceDegrees: number;
  readonly minVelocity: number;
  readonly maxVelocity: number;
}

export function launcherConfigFromBoard(board: BoardDefinition, strength = board.launcher.strength): LauncherConfig {
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) throw new Error("Launcher strength must be between 0 and 1");
  return {
    strength,
    positionMillimeters: board.launcher.position,
    angleDegrees: board.launcher.angleDegrees,
    varianceDegrees: board.launcher.angleJitterDegrees,
    minVelocity: board.launcher.minVelocity,
    maxVelocity: board.launcher.maxVelocity,
  };
}

export function createLaunchCommand(launcher: Pick<LauncherConfig, "strength">, tick: number, sequence: number): InputCommand {
  return { type: "launch", tick, sequence, power: launcher.strength };
}

export interface AutoFireOptions {
  readonly physicsHz: number;
  readonly fireRate: FireRate;
  readonly power: number;
  readonly startTick: number;
  readonly count: number;
  readonly startingSequence?: number;
}

export function createAutoFireCommands(options: AutoFireOptions): readonly InputCommand[] {
  const intervalTicks = Math.round(options.physicsHz * 60 / options.fireRate);
  const sequence = options.startingSequence ?? 0;
  const launcher = { strength: options.power };
  return Array.from({ length: options.count }, (_, index) => createLaunchCommand(launcher, options.startTick + index * intervalTicks, sequence + index));
}

export interface InputLogStore {
  save(key: string, commands: readonly InputCommand[]): Promise<void>;
  load(key: string): Promise<readonly InputCommand[]>;
}
