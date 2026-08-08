import { describe, expect, it } from "vitest";
import { AudioRegistry, EffectRegistry, effectManifestSchema } from "./index.js";

describe("effect manifests", () => {
  it("validates and indexes lazy asset metadata", () => {
    const registry = new EffectRegistry();
    const manifest = registry.register({ id: "reach_023", type: "VIDEO", path: "effects/reach/reach_023.webm", durationMs: 15000, priority: 40, preload: false, tags: ["reach", "high_chance"] });
    expect(effectManifestSchema.parse(manifest).id).toBe("reach_023");
    expect(registry.findByTag("reach")).toEqual([manifest]);
  });
  it("keeps audio files behind manifest metadata", () => {
    const registry = new AudioRegistry();
    expect(registry.register({ id: "nail_hit_02", path: "audio/nails/nail_hit_02.wav", preload: true, maxConcurrency: 8, group: "nails", tags: ["nail.hit"] }).id).toBe("nail_hit_02");
  });
});
