import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compareGolden, type GoldenBaseline } from "./golden.js";
import { runBatch } from "./index.js";
import { loadBoard } from "./load-board.js";
import { PHYSICS_VERSION } from "@pachinko/physics-core";

const baselineUrl = new URL("../golden/eva15_v2_9_seed123456_1000.json", import.meta.url);

describe("deterministic Golden simulation baseline", () => {
  it("stays within the committed simulation baseline", async () => {
    let baseline: GoldenBaseline;
    try { baseline = JSON.parse(await readFile(fileURLToPath(baselineUrl), "utf8")) as GoldenBaseline; }
    catch { throw new Error("Golden baseline is missing. Run npm run golden:update only after calibrating and reviewing actual output."); }
    const board = await loadBoard();
    expect(baseline.scenario.boardVersion).toBe(board.version);
    expect(baseline.scenario.physicsVersion).toBe(PHYSICS_VERSION);
    expect(baseline.scenario.substeps).toBe(board.physics.substeps);
    const metrics = await runBatch({ board, balls: 1000, seed: 123456, launchPower: 0.68, fireRate: 100, physicsHz: 240, ccdEnabled: true });
    expect(compareGolden(metrics, baseline)).toEqual([]);
  });
});
