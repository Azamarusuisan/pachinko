import { describe, expect, it } from "vitest";
import { featureObservationSchema, sourceRecordSchema, stableSplit } from "./index.js";
import { buildMusicReport, musicPitchReportSchema } from "./music-report.js";

const revision = {
  sourceRepository: "https://github.com/SHOGO391/nojiru.git",
  sourceCommit: "bbefab094522f17c85342f2fe4822f7e881292eb",
};

function fixture(id: string, hash: string, tier: string, bpm: number) {
  const source = sourceRecordSchema.parse({
    id,
    domain: "online_slot",
    mediaType: "audio",
    eventType: "bgm",
    datasetRole: "generated-reference",
    rights: "research-only",
    rightsVerification: "observed",
    provenance: "observation-only",
    localPath: `research-data/${id}.wav`,
    title: `Loop ${tier} ${bpm}BPM`,
    licenseName: "Generated control",
    capturedAt: "2026-08-11T00:00:00+09:00",
    sha256: hash,
    rewardLevel: 0,
    tags: [`bgm-${tier}`],
    rawMetadata: revision,
  });
  const feature = featureObservationSchema.parse({
    id: `${id}:00000000`,
    sourceId: id,
    sourceSha256: hash,
    domain: source.domain,
    eventType: source.eventType,
    datasetRole: source.datasetRole,
    rewardLevel: 0,
    split: stableSplit(hash),
    startMs: 0,
    durationMs: 500,
    frameCount: 1,
    momentaryLufs: -14,
    spectralCentroidHz: 2_000,
    spectralRolloffHz: 4_000,
    spectralFlux: 0.03,
    highFrequencyRatio: 0.002,
    rights: source.rights,
    licenseName: source.licenseName,
    tags: source.tags,
  });
  const pitch = {
    source: { id, sha256: hash },
    analysis: {
      sampleRate: 48_000,
      durationSeconds: 16 * 60 / bpm,
      peak: 0.86,
      rms: 0.24,
      clippedSampleRatio: 0,
      pitchCoverage: 0.1,
    },
  };
  return { source, feature, pitch };
}

describe("music report", () => {
  it("is deterministic and never counts generated controls as real-machine calibration", () => {
    const calm = fixture("bgm-calm", "a".repeat(64), "calm", 104);
    const hot = fixture("bgm-hot", "c".repeat(64), "hot", 152);
    const input = musicPitchReportSchema.parse({ sampleRate: 48_000, reports: [calm.pitch, hot.pitch] });
    const report = buildMusicReport([calm.source, hot.source], [calm.feature, hot.feature], input);
    const reversed = buildMusicReport([hot.source, calm.source], [hot.feature, calm.feature], musicPitchReportSchema.parse({ sampleRate: 48_000, reports: [hot.pitch, calm.pitch] }));

    expect(JSON.stringify(report)).toBe(JSON.stringify(reversed));
    expect(report.calibrationBoundary).toMatchObject({ realMachineSources: 0, generatedControlSources: 2 });
    expect(report.files[0]).toMatchObject({ declaredLoopBeats: 16, durationConsistentWithinOneSample: true, integratedLufs: null, standardizedLoudnessStatus: "not-measured" });
  });

  it("rejects an unpinned generated source and mismatched analysis bytes", () => {
    const data = fixture("bgm-calm", "a".repeat(64), "calm", 104);
    const pitch = musicPitchReportSchema.parse({ sampleRate: 48_000, reports: [data.pitch] });
    expect(() => buildMusicReport([{ ...data.source, rawMetadata: undefined }], [data.feature], pitch)).toThrow("revision is required");
    expect(() => buildMusicReport([data.source], [data.feature], musicPitchReportSchema.parse({ sampleRate: 48_000, reports: [{ ...data.pitch, source: { ...data.pitch.source, sha256: "d".repeat(64) } }] }))).toThrow("pitch source hash mismatch");
    expect(buildMusicReport([{ ...data.source, rawMetadata: { ...revision, sourceCommit: "d".repeat(40) } }], [data.feature], pitch).files[0]?.declaredLoopBeats).toBeNull();
  });
});
