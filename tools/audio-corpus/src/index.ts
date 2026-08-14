import { z } from "zod";

export const MEDIA_DOMAINS = ["pachinko", "pachislot", "online_slot"] as const;
export const EVENT_TYPES = [
  "unknown", "launch", "nail_hit", "pocket", "lever", "reel_spin", "reel_stop",
  "anticipation", "reach", "impact", "freeze", "push", "confirm", "near_miss",
  "jackpot", "payout", "bgm",
] as const;
export const VISUAL_EFFECT_TYPES = ["idle", "spin", "chance", "reach", "hot", "freeze", "push", "jackpot", "rush", "payout"] as const;
export const RIGHTS = ["cleared", "cc0", "cc-by", "cc-by-sa", "public-domain", "research-only", "unknown"] as const;
export const DATASET_ROLES = ["real-calibration", "generated-reference", "generic-dsp", "research-only"] as const;

export const sourceRecordSchema = z.strictObject({
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
  domain: z.enum(MEDIA_DOMAINS),
  mediaType: z.enum(["audio", "video", "image"]),
  eventType: z.enum(EVENT_TYPES).default("unknown"),
  datasetRole: z.enum(DATASET_ROLES).default("research-only"),
  rights: z.enum(RIGHTS),
  claimedRights: z.enum(RIGHTS).optional(),
  rightsVerification: z.enum(["observed", "verified"]),
  provenance: z.enum(["first-party", "licensed-third-party", "public-domain", "observation-only"]),
  sourceUrl: z.url().optional(),
  assetUrl: z.url().optional(),
  localPath: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  creator: z.string().min(1).optional(),
  creatorUrl: z.url().optional(),
  provider: z.string().min(1).optional(),
  indexedAt: z.iso.datetime({ offset: true }).optional(),
  mature: z.boolean().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  harvestQuery: z.string().min(1).optional(),
  harvestPage: z.number().int().positive().optional(),
  rawMetadata: z.record(z.string(), z.unknown()).optional(),
  licenseName: z.string().min(1),
  licenseUrl: z.url().optional(),
  attribution: z.string().min(1).optional(),
  capturedAt: z.iso.datetime({ offset: true }),
  sha256: z.string().regex(/^[a-fA-F0-9]{64}$/).transform((value) => value.toLowerCase()).optional(),
  rewardLevel: z.number().int().min(0).max(5).default(0),
  tags: z.array(z.string().min(1)).default([]),
}).superRefine((source, context) => {
  if (source.sourceUrl === undefined && source.localPath === undefined) {
    context.addIssue({ code: "custom", path: ["sourceUrl"], message: "sourceUrl or localPath is required" });
  }
  if ((source.rights === "cc-by" || source.rights === "cc-by-sa") && source.attribution === undefined) {
    context.addIssue({ code: "custom", path: ["attribution"], message: `${source.rights} requires attribution` });
  }
  if (source.provenance === "observation-only" && source.rights !== "research-only" && source.rights !== "unknown") {
    context.addIssue({ code: "custom", path: ["rights"], message: "observation-only sources must be research-only or unknown" });
  }
  if (source.rightsVerification === "observed" && source.rights !== "research-only" && source.rights !== "unknown") {
    context.addIssue({ code: "custom", path: ["rights"], message: "unverified claims cannot grant reusable rights" });
  }
  if (source.rightsVerification === "verified" && source.rights === "unknown") {
    context.addIssue({ code: "custom", path: ["rights"], message: "verified sources need an explicit rights status" });
  }
});

export type SourceRecord = z.infer<typeof sourceRecordSchema>;
export type MediaDomain = SourceRecord["domain"];
export type EventType = SourceRecord["eventType"];
export type DatasetSplit = "train" | "validation" | "holdout";

export function generatedReferenceRevision(source: SourceRecord): string | undefined {
  if (source.datasetRole !== "generated-reference") return undefined;
  const repository = source.rawMetadata?.sourceRepository;
  const commit = source.rawMetadata?.sourceCommit;
  if (typeof repository === "string" && /^https:\/\//.test(repository) && typeof commit === "string" && /^[a-f0-9]{40}$/.test(commit)) {
    return `${repository}@${commit}`;
  }
  const generator = source.rawMetadata?.generator;
  const version = source.rawMetadata?.generatorVersion;
  return typeof generator === "string" && generator.length > 0 && typeof version === "string" && version.length > 0
    ? `${generator}@${version}`
    : undefined;
}

export interface FeatureFrame {
  readonly timeSeconds: number;
  readonly peakDbfs?: number;
  readonly rmsDbfs?: number;
  readonly momentaryLufs?: number;
  readonly timeEntropy?: number;
  readonly spectralCentroidHz?: number;
  readonly spectralSpreadHz?: number;
  readonly spectralEntropy?: number;
  readonly spectralFlatness?: number;
  readonly spectralCrest?: number;
  readonly spectralFlux?: number;
  readonly spectralRolloffHz?: number;
}

