import { describe, expect, it } from "vitest";
import { createBoardTemplate } from "@pachinko/board-schema";
import { boardGeometryHash, compareExperimentResults, createExperimentConfig, runExperiment, sha256 } from "./experiment.js";

describe("deterministic experiment records", () => {
  it("canonicalizes hashes regardless of object key order", () => {
    expect(sha256({ a: 1, b: 2 })).toBe(sha256({ b: 2, a: 1 }));
  });

  it("separates immutable board geometry from experiment parameters", () => {
    const board = createBoardTemplate();
    const physicsChange = createBoardTemplate({
      physics: { ...board.physics, gravityScale: 1.1 },
      launcher: { ...board.launcher, strength: 0.5 },
    });
    const geometryChange = createBoardTemplate({
      nails: [{ id: "n1", positionX: 250, positionY: 200, radius: 1.25, friction: 0.1, restitution: 0.5, enabled: true, group: "test" }],
    });
    expect(boardGeometryHash(physicsChange)).toBe(boardGeometryHash(board));
    expect(sha256(createExperimentConfig(physicsChange))).not.toBe(sha256(createExperimentConfig(board)));
    expect(boardGeometryHash(geometryChange)).not.toBe(boardGeometryHash(board));
  });

  it("repeats equal config, board, and metrics with a fixed timestamp", async () => {
    const board = createBoardTemplate({
      physics: { ...createBoardTemplate().physics, maxBallLifetimeSeconds: 0.2 },
      sensors: [{ id: "out", role: "OUT", center: { x: 250, y: 100 }, width: 500, height: 20 }],
    });
    const config = createExperimentConfig(board, { balls: 4, heatmapCellSizeMillimeters: 25 });
    const first = await runExperiment(board, config, "2026-08-10T00:00:00.000Z");
    const second = await runExperiment(board, config, "2026-08-10T00:00:00.000Z");
    expect({ ...second, metrics: { ...second.metrics, wallClockMilliseconds: 0 } })
      .toEqual({ ...first, metrics: { ...first.metrics, wallClockMilliseconds: 0 } });
    expect(first.configHash).toHaveLength(64);
    expect(first.boardHash).toHaveLength(64);
  });

  it("compares versioned parameter changes without conflating them with geometry", async () => {
    const beforeBoard = createBoardTemplate({ version: "v2" });
    const afterBoard = createBoardTemplate({ version: "v2.1", launcher: { ...createBoardTemplate().launcher, angleDegrees: -92 } });
    const before = await runExperiment(beforeBoard, createExperimentConfig(beforeBoard, { balls: 2 }), "2026-08-10T00:00:00.000Z");
    const after = await runExperiment(afterBoard, createExperimentConfig(afterBoard, { balls: 2 }), "2026-08-10T00:00:00.000Z");
    const comparison = compareExperimentResults(before, after);
    expect(comparison.beforeBoardHash).toBe(comparison.afterBoardHash);
    expect(comparison.beforeConfigHash).not.toBe(comparison.afterConfigHash);
    expect(Number.isFinite(comparison.delta.startRate)).toBe(true);
  });
});
