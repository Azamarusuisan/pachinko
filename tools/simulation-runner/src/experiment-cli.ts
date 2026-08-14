import { resolve } from "node:path";
import { createExperimentConfig, runExperiment, saveExperimentResult } from "./experiment.js";
import { loadBoard } from "./load-board.js";

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

const board = await loadBoard();
const balls = Number(argument("balls", "1000"));
const seed = Number(argument("seed", "123456"));
const cellSize = Number(argument("heatmap-cell-mm", "25"));
const output = resolve(argument("output", `experiment-${board.version}-${balls}.json`));
const config = createExperimentConfig(board, { balls, seed, heatmapCellSizeMillimeters: cellSize });
const result = await runExperiment(board, config);
await saveExperimentResult(output, result);
const metrics = result.metrics;
process.stdout.write(`${JSON.stringify({
  output, configHash: result.configHash, boardHash: result.boardHash,
  metrics: {
    totalBalls: metrics.totalBalls, startRate: metrics.startRate, outRate: metrics.outRate,
    averageLifetime: metrics.averageLifetime, averageCollisionCount: metrics.averageCollisionCount,
    averageVelocity: metrics.averageVelocity, maxVelocity: metrics.maxVelocity,
    timeoutCount: metrics.timeoutCount, remainingBodies: metrics.remainingBodies,
  },
}, null, 2)}\n`);
