import { describe, expect, it } from "vitest";
import { createBoardTemplate } from "@pachinko/board-schema";
import { createAutoFireCommands, createLaunchCommand, launcherConfigFromBoard, REALISTIC_FIRE_RATE } from "./index.js";

describe("auto fire", () => {
  it("separates realistic fire rate from power and schedules in physics time", () => {
    const commands = createAutoFireCommands({ physicsHz: 240, fireRate: REALISTIC_FIRE_RATE, power: 0.68, startTick: 10, count: 3 });
    expect(commands.map((command) => command.tick)).toEqual([10, 154, 298]);
    expect(commands.every((command) => command.power === 0.68)).toBe(true);
  });

  it("creates launch commands from one resolved launcher config", () => {
    const original = createBoardTemplate();
    const board = createBoardTemplate({ launcher: { ...original.launcher, strength: 0.73, angleDegrees: -93, angleJitterDegrees: 0.25 } });
    const launcher = launcherConfigFromBoard(board);
    expect(launcher).toMatchObject({ strength: 0.73, angleDegrees: -93, varianceDegrees: 0.25 });
    expect(createLaunchCommand(launcher, 12, 3)).toEqual({ type: "launch", tick: 12, sequence: 3, power: 0.73 });
  });
});
