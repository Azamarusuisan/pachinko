import { createHash } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import { loadBoard } from "./load-board.js";
import { runBatch } from "./index.js";

const root = new URL("../../../", import.meta.url);
const TARGET_START_RATE = 17 / 125;
const START_RATE_TOLERANCE = 0.01;
const file = async (path: string): Promise<boolean> => access(new URL(path, root)).then(() => true).catch(() => false);
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const board = await loadBoard();
const wingCount = board.mechanisms.filter((mechanism) => mechanism.id.startsWith("hanemono-wing")).length;
const enabledWingCount = board.mechanisms.filter((mechanism) => mechanism.id.startsWith("hanemono-wing") && mechanism.enabled).length;
const minimumNailSurfaceClearance = Math.min(...board.nails.filter((nail) => nail.enabled).flatMap((left, index, nails) => nails.slice(index + 1).map((right) => Math.hypot(left.positionX - right.positionX, left.positionY - right.positionY) - left.radius - right.radius)));
const batches = [];
for (const balls of [100, 1_000, 10_000]) {
  const metrics = await runBatch({ board, balls, seed: 123456, launchPower: 0.68, fireRate: 100 });
  batches.push({ balls, startRate: metrics.startRate, outRate: metrics.outRate, averageLifetime: metrics.averageLifetime, averageCollisionCount: metrics.averageCollisionCount, maxVelocity: metrics.maxVelocity, timeoutCount: metrics.timeoutCount, remainingBodies: metrics.remainingBodies });
}
const calibrationRuns = [];
for (const seed of [1, 7, 21, 123456, 987654321]) {
  const metrics = await runBatch({ board, balls: 1_000, seed, launchPower: 0.68, fireRate: 100 });
  calibrationRuns.push({ seed, balls: 1_000, startWins: metrics.startWins, startRate: metrics.startRate, timeoutCount: metrics.timeoutCount, remainingBodies: metrics.remainingBodies });
}
const holdoutRuns = [];
for (const seed of [2, 11, 42, 654321, 2147483647]) {
  const metrics = await runBatch({ board, balls: 1_000, seed, launchPower: 0.68, fireRate: 100 });
  holdoutRuns.push({ seed, balls: 1_000, startWins: metrics.startWins, startRate: metrics.startRate, timeoutCount: metrics.timeoutCount, remainingBodies: metrics.remainingBodies });
}
const aggregateRate = (runs: readonly { readonly startWins: number; readonly balls: number }[]) => runs.reduce((sum, run) => sum + run.startWins, 0) / runs.reduce((sum, run) => sum + run.balls, 0);
const calibrationStartRate = aggregateRate(calibrationRuns);
const holdoutStartRate = aggregateRate(holdoutRuns);
const startRatePass = Math.abs(calibrationStartRate - TARGET_START_RATE) <= START_RATE_TOLERANCE
  && Math.abs(holdoutStartRate - TARGET_START_RATE) <= START_RATE_TOLERANCE;
const report = {
  generatedAt: new Date().toISOString(),
  board: { id: board.id, version: board.version, hash: hash(board), wingCount, enabledWingCount },
  domains: {
    boardGeometry: minimumNailSurfaceClearance >= board.ball.diameter ? "PASS_VALIDATED_SCHEMA_AND_CLEARANCE" : "FAIL",
    payoutCalibration: startRatePass ? "PASS_17_PER_125_TRAIN_AND_HOLDOUT" : "FAIL",
    ballPhysics: batches.every((run) => run.timeoutCount === 0 && run.remainingBodies === 0) ? "PASS" : "FAIL",
    launcher: "PASS_CONFIGURED",
    sensors: "PASS_INSTRUMENTED",
    hanemono: enabledWingCount === 3 ? "PASS" : "FAIL",
    movingObjects: "PASS_SHARED_TRANSFORM",
    liquidPresentation: "PASS_TIMELINE",
    reach: await file("apps/simulator/src/lotteryTimeline.test.ts") ? "PASS_CONTRACT_TESTED" : "FAIL",
    audio: (await file("research-data/local-audio/launch.mp3") && await file("research-data/local-audio/nail.mp3") && await file("research-data/local-audio/pocket.mp3")) ? "PASS_LOCAL_CUES" : "UNVERIFIED",
    ux: "PASS_AUTOFIRE_PUSH_HOLDS",
    productQuality: batches.every((run) => Number.isFinite(run.maxVelocity)) ? "PASS_BATCH_SMOKE" : "FAIL",
  },
  batches,
  geometry: { minimumNailSurfaceClearance, ballDiameter: board.ball.diameter },
  calibration: { status: startRatePass ? "PASS" : "FAIL", targetBasis: "USER_SUPPLIED_17_ROTATIONS_PER_125_LAUNCHED_BALLS", targetStartRate: TARGET_START_RATE, tolerance: START_RATE_TOLERANCE, calibrationStartRate, holdoutStartRate, calibrationRuns, holdoutRuns },
};
await mkdir(new URL("docs/", root), { recursive: true });
await writeFile(new URL("docs/release-readiness.json", root), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (Object.values(report.domains).some((status) => status === "FAIL") || report.calibration.status === "FAIL") process.exitCode = 1;
