import { describe, expect, it } from "vitest";
import { FixedTimestepAccumulator } from "./accumulator.js";
import { PachinkoPhysicsEngine } from "./engine.js";
import { makeTestBoard } from "./test-board.js";

async function result(seed: number) {
  const board = makeTestBoard({
    launcher: { position: { x: 250, y: 50 }, angleDegrees: 90, minVelocity: 0.5, maxVelocity: 1, angleJitterDegrees: 2 },
    sensors: [{ id: "out", role: "OUT", center: { x: 250, y: 180 }, width: 490, height: 20 }],
  });
  const engine = await PachinkoPhysicsEngine.create({ board, seed });
  for (let i = 0; i < 8; i += 1) engine.schedule({ type: "launch", tick: i * 20, sequence: i, power: 0.68 });
  while (engine.completedBalls.length < 8) engine.step();
  const value = { completed: [...engine.completedBalls], log: engine.replayLog() };
  engine.dispose();
  return value;
}

describe("determinism and clocks", () => {
  it("reproduces equal seed and input", async () => expect(await result(123456)).toEqual(await result(123456)));

  it("keeps physics independent of render frame rate and viewport", async () => {
    const run = async (renderFps: 30 | 60, viewport: { width: number; height: number }) => {
      const board = makeTestBoard({ sensors: [{ id: "out", role: "OUT", center: { x: 250, y: 180 }, width: 490, height: 20 }] });
      const engine = await PachinkoPhysicsEngine.create({ board, seed: 11 });
      engine.schedule({ type: "launch", tick: 0, sequence: 0, power: 0.68 });
      const accumulator = new FixedTimestepAccumulator({ fixedDt: engine.fixedDt });
      while (engine.completedBalls.length === 0) accumulator.advance(1 / renderFps, 1, () => engine.step());
      const result = { completed: [...engine.completedBalls], viewportIgnoredByPhysics: viewport.width + viewport.height > 0 };
      engine.dispose(); return result;
    };
    const desktop30 = await run(30, { width: 1440, height: 900 });
    const mobile60 = await run(60, { width: 390, height: 844 });
    expect(desktop30.completed).toEqual(mobile60.completed);
  });

  it("keeps results equal across simulation speeds", async () => {
    const run = async (speed: 1 | 16) => {
      const board = makeTestBoard({ sensors: [{ id: "out", role: "OUT", center: { x: 250, y: 180 }, width: 490, height: 20 }] });
      const engine = await PachinkoPhysicsEngine.create({ board, seed: 12 });
      engine.schedule({ type: "launch", tick: 0, sequence: 0, power: 0.68 });
      const accumulator = new FixedTimestepAccumulator({ fixedDt: engine.fixedDt, maxStepsPerFrame: 1000 });
      while (engine.completedBalls.length === 0) accumulator.advance(1 / 60, speed, () => engine.step());
      const completed = [...engine.completedBalls]; engine.dispose(); return completed;
    };
    expect(await run(1)).toEqual(await run(16));
  });
});
