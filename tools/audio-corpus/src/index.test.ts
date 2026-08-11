import { describe, expect, it } from "vitest";
import {
  MEDIA_DOMAINS,
  aggregateFeatureFrames,
  buildCorpusPlan,
  canRedistribute,
  imageObservationSchema,
  parseFfmpegMetadata,
  sourceRecordSchema,
  stableSplit,
  stratifiedFeatureSample,
} from "./index.js";

const source = sourceRecordSchema.parse({
  id: "licensed-pachinko-01",
  domain: "pachinko",
  mediaType: "audio",
  eventType: "confirm",
  rights: "cc-by",
  rightsVerification: "verified",
  provenance: "licensed-third-party",
  sourceUrl: "https://example.com/audio/1",
  localPath: "reference/licensed-pachinko-01.wav",
  licenseName: "CC BY 4.0",
  attribution: "Example Artist",
  capturedAt: "2026-08-11T00:00:00+09:00",
  sha256: "a".repeat(64),
  rewardLevel: 4,
  tags: ["high-pitch"],
});

describe("corpus plan", () => {
  it("allocates exactly 100k audio observations and 100 images", () => {
    const plan = buildCorpusPlan();
    expect(Object.values(plan.audioByDomain).reduce((sum, item) => sum + item, 0)).toBe(100_000);
    expect(Object.values(plan.imagesByDomain).reduce((sum, item) => sum + item, 0)).toBe(100);
    const eventTotal = MEDIA_DOMAINS.reduce((sum, domain) => sum + Object.values(plan.audioByEvent[domain]).reduce((eventSum, item) => eventSum + (item ?? 0), 0), 0);
    expect(eventTotal).toBe(100_000);
    expect(plan.approximateSourceHours).toBeCloseTo(13.8889, 3);
  });
});

describe("source rights", () => {
  it("requires attribution and keeps observation-only media out of redistributable assets", () => {
    expect(() => sourceRecordSchema.parse({ ...source, attribution: undefined })).toThrow();
    const observation = sourceRecordSchema.parse({ ...source, id: "reference-only", rights: "research-only", rightsVerification: "observed", provenance: "observation-only", attribution: undefined });
    expect(canRedistribute(source)).toBe(true);
    expect(canRedistribute(observation)).toBe(false);
  });
});

describe("image observations", () => {
  it("records the visual grammar needed for the 100-photo study", () => {
    const observation = imageObservationSchema.parse({
      id: "image-observation-001",
      sourceId: "licensed-image-001",
      domain: "pachislot",
      effectType: "hot",
      split: "train",
      dominantColors: ["red", "gold"],
      luminanceTier: 5,
      textTreatments: ["extruded", "gold-edge", "moving-shine"],
      screenCoverage: 0.72,
      cabinetLightCoverage: 0.38,
      pushVisible: true,
      holdColor: "red",
      tags: ["high-contrast"],
    });
    expect(observation).toMatchObject({ effectType: "hot", luminanceTier: 5, pushVisible: true });
  });
});

describe("ffmpeg metadata", () => {
  it("parses frames, aggregates fixed windows, and splits deterministically", () => {
    const frames = parseFfmpegMetadata([
      "frame:0 pts:0 pts_time:0",
      "lavfi.astats.Overall.Peak_level=-3",
      "lavfi.astats.Overall.RMS_level=-12",
      "lavfi.r128.M=-14",
      "lavfi.aspectralstats.1.centroid=1200",
      "lavfi.aspectralstats.1.flux=0.2",
      "frame:1 pts:1024 pts_time:0.064",
      "lavfi.astats.Overall.Peak_level=-6",
      "lavfi.astats.Overall.RMS_level=-18",
      "lavfi.r128.M=-20",
      "lavfi.aspectralstats.1.centroid=1800",
      "lavfi.aspectralstats.1.flux=0.4",
      "frame:2 pts:8192 pts_time:0.512",
      "lavfi.astats.Overall.Peak_level=-9",
    ].join("\n"));
    expect(frames).toHaveLength(3);
    const observations = aggregateFeatureFrames(source, frames, 500);
    expect(observations).toHaveLength(2);
    const first = observations[0];
    expect(first).toBeDefined();
    if (first === undefined) throw new Error("missing first observation");
    expect(first).toMatchObject({ peakDbfs: -3, spectralCentroidHz: 1500, frameCount: 2 });
    expect(first.spectralFlux).toBeCloseTo(0.3, 10);
    expect(first.rmsDbfs).toBeGreaterThan(-18);
    expect(first.rmsDbfs).toBeLessThan(-12);
    expect(stableSplit(first.id)).toBe(stableSplit(first.id));
  });

  it("keeps every window and duplicate source id with the same bytes in one split", () => {
    const duplicate = sourceRecordSchema.parse({ ...source, id: "same-bytes-another-id" });
    const frames = [{ timeSeconds: 0 }, { timeSeconds: 0.6 }];
    const original = aggregateFeatureFrames(source, frames);
    const copied = aggregateFeatureFrames(duplicate, frames);
    expect(new Set([...original, ...copied].map((row) => row.split))).toEqual(new Set([stableSplit("a".repeat(64))]));
  });

  it("samples domain/event quotas round-robin instead of taking the manifest head", () => {
    const firstSource = sourceRecordSchema.parse({ ...source, id: "nail-a", eventType: "nail_hit", sha256: "a".repeat(64) });
    const secondSource = sourceRecordSchema.parse({ ...source, id: "nail-b", eventType: "nail_hit", sha256: "b".repeat(64) });
    const frames = Array.from({ length: 10 }, (_, index) => ({ timeSeconds: index * 0.5 }));
    const sampled = stratifiedFeatureSample([
      ...aggregateFeatureFrames(firstSource, frames),
      ...aggregateFeatureFrames(secondSource, frames),
    ], 100);
    expect(sampled).toHaveLength(buildCorpusPlan(100).audioByEvent.pachinko.nail_hit ?? 0);
    expect(sampled.slice(0, 2).map((row) => row.sourceSha256)).toEqual(["a".repeat(64), "b".repeat(64)]);
  });

  it("rejects feature extraction while rights are unknown", () => {
    const unknown = sourceRecordSchema.parse({ ...source, id: "unknown", rights: "unknown", rightsVerification: "observed", provenance: "first-party", attribution: undefined });
    expect(() => aggregateFeatureFrames(unknown, [{ timeSeconds: 0 }])).toThrow("unknown rights");
  });
});
