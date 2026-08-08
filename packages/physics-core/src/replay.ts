import type { BoardDefinition } from "@pachinko/board-schema";
import { PachinkoPhysicsEngine } from "./engine.js";
import { PHYSICS_VERSION, type InputCommand, type ReplayLog } from "./types.js";

export function assertReplayCompatible(board: BoardDefinition, replay: ReplayLog): void {
  if (replay.boardVersion !== board.version) throw new Error(`Board version mismatch: ${replay.boardVersion} !== ${board.version}`);
  if (replay.physicsVersion !== PHYSICS_VERSION) throw new Error(`Physics version mismatch: ${replay.physicsVersion} !== ${PHYSICS_VERSION}`);
  let previous: InputCommand | undefined;
  for (const command of replay.inputSequence) {
    if (command.tick < 0 || !Number.isInteger(command.tick) || !Number.isInteger(command.sequence) || command.power < 0 || command.power > 1) {
      throw new Error("Replay contains an invalid input command");
    }
    if (previous !== undefined && (command.tick < previous.tick || (command.tick === previous.tick && command.sequence <= previous.sequence))) {
      throw new Error("Replay input commands must be strictly ordered by tick and sequence");
    }
    previous = command;
  }
}

export async function createReplayEngine(board: BoardDefinition, replay: ReplayLog): Promise<PachinkoPhysicsEngine> {
  assertReplayCompatible(board, replay);
  const engine = await PachinkoPhysicsEngine.create({ board, seed: replay.seed });
  for (const command of replay.inputSequence) engine.schedule(command);
  return engine;
}

export function serializeReplay(replay: ReplayLog): string {
  return `${JSON.stringify(replay, null, 2)}\n`;
}

export function parseReplay(json: string): ReplayLog {
  const input: unknown = JSON.parse(json);
  if (typeof input !== "object" || input === null) throw new Error("Replay must be an object");
  const record = input as Record<string, unknown>;
  if (typeof record.boardVersion !== "string" || typeof record.physicsVersion !== "string" || typeof record.seed !== "number" || !Array.isArray(record.inputSequence)) {
    throw new Error("Replay header is invalid");
  }
  const inputSequence: InputCommand[] = record.inputSequence.map((value) => {
    if (typeof value !== "object" || value === null) throw new Error("Replay command must be an object");
    const command = value as Record<string, unknown>;
    if (command.type !== "launch" || typeof command.tick !== "number" || typeof command.sequence !== "number" || typeof command.power !== "number") {
      throw new Error("Replay command is invalid");
    }
    return { type: "launch", tick: command.tick, sequence: command.sequence, power: command.power };
  });
  return { boardVersion: record.boardVersion, physicsVersion: record.physicsVersion, seed: record.seed, inputSequence };
}
