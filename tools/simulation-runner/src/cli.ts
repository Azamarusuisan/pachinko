import { runBatch } from "./index.js";
import { loadBoard } from "./load-board.js";

function argument(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  const raw = index >= 0 ? process.argv[index + 1] : undefined;
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`Invalid --${name}: ${raw}`);
  return value;
}

const balls = argument("balls", 100);
const seed = argument("seed", 123456);
const launchPower = argument("power", 0.68);
const fireRate = argument("fire-rate", 100);
const physicsHz = argument("physics-hz", 240);
if (![25, 50, 75, 100].includes(fireRate)) throw new Error("--fire-rate must be 25, 50, 75, or 100");
if (![120, 240, 480].includes(physicsHz)) throw new Error("--physics-hz must be 120, 240, or 480");

const metrics = await runBatch({
  board: await loadBoard(), balls, seed, launchPower,
  fireRate: fireRate as 25 | 50 | 75 | 100,
  physicsHz: physicsHz as 120 | 240 | 480,
});
process.stdout.write(`${JSON.stringify(metrics, null, 2)}\n`);