export const featureObservationSchema = z.strictObject({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  domain: z.enum(MEDIA_DOMAINS),
  eventType: z.enum(EVENT_TYPES),
  datasetRole: z.enum(DATASET_ROLES),
  rewardLevel: z.number().int().min(0).max(5),
  split: z.enum(["train", "validation", "holdout"]),
  startMs: z.number().finite().nonnegative(),
  durationMs: z.number().finite().positive(),
  frameCount: z.number().int().positive(),
  peakDbfs: z.number().finite().optional(),
  rmsDbfs: z.number().finite().optional(),
  momentaryLufs: z.number().finite().optional(),
  timeEntropy: z.number().finite().optional(),
  spectralCentroidHz: z.number().finite().nonnegative().optional(),
  spectralSpreadHz: z.number().finite().nonnegative().optional(),
  spectralEntropy: z.number().finite().optional(),
  spectralFlatness: z.number().finite().nonnegative().optional(),
  spectralCrest: z.number().finite().nonnegative().optional(),
  spectralFlux: z.number().finite().nonnegative().optional(),
  spectralRolloffHz: z.number().finite().nonnegative().optional(),
  dominantFundamentalHz: z.number().finite().positive().optional(),
  dominantMidiNote: z.number().int().min(-1).max(127).optional(),
  dominantNote: z.string().regex(/^[A-G](?:#)?-?\d+$/).optional(),
  dominantPitchClass: z.enum(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]).optional(),
  centsDeviation: z.number().finite().min(-50).max(50).optional(),
  startFundamentalHz: z.number().finite().positive().optional(),
  endFundamentalHz: z.number().finite().positive().optional(),
  semitoneSpan: z.number().finite().optional(),
  pitchConfidence: z.number().finite().min(0).max(1).optional(),
  pitchCoverage: z.number().finite().min(0).max(1).optional(),
  presenceRatio: z.number().finite().min(0).max(1).optional(),
  brillianceRatio: z.number().finite().min(0).max(1).optional(),
  airRatio: z.number().finite().min(0).max(1).optional(),
  extremeHighRatio: z.number().finite().min(0).max(1).optional(),
  highFrequencyRatio: z.number().finite().min(0).max(1).optional(),
  chroma: z.array(z.number().finite().min(0).max(1)).length(12).optional(),
  averageCrestFactorDb: z.number().finite().nonnegative().optional(),
  maxCrestFactorDb: z.number().finite().nonnegative().optional(),
  rights: z.enum(RIGHTS),
  licenseName: z.string().min(1),
  sourceUrl: z.url().optional(),
  attribution: z.string().min(1).optional(),
  tags: z.array(z.string()),
});

export type FeatureObservation = z.infer<typeof featureObservationSchema>;

export const imageObservationSchema = z.strictObject({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  domain: z.enum(MEDIA_DOMAINS),
  effectType: z.enum(VISUAL_EFFECT_TYPES),
  split: z.enum(["train", "validation", "holdout"]),
  dominantColors: z.array(z.enum(["black", "white", "blue", "green", "red", "orange", "gold", "pink", "purple", "rainbow"])).min(1),
  luminanceTier: z.number().int().min(0).max(5),
  textTreatments: z.array(z.enum(["none", "flat", "outline", "extruded", "chrome", "gold-edge", "moving-shine"])),
  screenCoverage: z.number().finite().min(0).max(1),
  cabinetLightCoverage: z.number().finite().min(0).max(1),
  pushVisible: z.boolean(),
  holdColor: z.enum(["none", "blue", "green", "red", "rainbow"]),
  tags: z.array(z.string().min(1)).default([]),
  notes: z.string().max(2_000).optional(),
});

export type ImageObservation = z.infer<typeof imageObservationSchema>;

export interface CorpusPlan {
  readonly targetAudioObservations: number;
  readonly targetImages: number;
  readonly observationWindowMs: number;
  readonly approximateSourceHours: number;
  readonly audioByDomain: Readonly<Record<MediaDomain, number>>;
  readonly imagesByDomain: Readonly<Record<MediaDomain, number>>;
  readonly audioByEvent: Readonly<Record<MediaDomain, Readonly<Partial<Record<EventType, number>>>>>;
}

const EVENT_WEIGHTS: Readonly<Record<MediaDomain, Readonly<Partial<Record<EventType, number>>>>> = {
  pachinko: { launch: 8, nail_hit: 12, pocket: 8, anticipation: 8, reach: 10, impact: 8, freeze: 5, push: 5, confirm: 8, jackpot: 8, payout: 5, bgm: 5 },
  pachislot: { lever: 7, reel_spin: 10, reel_stop: 13, anticipation: 9, reach: 7, impact: 7, freeze: 6, push: 3, confirm: 8, near_miss: 7, jackpot: 8, payout: 8, bgm: 7 },
  online_slot: { reel_spin: 12, reel_stop: 10, anticipation: 10, impact: 8, freeze: 4, push: 2, confirm: 9, near_miss: 9, jackpot: 10, payout: 12, bgm: 14 },
};

function allocate(total: number, weights: readonly (readonly [string, number])[]): Record<string, number> {
  const weightTotal = weights.reduce((sum, [, weight]) => sum + weight, 0);
  const rows = weights.map(([key, weight]) => {
    const exact = total * weight / weightTotal;
    return { key, count: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  const remaining = total - rows.reduce((sum, row) => sum + row.count, 0);
  rows.sort((left, right) => right.remainder - left.remainder || left.key.localeCompare(right.key));
  for (let index = 0; index < remaining; index += 1) {
    const row = rows[index % rows.length];
    if (row !== undefined) row.count += 1;
  }
  return Object.fromEntries(rows.map(({ key, count }) => [key, count]));
}

export function buildCorpusPlan(targetAudioObservations = 100_000, targetImages = 100, observationWindowMs = 500): CorpusPlan {
  if (!Number.isInteger(targetAudioObservations) || targetAudioObservations <= 0) throw new RangeError("targetAudioObservations must be a positive integer");
  if (!Number.isInteger(targetImages) || targetImages <= 0) throw new RangeError("targetImages must be a positive integer");
  if (!Number.isFinite(observationWindowMs) || observationWindowMs < 100 || observationWindowMs > 10_000) throw new RangeError("observationWindowMs must be 100..10000");
  const audioByDomain = allocate(targetAudioObservations, [["pachinko", 4], ["pachislot", 4], ["online_slot", 2]]) as Record<MediaDomain, number>;
  const imagesByDomain = allocate(targetImages, [["pachinko", 4], ["pachislot", 4], ["online_slot", 2]]) as Record<MediaDomain, number>;
  const audioByEvent = Object.fromEntries(MEDIA_DOMAINS.map((domain) => [domain, allocate(audioByDomain[domain], Object.entries(EVENT_WEIGHTS[domain]))])) as CorpusPlan["audioByEvent"];
  return {
    targetAudioObservations,
    targetImages,
    observationWindowMs,
    approximateSourceHours: targetAudioObservations * observationWindowMs / 3_600_000,
    audioByDomain,
    imagesByDomain,
    audioByEvent,
  };
}

const METADATA_KEYS = {
  "lavfi.astats.Overall.Peak_level": "peakDbfs",
  "lavfi.astats.Overall.RMS_level": "rmsDbfs",
  "lavfi.r128.M": "momentaryLufs",
  "lavfi.astats.Overall.Entropy": "timeEntropy",
  "lavfi.aspectralstats.1.centroid": "spectralCentroidHz",
  "lavfi.aspectralstats.1.spread": "spectralSpreadHz",
  "lavfi.aspectralstats.1.entropy": "spectralEntropy",
  "lavfi.aspectralstats.1.flatness": "spectralFlatness",
  "lavfi.aspectralstats.1.crest": "spectralCrest",
  "lavfi.aspectralstats.1.flux": "spectralFlux",
  "lavfi.aspectralstats.1.rolloff": "spectralRolloffHz",
} as const satisfies Readonly<Record<string, Exclude<keyof FeatureFrame, "timeSeconds">>>;

export function parseFfmpegMetadata(output: string): FeatureFrame[] {
  const frames: FeatureFrame[] = [];
  let current: Partial<Record<keyof FeatureFrame, number>> | null = null;
  const finish = () => {
    if (current !== null && typeof current.timeSeconds === "number" && Number.isFinite(current.timeSeconds)) {
      frames.push({ ...current, timeSeconds: current.timeSeconds });
    }
  };
  for (const line of output.split(/\r?\n/)) {
    const frame = /^frame:\d+\s+.*pts_time:([-+\deE.]+)/.exec(line);
    if (frame !== null) {
      finish();
      current = { timeSeconds: Number(frame[1]) };
      continue;
    }
    if (current === null) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const property = METADATA_KEYS[line.slice(0, separator) as keyof typeof METADATA_KEYS];
    const value = Number(line.slice(separator + 1));
    if (property !== undefined && Number.isFinite(value)) current[property] = value;
  }
  finish();
  return frames;
}

function average(values: readonly number[]): number | undefined {
  return values.length === 0 ? undefined : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function powerAverageDb(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const power = values.reduce((sum, value) => sum + 10 ** (value / 10), 0) / values.length;
  return power <= 0 ? undefined : 10 * Math.log10(power);
}

function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  return hash >>> 0;
}

export function stableSplit(id: string): DatasetSplit {
  const bucket = hash32(id) % 10;
  return bucket === 0 ? "holdout" : bucket === 1 ? "validation" : "train";
}

export function aggregateFeatureFrames(source: SourceRecord, frames: readonly FeatureFrame[], windowMs = 500): FeatureObservation[] {
  if (source.mediaType === "image") throw new Error("image sources do not have audio features");
  const sourceSha256 = source.sha256;
  if (sourceSha256 === undefined) throw new Error(`source ${source.id} requires sha256 before feature extraction`);
  if (source.rights === "unknown") throw new Error(`source ${source.id} has unknown rights`);
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new RangeError("windowMs must be positive");
  const buckets = new Map<number, FeatureFrame[]>();
  for (const frame of frames) {
    if (!Number.isFinite(frame.timeSeconds) || frame.timeSeconds < 0) continue;
    const bucket = Math.floor(frame.timeSeconds * 1000 / windowMs);
    const values = buckets.get(bucket) ?? [];
    values.push(frame);
    buckets.set(bucket, values);
  }
  return [...buckets.entries()].sort(([left], [right]) => left - right).map(([bucket, values]) => {
    const valuesFor = (key: keyof FeatureFrame) => values.map((frame) => frame[key]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const id = `${source.id}:${String(bucket).padStart(8, "0")}`;
    return featureObservationSchema.parse({
      id,
      sourceId: source.id,
      sourceSha256,
      domain: source.domain,
      eventType: source.eventType,
      rewardLevel: source.rewardLevel,
      datasetRole: source.datasetRole,
      // All windows decoded from identical source bytes stay in one split even
      // when the manifest gives the bytes another id.
      split: stableSplit(sourceSha256),
      startMs: bucket * windowMs,
      durationMs: windowMs,
      frameCount: values.length,
      peakDbfs: valuesFor("peakDbfs").length === 0 ? undefined : Math.max(...valuesFor("peakDbfs")),
      rmsDbfs: powerAverageDb(valuesFor("rmsDbfs")),
      momentaryLufs: powerAverageDb(valuesFor("momentaryLufs")),
      timeEntropy: average(valuesFor("timeEntropy")),
      spectralCentroidHz: average(valuesFor("spectralCentroidHz")),
      spectralSpreadHz: average(valuesFor("spectralSpreadHz")),
      spectralEntropy: average(valuesFor("spectralEntropy")),
      spectralFlatness: average(valuesFor("spectralFlatness")),
      spectralCrest: average(valuesFor("spectralCrest")),
      spectralFlux: average(valuesFor("spectralFlux")),
      spectralRolloffHz: average(valuesFor("spectralRolloffHz")),
      rights: source.rights,
      licenseName: source.licenseName,
      sourceUrl: source.sourceUrl,
      attribution: source.attribution,
      tags: source.tags,
    });
  });
}

export function canRedistribute(source: Pick<SourceRecord, "rights">): boolean {
  return source.rights === "cleared" || source.rights === "cc0" || source.rights === "cc-by" || source.rights === "cc-by-sa" || source.rights === "public-domain";
}

export function stratifiedFeatureSample(observations: readonly FeatureObservation[], target: number, windowMs = 500): FeatureObservation[] {
  const plan = buildCorpusPlan(target, 1, windowMs);
  const unique = new Map<string, FeatureObservation>();
  for (const row of [...observations].sort((left, right) => left.id.localeCompare(right.id))) {
    const key = `${row.sourceSha256}:${row.startMs}:${row.durationMs}`;
    if (!unique.has(key)) unique.set(key, row);
  }
  const selected: FeatureObservation[] = [];
  for (const domain of MEDIA_DOMAINS) {
    for (const eventType of EVENT_TYPES) {
      const quota = plan.audioByEvent[domain][eventType] ?? 0;
      if (quota === 0) continue;
      const bySource = new Map<string, FeatureObservation[]>();
      for (const row of unique.values()) {
        if (row.domain !== domain || row.eventType !== eventType) continue;
        const rows = bySource.get(row.sourceSha256) ?? [];
        rows.push(row);
        bySource.set(row.sourceSha256, rows);
      }
      const groups = [...bySource.entries()].sort(([left], [right]) => left.localeCompare(right))
        .map(([, rows]) => rows.sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id)));
      let eventCount = 0;
      for (let window = 0; eventCount < quota && window < Math.max(0, ...groups.map((rows) => rows.length)); window += 1) {
        for (const rows of groups) {
          const row = rows[window];
          if (row !== undefined && eventCount < quota) { selected.push(row); eventCount += 1; }
        }
      }
    }
  }
  return selected;
}
