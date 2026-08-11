import { z } from "zod";
import { generatedReferenceRevision, type FeatureObservation, type SourceRecord } from "./index.js";

const NOJIRU_REPOSITORY = "https://github.com/SHOGO391/nojiru.git";
const NOJIRU_REVISION = `${NOJIRU_REPOSITORY}@bbefab094522f17c85342f2fe4822f7e881292eb`;

const pitchEntrySchema = z.object({
  source: z.object({ id: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
  analysis: z.object({
    sampleRate: z.number().int().positive(),
    durationSeconds: z.number().finite().positive(),
    peak: z.number().finite().nonnegative(),
    rms: z.number().finite().nonnegative(),
    clippedSampleRatio: z.number().finite().min(0).max(1),
    dominantNote: z.string().optional(),
    pitchCoverage: z.number().finite().min(0).max(1),
    integratedLufs: z.number().finite().optional(),
    loudnessRangeLu: z.number().finite().nonnegative().optional(),
    truePeakDbtp: z.number().finite().optional(),
  }),
});

export const musicPitchReportSchema = z.object({
  sampleRate: z.number().int().positive(),
  reports: z.array(pitchEntrySchema),
});

export type MusicPitchReport = z.infer<typeof musicPitchReportSchema>;

const round = (value: number | null, digits = 6): number | null => value === null ? null : Number(value.toFixed(digits));
const values = (items: readonly (number | undefined)[]): number[] => items.filter((item): item is number => item !== undefined);
const mean = (items: readonly number[]): number | null => items.length === 0 ? null : items.reduce((sum, item) => sum + item, 0) / items.length;

function declaredBpm(source: SourceRecord): { readonly value: number | null; readonly basis: "raw-metadata" | "title" | "not-declared" } {
  const metadata = source.rawMetadata?.declaredBpm;
  if (typeof metadata === "number" && Number.isFinite(metadata) && metadata >= 20 && metadata <= 400) return { value: metadata, basis: "raw-metadata" };
  const matches = [...(source.title ?? "").matchAll(/\b(\d+(?:\.\d+)?)\s*BPM\b/gi)];
  if (matches.length !== 1) return { value: null, basis: "not-declared" };
  const parsed = Number(matches[0]?.[1]);
  return Number.isFinite(parsed) && parsed >= 20 && parsed <= 400
    ? { value: parsed, basis: "title" }
    : { value: null, basis: "not-declared" };
}

function declaredLoopBeats(source: SourceRecord, revision: string | undefined): { readonly value: number | null; readonly basis: "raw-metadata" | "pinned-nojiru-catalog" | "not-declared" } {
  const metadata = source.rawMetadata?.declaredBeats;
  if (typeof metadata === "number" && Number.isInteger(metadata) && metadata > 0 && metadata <= 1_024) return { value: metadata, basis: "raw-metadata" };
  return revision === NOJIRU_REVISION
    ? { value: 16, basis: "pinned-nojiru-catalog" }
    : { value: null, basis: "not-declared" };
}

function tier(source: SourceRecord): string {
  return source.tags.filter((tag) => /^bgm-[a-z0-9_-]+$/i.test(tag)).sort()[0]?.slice(4) ?? "unclassified";
}

function loudnessStatus(valuesToCheck: readonly (number | undefined)[]): "measured" | "partial" | "not-measured" {
  const measured = valuesToCheck.filter((value) => value !== undefined).length;
  return measured === 0 ? "not-measured" : measured === valuesToCheck.length ? "measured" : "partial";
}

export function buildMusicReport(
  allSources: readonly SourceRecord[],
  allFeatures: readonly FeatureObservation[],
  pitchInput: MusicPitchReport,
) {
  const sourceById = new Map<string, SourceRecord>();
  for (const source of allSources) {
    if (sourceById.has(source.id)) throw new Error(`Duplicate source id: ${source.id}`);
    sourceById.set(source.id, source);
  }
  const sources = allSources.filter((source) => source.mediaType === "audio" && source.eventType === "bgm").sort((left, right) => left.id.localeCompare(right.id));
  if (sources.length === 0) throw new Error("No BGM sources found");
  const sourceIds = new Set(sources.map((source) => source.id));

  const featuresBySource = new Map<string, FeatureObservation[]>();
  for (const feature of allFeatures.filter((row) => row.eventType === "bgm" || sourceIds.has(row.sourceId))) {
    const source = sourceById.get(feature.sourceId);
    if (source === undefined || !sourceIds.has(source.id)) throw new Error(`${feature.id}: BGM feature source mismatch`);
    if (source.sha256 === undefined || feature.sourceSha256 !== source.sha256) throw new Error(`${feature.id}: source hash mismatch`);
    if (feature.eventType !== "bgm" || feature.datasetRole !== source.datasetRole || feature.domain !== source.domain) throw new Error(`${feature.id}: source labels mismatch`);
    const rows = featuresBySource.get(source.id) ?? [];
    rows.push(feature);
    featuresBySource.set(source.id, rows);
  }

  const pitchBySource = new Map<string, MusicPitchReport["reports"][number]>();
  for (const report of pitchInput.reports.filter((item) => sourceIds.has(item.source.id))) {
    if (pitchBySource.has(report.source.id)) throw new Error(`Duplicate pitch report: ${report.source.id}`);
    pitchBySource.set(report.source.id, report);
  }

  const files = sources.map((source) => {
    if (source.sha256 === undefined) throw new Error(`${source.id}: source hash is required`);
    const revision = generatedReferenceRevision(source);
    if (source.datasetRole === "generated-reference" && revision === undefined) throw new Error(`${source.id}: generated reference revision is required`);
    const pitch = pitchBySource.get(source.id);
    if (pitch === undefined) throw new Error(`${source.id}: pitch report is required`);
    if (pitch.source.sha256 !== source.sha256) throw new Error(`${source.id}: pitch source hash mismatch`);
    if (pitch.analysis.sampleRate !== pitchInput.sampleRate) throw new Error(`${source.id}: pitch sample rate mismatch`);
    const features = (featuresBySource.get(source.id) ?? []).sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id));
    if (features.length === 0) throw new Error(`${source.id}: feature windows are required`);
    const bpm = declaredBpm(source);
    const beats = declaredLoopBeats(source, revision);
    const expectedDuration = bpm.value === null || beats.value === null ? null : beats.value * 60 / bpm.value;
    const errorSamples = expectedDuration === null ? null : Math.abs(pitch.analysis.durationSeconds - expectedDuration) * pitchInput.sampleRate;
    const standardized = [pitch.analysis.integratedLufs, pitch.analysis.loudnessRangeLu, pitch.analysis.truePeakDbtp] as const;
    return {
      id: source.id,
      tier: tier(source),
      datasetRole: source.datasetRole,
      calibrationClass: source.datasetRole === "real-calibration" ? "real-machine-calibration" : source.datasetRole === "generated-reference" ? "generated-control" : "non-calibration-reference",
      sourceRevision: revision ?? null,
      sampleRate: pitch.analysis.sampleRate,
      featureWindows: features.length,
      declaredBpm: bpm.value,
      declaredBpmBasis: bpm.basis,
      declaredLoopBeats: beats.value,
      declaredLoopBeatsBasis: beats.basis,
      durationSeconds: round(pitch.analysis.durationSeconds),
      bpmFromDeclaredBeatsAndDuration: beats.value === null ? null : round(beats.value * 60 / pitch.analysis.durationSeconds),
      durationErrorSamples: round(errorSamples),
      durationConsistentWithinOneSample: errorSamples === null ? null : errorSamples <= 1,
      samplePeakLinear: round(pitch.analysis.peak),
      samplePeakDbfs: pitch.analysis.peak > 0 ? round(20 * Math.log10(pitch.analysis.peak)) : null,
      rmsLinear: round(pitch.analysis.rms),
      clippedSampleRatio: round(pitch.analysis.clippedSampleRatio),
      meanMomentaryLufs: round(mean(values(features.map((row) => row.momentaryLufs)))),
      integratedLufs: round(pitch.analysis.integratedLufs ?? null),
      loudnessRangeLu: round(pitch.analysis.loudnessRangeLu ?? null),
      truePeakDbtp: round(pitch.analysis.truePeakDbtp ?? null),
      standardizedLoudnessStatus: loudnessStatus(standardized),
      spectralCentroidHz: round(mean(values(features.map((row) => row.spectralCentroidHz)))),
      spectralRolloffHz: round(mean(values(features.map((row) => row.spectralRolloffHz)))),
      spectralFlux: round(mean(values(features.map((row) => row.spectralFlux)))),
      highFrequencyRatio: round(mean(values(features.map((row) => row.highFrequencyRatio)))),
      pitchCoverage: round(pitch.analysis.pitchCoverage),
      dominantNoteCandidate: pitch.analysis.dominantNote ?? null,
    };
  });

  const tiers = [...new Set(files.map((file) => file.tier))].map((name) => {
    const group = files.filter((file) => file.tier === name);
    const declaredBpms = [...new Set(group.flatMap((file) => file.declaredBpm === null ? [] : [file.declaredBpm]))];
    const statuses = group.map((file) => file.standardizedLoudnessStatus);
    return {
      tier: name,
      files: group.length,
      declaredBpm: declaredBpms.length === 1 ? declaredBpms[0] ?? null : null,
      averageDurationSeconds: round(mean(group.map((file) => file.durationSeconds ?? 0))),
      meanMomentaryLufs: round(mean(values(group.map((file) => file.meanMomentaryLufs ?? undefined)))),
      integratedLufs: round(mean(values(group.map((file) => file.integratedLufs ?? undefined)))),
      loudnessRangeLu: round(mean(values(group.map((file) => file.loudnessRangeLu ?? undefined)))),
      truePeakDbtp: round(mean(values(group.map((file) => file.truePeakDbtp ?? undefined)))),
      standardizedLoudnessStatus: statuses.every((status) => status === "measured") ? "measured" : statuses.every((status) => status === "not-measured") ? "not-measured" : "partial",
      spectralCentroidHz: round(mean(values(group.map((file) => file.spectralCentroidHz ?? undefined)))),
      spectralRolloffHz: round(mean(values(group.map((file) => file.spectralRolloffHz ?? undefined)))),
      spectralFlux: round(mean(values(group.map((file) => file.spectralFlux ?? undefined)))),
      highFrequencyRatio: round(mean(values(group.map((file) => file.highFrequencyRatio ?? undefined)))),
      pitchCoverage: round(mean(group.map((file) => file.pitchCoverage ?? 0))),
    };
  }).sort((left, right) => (left.declaredBpm ?? Number.POSITIVE_INFINITY) - (right.declaredBpm ?? Number.POSITIVE_INFINITY) || left.tier.localeCompare(right.tier));

  const realMachine = files.filter((file) => file.datasetRole === "real-calibration");
  const generated = files.filter((file) => file.datasetRole === "generated-reference");
  return {
    schemaVersion: 1,
    analysisKind: "music-control-summary",
    sourceRevisions: [...new Set(files.flatMap((file) => file.sourceRevision === null ? [] : [file.sourceRevision]))].sort(),
    calibrationBoundary: {
      realMachineSources: realMachine.length,
      realMachineFeatureWindows: realMachine.reduce((sum, file) => sum + file.featureWindows, 0),
      generatedControlSources: generated.length,
      generatedControlFeatureWindows: generated.reduce((sum, file) => sum + file.featureWindows, 0),
      otherReferenceSources: files.length - realMachine.length - generated.length,
      conclusion: realMachine.length === 0
        ? "No real-machine BGM is present; generated controls cannot establish Japanese pachinko calibration."
        : "Real-machine and generated-control results remain separate.",
    },
    measurementDefinitions: {
      declaredBpm: "Declared metadata/title value; no independent beat detector was run.",
      durationConsistency: "Only declared loop beats are checked; pinned Nojiru controls declare four 4/4 bars (16 beats).",
      meanMomentaryLufs: "Arithmetic mean of existing FFmpeg ebur128 momentary-M feature windows; not integrated programme loudness.",
      standardizedLoudness: "integratedLufs, loudnessRangeLu, and truePeakDbtp stay null unless all are present in the input analysis.",
      dominantNoteCandidate: "YIN dominant fundamental candidate; not a musical key or mode estimate.",
      highFrequencyRatio: "Existing ratio of energy above 4 kHz; not standardized sharpness in acum.",
    },
    totals: { sources: files.length, featureWindows: files.reduce((sum, file) => sum + file.featureWindows, 0) },
    tiers,
    files,
  };
}
