import { describe, expect, it } from "vitest";
import { createAutoFireCommands, REALISTIC_FIRE_RATE } from "./index.js";

describe("auto fire", () => {
  it("separates realistic fire rate from power and schedules in physics time", () => {
    const commands = createAutoFireCommands({ physicsHz: 240, fireRate: REALISTIC_FIRE_RATE, power: 0.68, startTick: 10, count: 3 });
    expect(commands.map((command) => command.tick)).toEqual([10, 154, 298]);
    expect(commands.every((command) => command.power === 0.68)).toBe(true);
  });
});
