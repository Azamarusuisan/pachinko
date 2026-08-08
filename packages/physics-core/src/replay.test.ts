import { describe, expect, it } from "vitest";
import { makeTestBoard } from "./test-board.js";
import { assertReplayCompatible, parseReplay, serializeReplay } from "./replay.js";
import { PHYSICS_VERSION, type ReplayLog } from "./types.js";

const replay: ReplayLog = {
  boardVersion: "1", physicsVersion: PHYSICS_VERSION, seed: 123456,
  inputSequence: [{ type: "launch", tick: 0, sequence: 0, power: 0.68 }, { type: "launch", tick: 144, sequence: 1, power: 0.68 }],
};

describe("replay format", () => {
  it("round-trips and checks all compatibility keys", () => {
    const parsed = parseReplay(serializeReplay(replay));
    expect(parsed).toEqual(replay);
    expect(() => assertReplayCompatible(makeTestBoard(), parsed)).not.toThrow();
    expect(() => assertReplayCompatible(makeTestBoard({ version: "2" }), parsed)).toThrow("Board version mismatch");
    expect(() => assertReplayCompatible(makeTestBoard(), { ...parsed, physicsVersion: "other" })).toThrow("Physics version mismatch");
  });

  it("rejects unordered or invalid commands", () => {
    expect(() => assertReplayCompatible(makeTestBoard(), { ...replay, inputSequence: [...replay.inputSequence].reverse() })).toThrow("strictly ordered");
    expect(() => parseReplay("{}")).toThrow("header");
  });
});
