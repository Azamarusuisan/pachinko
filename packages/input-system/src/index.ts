import type { InputCommand } from "@pachinko/physics-core";

export const FIRE_RATE_PRESETS = [25, 50, 75, 100] as const;
export const REALISTIC_FIRE_RATE = 100;
export type FireRate = typeof FIRE_RATE_PRESETS[number];

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
  return Array.from({ length: options.count }, (_, index) => ({
    type: "launch" as const,
    tick: options.startTick + index * intervalTicks,
    sequence: sequence + index,
    power: options.power,
  }));
}

export interface InputLogStore {
  save(key: string, commands: readonly InputCommand[]): Promise<void>;
  load(key: string): Promise<readonly InputCommand[]>;
}
