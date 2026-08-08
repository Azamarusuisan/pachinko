import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const requiredFiles = [
  "docs/architecture.md", "docs/physics.md", "docs/board-format.md", "docs/testing.md", "docs/future-effects.md",
  "docs/implementation-plan.md", "docs/phase1-status.md",
  "packages/board-schema/src/index.ts", "packages/event-system/src/index.ts", "packages/physics-core/src/index.ts",
  "packages/renderer-pixi/src/index.ts", "packages/input-system/src/index.ts", "packages/effect-system/src/index.ts",
  "packages/economy-core/src/index.ts", "tools/board-editor/src/index.ts", "tools/calibration/src/index.ts",
  "tools/simulation-runner/src/index.ts", "boards/prototype/eva15_inspired_physics_v1.json",
];

const failures = [];
for (const relative of requiredFiles) {
  try { if (!(await stat(resolve(root, relative))).isFile()) failures.push(`${relative}: not a file`); }
  catch { failures.push(`${relative}: missing`); }
}

const physicsSources = await Promise.all(["engine.ts", "types.ts", "accumulator.ts", "rng.ts", "replay.ts"].map(async (file) => readFile(resolve(root, "packages/physics-core/src", file), "utf8")));
const prohibitedPhysicsImports = ["react", "pixi", "three", "audio", "video", "supabase", "economy"];
for (const token of prohibitedPhysicsImports) {
  if (physicsSources.some((source) => new RegExp(`from [\\"'][^\\"']*${token}`, "i").test(source))) failures.push(`physics-core imports prohibited dependency: ${token}`);
}
if (physicsSources.some((source) => source.includes("Math.random"))) failures.push("physics-core uses Math.random");

const eventSource = await readFile(resolve(root, "packages/event-system/src/index.ts"), "utf8");
for (const event of ["ball.spawned", "ball.launched", "ball.collision", "nail.hit", "sensor.enter", "sensor.exit", "ball.out", "ball.destroyed"]) {
  if (!eventSource.includes(event)) failures.push(`missing event type: ${event}`);
}

const board = JSON.parse(await readFile(resolve(root, "boards/prototype/eva15_inspired_physics_v1.json"), "utf8"));
if (board.units !== "mm") failures.push("prototype board units must be mm");
if (board.reference?.kind !== "reference-based-approximation" || board.reference?.measured !== false) failures.push("prototype reference disclaimer missing");
if (!Array.isArray(board.nails) || board.nails.length === 0) failures.push("prototype has no nails");
if (!board.sensors?.some((sensor) => sensor.role === "START")) failures.push("prototype has no START sensor");
if (!board.sensors?.some((sensor) => sensor.role === "OUT")) failures.push("prototype has no OUT sensor");

const economy = await readFile(resolve(root, "packages/economy-core/src/index.ts"), "utf8");
if (!economy.includes("FEATURE_REAL_MONEY_REDEMPTION = false")) failures.push("real-money redemption default is not visibly false");

const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
for (const script of ["dev", "build", "test", "typecheck", "lint", "simulate:100", "simulate:1000", "simulate:10000", "golden:update"]) {
  if (typeof packageJson.scripts?.[script] !== "string") failures.push(`missing root script: ${script}`);
}

const result = { ok: failures.length === 0, checkedFiles: requiredFiles.length, prototypeNails: board.nails?.length ?? 0, failures };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failures.length > 0) process.exitCode = 1;
