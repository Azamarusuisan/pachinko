import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createGoldenBaseline } from "./golden.js";
import { runBatch } from "./index.js";
import { loadBoard } from "./load-board.js";

const board = await loadBoard();
const metrics = await runBatch({ board, balls: 1000, seed: 123456, launchPower: 0.68, fireRate: 100, physicsHz: 240, ccdEnabled: true });
const baseline = createGoldenBaseline(metrics, new Date().toISOString());
const target = new URL("../golden/eva15_v2_seed123456_1000.json", import.meta.url);
await mkdir(fileURLToPath(new URL("../golden/", import.meta.url)), { recursive: true });
await writeFile(fileURLToPath(target), `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ target: fileURLToPath(target), metrics }, null, 2)}\n`);
