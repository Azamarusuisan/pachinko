import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, mkdir, readFile, readdir, readlink, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, boardGeometryHash, createExperimentConfig, runExperiment, sha256 } from "./experiment.js";
import { loadBoard, prototypeBoardUrl } from "./load-board.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const defaultOutput = resolve(repoRoot, "docs/baseline-report.json");
const defaultNojiru = resolve(repoRoot, "../nojiru");

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : resolve(process.argv[index + 1] ?? fallback);
}

function git(repo: string, args: readonly string[]): Buffer {
  return execFileSync("git", ["-C", repo, ...args], { maxBuffer: 128 * 1024 * 1024 });
}

const hashBytes = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");

async function directoryInventory(root: string, directory = root): Promise<readonly { path: string; bytes: number; sha256: string }[]> {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await directoryInventory(root, absolute));
    else {
      const info = await lstat(absolute);
      const bytes = info.isSymbolicLink() ? Buffer.from(await readlink(absolute)) : await readFile(absolute);
      files.push({ path: relative(root, absolute).replaceAll("\\", "/"), bytes: bytes.byteLength, sha256: hashBytes(bytes) });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function assetInventory(path: string, includeFiles = true) {
  const files = await directoryInventory(path);
  return {
    path: relative(repoRoot, path).replaceAll("\\", "/"),
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    inventorySha256: sha256(files),
    ...(includeFiles ? { files } : {}),
  };
}

async function worktree(repo: string, excludedPaths: readonly string[] = []) {
  const excluded = new Set(excludedPaths);
  const trackedPatch = git(repo, ["diff", "--full-index", "HEAD", "--", ".", ...excludedPaths.map((path) => `:(exclude)${path}`)]);
  const untrackedPaths = git(repo, ["ls-files", "--others", "--exclude-standard", "-z"])
    .toString("utf8").split("\0").filter((path) => path.length > 0 && !excluded.has(path)).sort();
  const untracked = [];
  const identity = createHash("sha256").update("tracked\0").update(trackedPatch);
  for (const path of untrackedPaths) {
    const absolute = resolve(repo, path);
    const info = await lstat(absolute);
    const bytes = info.isSymbolicLink() ? Buffer.from(await readlink(absolute)) : await readFile(absolute);
    const fileHash = hashBytes(bytes);
    untracked.push({ path, sha256: fileHash });
    identity.update("\0untracked\0").update(path).update("\0").update(fileHash);
  }
  const changes = git(repo, ["status", "--short", "--untracked-files=all"])
    .toString("utf8").trimEnd().split("\n").filter((line) => line.length > 0 && ![...excluded].some((path) => line.endsWith(path)));
  return {
    clean: changes.length === 0,
    dirtyTreeSha256: identity.digest("hex"),
    trackedPatchSha256: hashBytes(trackedPatch),
    changes,
    untracked,
    excludedPaths,
  };
}

async function sourceSnapshot(repo: string, excludedPaths: readonly string[] = []) {
  const excluded = new Set(excludedPaths);
  const paths = new Set([
    ...git(repo, ["ls-files", "-z"]).toString("utf8").split("\0"),
    ...git(repo, ["ls-files", "--others", "--exclude-standard", "-z"]).toString("utf8").split("\0"),
  ].filter((path) => path.length > 0 && !excluded.has(path)));
  const identity = createHash("sha256");
  for (const path of [...paths].sort()) {
    const absolute = resolve(repo, path);
    const info = await lstat(absolute);
    const bytes = info.isSymbolicLink() ? Buffer.from(await readlink(absolute)) : await readFile(absolute);
    identity.update(path).update("\0").update(bytes).update("\0");
  }
  return { fileCount: paths.size, sha256: identity.digest("hex") };
}

async function repository(repo: string, path: string, excludedPaths: readonly string[] = []) {
  return {
    path,
    origin: git(repo, ["remote", "get-url", "origin"]).toString("utf8").trim(),
    branch: git(repo, ["branch", "--show-current"]).toString("utf8").trim(),
    head: git(repo, ["rev-parse", "HEAD"]).toString("utf8").trim(),
    worktree: await worktree(repo, excludedPaths),
  };
}

async function createReport(generatedAt: string, output: string, nojiruPath: string) {
  const outputRelative = relative(repoRoot, output).replaceAll("\\", "/");
  const board = await loadBoard();
  const experimentConfig = createExperimentConfig(board, { balls: 1000, seed: 123456, fireRate: 100 });
  const result = await runExperiment(board, experimentConfig, generatedAt);
  const { wallClockMilliseconds: _wallClockMilliseconds, ...deterministicMetrics } = result.metrics;
  void _wallClockMilliseconds;
  const boardRaw = await readFile(fileURLToPath(prototypeBoardUrl));
  const lockfile = await readFile(resolve(repoRoot, "package-lock.json"));
  return {
    schemaVersion: 3,
    generatedAt,
    classification: "DETERMINISTIC_REGRESSION_BASELINE_NOT_REAL_MACHINE_CALIBRATION",
    regenerateCommand: "npm run baseline:generate",
    verifyCommand: "npm run baseline:check",
    pachinko: {
      path: ".",
      origin: git(repoRoot, ["remote", "get-url", "origin"]).toString("utf8").trim(),
      sourceSnapshot: await sourceSnapshot(repoRoot, [outputRelative]),
    },
    nojiru: await repository(nojiruPath, "external:nojiru"),
    inputs: {
      boardPath: relative(repoRoot, fileURLToPath(prototypeBoardUrl)).replaceAll("\\", "/"),
      boardRawSha256: hashBytes(boardRaw),
      boardCanonicalSha256: sha256(board),
      boardGeometrySha256: boardGeometryHash(board),
      physicsConfigSha256: sha256(experimentConfig.physicsConfig),
      launcherConfigSha256: sha256(experimentConfig.launcherConfig),
      experimentConfigSha256: sha256(experimentConfig),
      packageLockSha256: hashBytes(lockfile),
    },
    assetBoundary: {
      publicRuntime: await assetInventory(resolve(repoRoot, "apps/simulator/public/assets")),
      researchQuarantine: await assetInventory(resolve(repoRoot, "research-data/runtime-quarantine/public-assets"), false),
      localResearchAudio: await assetInventory(resolve(repoRoot, "research-data/local-audio"), false),
    },
    experiment: {
      config: experimentConfig,
      result: {
        configHash: result.configHash,
        boardHash: result.boardHash,
        timestamp: result.timestamp,
        metrics: deterministicMetrics,
      },
    },
  };
}

const output = argument("output", defaultOutput);
const nojiruPath = argument("nojiru", defaultNojiru);
const check = process.argv.includes("--check");
const expected = check ? JSON.parse(await readFile(output, "utf8")) as { generatedAt?: unknown } : null;
let generatedAt = new Date().toISOString();
if (check) {
  if (typeof expected?.generatedAt !== "string") throw new Error(`Invalid baseline report: ${output}`);
  generatedAt = expected.generatedAt;
}
const report = await createReport(generatedAt, output, nojiruPath);

if (check) {
  if (canonicalJson(report) !== canonicalJson(expected)) throw new Error(`Baseline drift detected: ${output}`);
  process.stdout.write(`Baseline matches ${output}\n`);
} else {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ output, sourceSnapshotSha256: report.pachinko.sourceSnapshot.sha256, boardRawSha256: report.inputs.boardRawSha256, boardGeometrySha256: report.inputs.boardGeometrySha256, physicsConfigSha256: report.inputs.physicsConfigSha256, experimentConfigSha256: report.inputs.experimentConfigSha256, nojiruHead: report.nojiru.head, metrics: { startRate: report.experiment.result.metrics.startRate, outRate: report.experiment.result.metrics.outRate, averageLifetime: report.experiment.result.metrics.averageLifetime, averageCollisionCount: report.experiment.result.metrics.averageCollisionCount, maxVelocity: report.experiment.result.metrics.maxVelocity, timeoutCount: report.experiment.result.metrics.timeoutCount, remainingBodies: report.experiment.result.metrics.remainingBodies } }, null, 2)}\n`);
}
