import { describe, expect, it } from "vitest";
import { analyzePcm, cubicTruePeakProxy4x, frequencyToPitch, summarizePitchWindows } from "./pitch.js";

const SAMPLE_RATE = 48_000;

function sine(frequency: number, seconds = 0.5, attackSeconds = 0): Float32Array {
  return Float32Array.from({ length: Math.round(SAMPLE_RATE * seconds) }, (_, index) => {
    const envelope = attackSeconds === 0 ? 1 : Math.min(1, index / (SAMPLE_RATE * attackSeconds));
    return Math.sin(2 * Math.PI * frequency * index / SAMPLE_RATE) * 0.7 * envelope;
  });
}

function noise(seconds = 0.5): Float32Array {
  let state = 0x6d2b79f5;
  return Float32Array.from({ length: Math.round(SAMPLE_RATE * seconds) }, () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return ((state >>> 0) / 0x80000000 - 1) * 0.7;
  });
}

describe("pitch identity", () => {
  it("maps equal-tempered frequencies to notes and cents", () => {
    expect(frequencyToPitch(440)).toMatchObject({ midi: 69, note: "A4", pitchClass: "A", cents: 0 });
    expect(frequencyToPitch(3520)).toMatchObject({ midi: 105, note: "A7", pitchClass: "A" });
    expect(frequencyToPitch(445).cents).toBeCloseTo(19.56, 1);
    expect(() => frequencyToPitch(0)).toThrow();
  });
});

describe("PCM pitch and sharpness proxies", () => {
  it("flags cubic 4x inter-sample overshoot as a non-standard true-peak proxy", () => {
    expect(cubicTruePeakProxy4x(Float32Array.from([0, 1, 1, 0]))).toBeCloseTo(1.125);
    expect(() => cubicTruePeakProxy4x(new Float32Array())).toThrow();
  });

  it("detects both A4 and the high A7 tone", () => {
    const low = analyzePcm(sine(440), SAMPLE_RATE);
    const high = analyzePcm(sine(3520), SAMPLE_RATE);
    expect(low.dominantNote).toBe("A4");
    expect(low.dominantFundamentalHz).toBeCloseTo(440, 0);
    expect(low.pitchConfidence).toBeGreaterThan(0.8);
    expect(low.chroma.indexOf(Math.max(...low.chroma))).toBe(9);
    expect(high.dominantNote).toBe("A7");
    expect(Math.abs(high.centsDeviation ?? 99)).toBeLessThan(3);
    expect(high.presenceRatio).toBeGreaterThan(0.9);
    expect(high.highFrequencyRatio).toBeLessThan(0.05);
  });

  it("separates brilliance energy and measures attack time", () => {
    const bright = analyzePcm(sine(6_000, 0.5, 0.05), SAMPLE_RATE);
    expect(bright.brillianceRatio).toBeGreaterThan(0.9);
    expect(bright.highFrequencyRatio).toBeGreaterThan(0.9);
    expect(bright.attackTimeMs).toBeGreaterThan(30);
    expect(bright.attackTimeMs).toBeLessThan(60);
    expect(summarizePitchWindows(bright.frames, 250).size).toBe(2);
  });

  it("does not assign a musical note to noise", () => {
    const result = analyzePcm(noise(), SAMPLE_RATE);
    expect(result.dominantNote).toBeUndefined();
    expect(result.pitchCoverage).toBe(0);
  });

  it("retains piercing energy above the old 8 kHz Nyquist limit", () => {
    const result = analyzePcm(sine(10_000), SAMPLE_RATE);
    expect(result.dominantNote).toBeUndefined();
    expect(result.airRatio).toBeGreaterThan(0.9);
    expect(result.highFrequencyRatio).toBeGreaterThan(0.9);
  });

  it("tracks missing fundamentals and octave-wide rising cues", () => {
    const missingFundamental = Float32Array.from({ length: SAMPLE_RATE }, (_, index) =>
      0.35 * Math.sin(2 * Math.PI * 880 * index / SAMPLE_RATE) + 0.35 * Math.sin(2 * Math.PI * 1_320 * index / SAMPLE_RATE));
    expect(analyzePcm(missingFundamental, SAMPLE_RATE).dominantNote).toBe("A4");

    let phase = 0;
    const sweep = Float32Array.from({ length: SAMPLE_RATE }, (_, index) => {
      phase += 1_760 * 2 ** (index / (SAMPLE_RATE - 1)) / SAMPLE_RATE;
      return 0.6 * Math.sin(2 * Math.PI * phase);
    });
    const result = analyzePcm(sweep, SAMPLE_RATE);
    expect(result.startFundamentalHz).toBeLessThan(result.endFundamentalHz ?? 0);
    expect(result.semitoneSpan).toBeGreaterThan(11);
    expect(result.semitoneSpan).toBeLessThan(12);
  });
});
