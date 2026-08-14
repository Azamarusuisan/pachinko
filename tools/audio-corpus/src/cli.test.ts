import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { stableSplit } from "./index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const temporaryDirectories: string[] = [];
interface ValidationReport {
  readonly audioObservationRows: number;
  readonly uniqueAudioObservations: number;
  readonly targetAudioObservations: number;
  readonly complete: boolean;
  readonly problems: Readonly<Record<string, { readonly count: number }>>;
}

afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

async function fixture(featureOverrides: Record<string, unknown> = {}, sourceOverrides: Record<string, unknown> = {}) {
  const directory = await mkdtemp(join(tmpdir(), "pachinko-corpus-"));
  temporaryDirectories.push(directory);
  const media = join(directory, "source.wav");
  const bytes = Buffer.from("deterministic test audio");
  await writeFile(media, bytes);
  const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
  const source = {
    id: "source-1", domain: "pachinko", mediaType: "audio", eventType: "nail_hit", datasetRole: "generic-dsp",
    rights: "cleared", rightsVerification: "verified", provenance: "first-party", localPath: media,
    licenseName: "test fixture", capturedAt: "2026-08-11T00:00:00+09:00", sha256: sourceSha256, rewardLevel: 0, tags: [],
    ...sourceOverrides,
  };
  const feature = {
    id: "source-1:00000000", sourceId: source.id, sourceSha256, domain: source.domain, eventType: source.eventType,
    datasetRole: source.datasetRole, rewardLevel: 0, split: stableSplit(sourceSha256), startMs: 0, durationMs: 500,
    frameCount: 1, rights: source.rights, licenseName: source.licenseName, tags: [], ...featureOverrides,
  };
  const manifest = join(directory, "sources.ndjson");
  const features = join(directory, "features.ndjson");
  await writeFile(manifest, `${JSON.stringify(source)}\n`);
  await writeFile(features, `${JSON.stringify(feature)}\n`);
  return { directory, media, manifest, features };
}

function validate(manifest: string, features: string, target = 1) {
  const result = spawnSync(process.execPath, ["--import", "tsx", "tools/audio-corpus/src/cli.ts", "validate", "--manifest", manifest, "--features", features, "--target-audio", String(target), "--require-local-media"], { cwd: root, encoding: "utf8" });
  return { ...result, report: JSON.parse(result.stdout) as ValidationReport };
}

describe("corpus validator", () => {
  it("fails instead of calling an undersized corpus complete", async () => {
    const data = await fixture();
    const result = validate(data.manifest, data.features, 100_000);
    expect(result.status, result.stderr).toBe(2);
    expect(result.report).toMatchObject({ audioObservationRows: 1, uniqueAudioObservations: 1, targetAudioObservations: 100_000, complete: false });
  });

  it("checks manifest domain, event, source hash, and source-level split", async () => {
    const data = await fixture({ domain: "pachislot", eventType: "confirm", sourceSha256: "b".repeat(64), split: "validation" });
    const result = validate(data.manifest, data.features);
    expect(result.status, result.stderr).toBe(2);
    expect(result.report.problems).toMatchObject({
      domainMismatches: { count: 1 }, eventMismatches: { count: 1 }, sourceHashMismatches: { count: 1 },
    });
  });

  it("hashes the local file instead of trusting manifest metadata", async () => {
    const data = await fixture();
    await writeFile(data.media, "changed after manifest creation");
    const result = validate(data.manifest, data.features);
    expect(result.status, result.stderr).toBe(2);
    expect(result.report.problems.hashMismatches?.count).toBe(1);
  });

  it("requires a revision for generated reference data", async () => {
    const data = await fixture({ datasetRole: "generated-reference" }, { datasetRole: "generated-reference" });
    const result = validate(data.manifest, data.features);
    expect(result.status, result.stderr).toBe(2);
    expect(result.report.problems.missingGeneratedReferenceRevisions?.count).toBe(1);
  });
});
