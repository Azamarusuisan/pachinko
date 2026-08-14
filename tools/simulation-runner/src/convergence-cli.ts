import { runConvergence } from "./convergence.js";
import { loadBoard } from "./load-board.js";

function argument(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  const raw = index >= 0 ? process.argv[index + 1] : undefined;
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Invalid --${name}: ${raw}`);
  return value;
}

const board = await loadBoard();
const result = await runConvergence({
  board,
  balls: argument("balls", 100),
  seed: argument("seed", 123456),
  launchPower: argument("power", board.launcher.strength),
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.pass) process.exitCode = 1;
