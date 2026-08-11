import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AudioRegistry, EffectRegistry, effectManifestSchema, runtimeAssetManifestSchema } from "./index.js";

describe("effect manifests", () => {
  it("validates and indexes lazy asset metadata", () => {
    const registry = new EffectRegistry();
    const manifest = registry.register({ id: "reach_023", type: "VIDEO", path: "effects/reach/reach_023.webm", durationMs: 15000, priority: 40, preload: false, tags: ["reach", "high_chance"] });
    expect(effectManifestSchema.parse(manifest).id).toBe("reach_023");
    expect(registry.findByTag("reach")).toEqual([manifest]);
  });
  it("keeps audio files behind manifest metadata", () => {
    const registry = new AudioRegistry();
    const nail = registry.register({ id: "nail_hit_02", path: "audio/nails/nail_hit_02.wav", preload: true, priority: 10, cooldownMs: 12, maxConcurrency: 8, group: "nails", tags: ["nail.hit"] });
    expect(nail).toMatchObject({ id: "nail_hit_02", priority: 10, cooldownMs: 12, maxConcurrency: 8 });
    expect(registry.values()).toEqual([nail]);
  });
  it("rejects duplicate runtime paths and verifies the current release assets", () => {
    const asset = { path: "/assets/a.png", purpose: "test", source: "test fixture", provenanceStatus: "verified", licenseStatus: "verified", sha256: "a".repeat(64) } as const;
    expect(runtimeAssetManifestSchema.safeParse({ version: 1, assets: [asset, asset] }).success).toBe(false);

    const cwd = fileURLToPath(new URL("../../../", import.meta.url));
    const dev = spawnSync(process.execPath, ["--import", "tsx", "tools/verify-assets.mjs"], { cwd, encoding: "utf8" });
    expect(dev.status, dev.stderr).toBe(0);
    expect(dev.stdout).toMatch(/3 files, 3 static references, 3 distributable assets/);

    const release = spawnSync(process.execPath, ["--import", "tsx", "tools/verify-assets.mjs", "--release"], { cwd, encoding: "utf8" });
    expect(release.status, release.stderr).toBe(0);
  });
  it("rejects an unverified release manifest without depending on production state", async () => {
    const cwd = fileURLToPath(new URL("../../../", import.meta.url));
    const raw: unknown = JSON.parse(await readFile(join(cwd, "apps/simulator/public/assets/runtime-assets.json"), "utf8"));
    const manifest = runtimeAssetManifestSchema.parse(raw);
    const unverified = { ...manifest, assets: manifest.assets.map((asset, index) => index === 0 ? { ...asset, provenanceStatus: "unverified" as const } : asset) };
    const directory = await mkdtemp(join(tmpdir(), "pachinko-assets-"));
    const fixture = join(directory, "runtime-assets.json");
    await writeFile(fixture, JSON.stringify(unverified));
    try {
      const release = spawnSync(process.execPath, ["--import", "tsx", "tools/verify-assets.mjs", "--release", "--manifest", fixture], { cwd, encoding: "utf8" });
      expect(release.status).toBe(1);
      expect(release.stderr).toMatch(/1 asset\(s\) have unverified provenance or license status/);
      expect(release.stderr).not.toMatch(/missing from manifest/);
    } finally {
      await rm(directory, { recursive: true });
    }
  });
  it("rejects a distributable file that is absent from the manifest", async () => {
    const path = fileURLToPath(new URL("../../../apps/simulator/public/assets/__asset-verifier-test.bin", import.meta.url));
    await writeFile(path, "test-only");
    try {
      const release = spawnSync(process.execPath, ["--import", "tsx", "tools/verify-assets.mjs", "--release"], { cwd: fileURLToPath(new URL("../../../", import.meta.url)), encoding: "utf8" });
      expect(release.status).toBe(1);
      expect(release.stderr).toContain("Distributable asset is missing from manifest: /assets/__asset-verifier-test.bin");
    } finally {
      await unlink(path);
    }
  });
});
