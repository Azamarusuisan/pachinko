const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export interface PitchIdentity {
  readonly frequencyHz: number;
  readonly midi: number;
  readonly note: string;
  readonly pitchClass: typeof NOTE_NAMES[number];
  readonly cents: number;
}

export interface PitchFrame {
  readonly timeSeconds: number;
  readonly rms: number;
  readonly crestFactorDb: number;
  readonly spectralPeakHz: number;
  readonly presenceRatio: number;
  readonly brillianceRatio: number;
  readonly airRatio: number;
  readonly extremeHighRatio: number;
  readonly highFrequencyRatio: number;
  readonly chroma: readonly number[];
  readonly fundamentalHz?: number;
  readonly pitchConfidence: number;
  readonly note?: string;
  readonly midi?: number;
  readonly pitchClass?: typeof NOTE_NAMES[number];
  readonly cents?: number;
}

export interface PitchSummary {
  readonly dominantFundamentalHz?: number;
  readonly dominantMidiNote?: number;
  readonly dominantNote?: string;
  readonly dominantPitchClass?: typeof NOTE_NAMES[number];
  readonly centsDeviation?: number;
  readonly startFundamentalHz?: number;
  readonly endFundamentalHz?: number;
  readonly semitoneSpan?: number;
  readonly pitchConfidence: number;
  readonly pitchCoverage: number;
  readonly presenceRatio: number;
  readonly brillianceRatio: number;
  readonly airRatio: number;
  readonly extremeHighRatio: number;
  readonly highFrequencyRatio: number;
  readonly chroma: readonly number[];
  readonly averageCrestFactorDb: number;
  readonly maxCrestFactorDb: number;
}

export interface PcmAnalysis extends PitchSummary {
  readonly sampleRate: number;
  readonly durationSeconds: number;
  readonly peak: number;
  readonly rms: number;
  readonly crestFactorDb: number;
  readonly clippedSampleRatio: number;
  readonly attackTimeMs: number;
  readonly frames: readonly PitchFrame[];
  readonly noteHistogram: readonly {
    readonly note: string;
    readonly midi: number;
    readonly pitchClass: typeof NOTE_NAMES[number];
    readonly frameCount: number;
    readonly weight: number;
    readonly averageFrequencyHz: number;
    readonly averageCents: number;
  }[];
}

const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value));

/** Catmull-Rom interpolation at 4x; a screening proxy, not an ITU-R BS.1770 true-peak meter. */
export function cubicTruePeakProxy4x(samples: Float32Array): number {
  if (!(samples instanceof Float32Array) || samples.length === 0) throw new RangeError("samples must not be empty");
  let peak = Math.abs(samples[0] ?? 0);
  for (let index = 0; index < samples.length - 1; index += 1) {
    const p0 = samples[Math.max(0, index - 1)] ?? 0;
    const p1 = samples[index] ?? 0;
    const p2 = samples[index + 1] ?? 0;
    const p3 = samples[Math.min(samples.length - 1, index + 2)] ?? 0;
    peak = Math.max(peak, Math.abs(p2));
    for (let phase = 1; phase < 4; phase += 1) {
      const t = phase / 4;
      const interpolated = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t ** 2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3);
      peak = Math.max(peak, Math.abs(interpolated));
    }
  }
  return peak;
}

export function frequencyToPitch(frequencyHz: number): PitchIdentity {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) throw new RangeError("frequencyHz must be positive");
  const exactMidi = 69 + 12 * Math.log2(frequencyHz / 440);
  const midi = Math.round(exactMidi);
  const pitchClass = NOTE_NAMES[((midi % 12) + 12) % 12];
  if (pitchClass === undefined) throw new Error("pitch class lookup failed");
  return {
    frequencyHz,
    midi,
    note: `${pitchClass}${Math.floor(midi / 12) - 1}`,
    pitchClass,
    cents: (exactMidi - midi) * 100,
  };
}

function fft(real: Float64Array, imaginary: Float64Array, inverse = false): void {
  const length = real.length;
  for (let index = 1, reverse = 0; index < length; index += 1) {
    let bit = length >> 1;
    for (; (reverse & bit) !== 0; bit >>= 1) reverse ^= bit;
    reverse ^= bit;
    if (index < reverse) {
      [real[index], real[reverse]] = [real[reverse] ?? 0, real[index] ?? 0];
      [imaginary[index], imaginary[reverse]] = [imaginary[reverse] ?? 0, imaginary[index] ?? 0];
    }
  }
  for (let size = 2; size <= length; size <<= 1) {
    const angle = (inverse ? 2 : -2) * Math.PI / size;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    for (let offset = 0; offset < length; offset += size) {
      let rotationReal = 1;
      let rotationImaginary = 0;
      for (let index = 0; index < size / 2; index += 1) {
        const even = offset + index;
        const odd = even + size / 2;
        const oddReal = (real[odd] ?? 0) * rotationReal - (imaginary[odd] ?? 0) * rotationImaginary;
        const oddImaginary = (real[odd] ?? 0) * rotationImaginary + (imaginary[odd] ?? 0) * rotationReal;
        const evenReal = real[even] ?? 0;
        const evenImaginary = imaginary[even] ?? 0;
        real[even] = evenReal + oddReal;
        imaginary[even] = evenImaginary + oddImaginary;
        real[odd] = evenReal - oddReal;
        imaginary[odd] = evenImaginary - oddImaginary;
        const nextReal = rotationReal * stepReal - rotationImaginary * stepImaginary;
        rotationImaginary = rotationReal * stepImaginary + rotationImaginary * stepReal;
        rotationReal = nextReal;
      }
    }
  }
  if (inverse) for (let index = 0; index < length; index += 1) { real[index] = (real[index] ?? 0) / length; imaginary[index] = (imaginary[index] ?? 0) / length; }
}

function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(2, value)));
}

function analyzeFrame(samples: Float32Array, sampleRate: number, start: number, frameSize: number): PitchFrame {
  const fftSize = frameSize * 2;
  const pitchReal = new Float64Array(fftSize);
  const pitchImaginary = new Float64Array(fftSize);
  const spectralReal = new Float64Array(fftSize);
  const spectralImaginary = new Float64Array(fftSize);
  let sum = 0;
  let squareSum = 0;
  let peak = 0;
  for (let index = 0; index < frameSize; index += 1) {
    const sample = samples[start + index] ?? 0;
    sum += sample;
    squareSum += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  const mean = sum / frameSize;
  const rms = Math.sqrt(squareSum / frameSize);
  const crestFactorDb = rms > 0 ? 20 * Math.log10(Math.max(peak, Number.EPSILON) / rms) : 0;
  const prefixEnergy = new Float64Array(frameSize + 1);
  for (let index = 0; index < frameSize; index += 1) {
    const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * index / Math.max(1, frameSize - 1));
    const value = (samples[start + index] ?? 0) - mean;
    pitchReal[index] = value;
    spectralReal[index] = value * window;
    prefixEnergy[index + 1] = (prefixEnergy[index] ?? 0) + value * value;
  }
  fft(spectralReal, spectralImaginary);
  const powers = new Float64Array(fftSize / 2 + 1);
  for (let bin = 0; bin < powers.length; bin += 1) powers[bin] = (spectralReal[bin] ?? 0) ** 2 + (spectralImaginary[bin] ?? 0) ** 2;
  const nyquist = sampleRate / 2;
  const upperFrequency = Math.min(20_000, nyquist);
  const binFrequency = sampleRate / fftSize;
  const energy = (fromHz: number, toHz: number): number => {
    const from = Math.max(1, Math.ceil(fromHz / binFrequency));
    const to = Math.min(powers.length - 1, Math.floor(Math.min(toHz, upperFrequency) / binFrequency));
    let total = 0;
    for (let bin = from; bin <= to; bin += 1) total += powers[bin] ?? 0;
    return total;
  };
  const totalEnergy = energy(20, upperFrequency);
  const ratio = (fromHz: number, toHz: number): number => totalEnergy > 0 ? energy(fromHz, toHz) / totalEnergy : 0;
  let peakBin = Math.max(1, Math.ceil(20 / binFrequency));
  const chroma = Array.from({ length: 12 }, () => 0);
  for (let bin = peakBin; bin < powers.length && bin * binFrequency <= upperFrequency; bin += 1) {
    if ((powers[bin] ?? 0) > (powers[peakBin] ?? 0)) peakBin = bin;
    const frequency = bin * binFrequency;
    if (frequency >= 70 && frequency <= 8_000) {
      const pitchClass = ((Math.round(69 + 12 * Math.log2(frequency / 440)) % 12) + 12) % 12;
      chroma[pitchClass] = (chroma[pitchClass] ?? 0) + (powers[bin] ?? 0);
    }
  }
  const chromaEnergy = chroma.reduce((total, value) => total + value, 0);
  if (chromaEnergy > 0) for (let index = 0; index < chroma.length; index += 1) chroma[index] = (chroma[index] ?? 0) / chromaEnergy;

  fft(pitchReal, pitchImaginary);
  for (let bin = 0; bin < fftSize; bin += 1) {
    pitchReal[bin] = (pitchReal[bin] ?? 0) ** 2 + (pitchImaginary[bin] ?? 0) ** 2;
    pitchImaginary[bin] = 0;
  }
  fft(pitchReal, pitchImaginary, true);
  const maxLag = Math.min(frameSize - 2, Math.floor(sampleRate / 150));
  const minLag = Math.min(maxLag, Math.max(2, Math.floor(sampleRate / 6_000)));
  const yin = new Float64Array(maxLag + 1);
  let cumulativeDifference = 0;
  for (let lag = 1; lag <= maxLag; lag += 1) {
    const leftEnergy = (prefixEnergy[frameSize - lag] ?? 0) - (prefixEnergy[0] ?? 0);
    const rightEnergy = (prefixEnergy[frameSize] ?? 0) - (prefixEnergy[lag] ?? 0);
    const difference = Math.max(0, leftEnergy + rightEnergy - 2 * (pitchReal[lag] ?? 0));
    cumulativeDifference += difference;
    yin[lag] = cumulativeDifference > 0 ? difference * lag / cumulativeDifference : 1;
  }
  let bestLag = minLag;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    if ((yin[lag] ?? 1) < (yin[bestLag] ?? 1)) bestLag = lag;
    if ((yin[lag] ?? 1) < 0.15) {
      bestLag = lag;
      while (bestLag < maxLag && (yin[bestLag + 1] ?? 1) < (yin[bestLag] ?? 1)) bestLag += 1;
      break;
    }
  }
  const center = yin[bestLag] ?? 1;
  const previous = yin[bestLag - 1] ?? center;
  const next = yin[bestLag + 1] ?? center;
  const curvature = previous - 2 * center + next;
  const refinedLag = bestLag + (Math.abs(curvature) > 1e-12 ? clamp(0.5 * (previous - next) / curvature, -0.5, 0.5) : 0);
  const pitchConfidence = clamp(1 - center, 0, 1);
  const peakFrequency = peakBin * binFrequency;
  const onlyAbovePitchRange = peakFrequency > 6_000 && totalEnergy > 0 && energy(20, 6_000) / totalEnergy < 0.01;
  const fundamentalHz = pitchConfidence >= 0.85 && rms >= 1e-5 && !onlyAbovePitchRange ? sampleRate / refinedLag : undefined;
  const identity = fundamentalHz === undefined ? undefined : frequencyToPitch(fundamentalHz);
  return {
    timeSeconds: (start + frameSize / 2) / sampleRate,
    rms,
    crestFactorDb,
    spectralPeakHz: peakFrequency,
    presenceRatio: ratio(2_000, 4_000),
    brillianceRatio: ratio(4_000, 8_000),
    airRatio: ratio(8_000, 16_000),
    extremeHighRatio: ratio(16_000, 20_000),
    highFrequencyRatio: ratio(4_000, 20_000),
    chroma,
    pitchConfidence,
    ...(identity === undefined ? {} : {
      fundamentalHz: identity.frequencyHz,
      note: identity.note,
      midi: identity.midi,
      pitchClass: identity.pitchClass,
      cents: identity.cents,
    }),
  };
}

const weightedAverage = (values: readonly { readonly value: number; readonly weight: number }[]): number => {
  const weight = values.reduce((sum, item) => sum + item.weight, 0);
  return weight > 0 ? values.reduce((sum, item) => sum + item.value * item.weight, 0) / weight : 0;
};

export function summarizePitchFrames(frames: readonly PitchFrame[]): PitchSummary & { readonly noteHistogram: PcmAnalysis["noteHistogram"] } {
  if (frames.length === 0) return { pitchConfidence: 0, pitchCoverage: 0, presenceRatio: 0, brillianceRatio: 0, airRatio: 0, extremeHighRatio: 0, highFrequencyRatio: 0, chroma: Array.from({ length: 12 }, () => 0), averageCrestFactorDb: 0, maxCrestFactorDb: 0, noteHistogram: [] };
  const frameWeights = frames.map((frame) => Math.max(frame.rms * frame.rms, 1e-12));
  const weighted = (select: (frame: PitchFrame) => number): number => weightedAverage(frames.map((frame, index) => ({ value: select(frame), weight: frameWeights[index] ?? 0 })));
  const noteBuckets = new Map<number, { frames: PitchFrame[]; weight: number }>();
  frames.forEach((frame, index) => {
    if (frame.midi === undefined || frame.fundamentalHz === undefined || frame.cents === undefined || frame.pitchConfidence < 0.85) return;
    const bucket = noteBuckets.get(frame.midi) ?? { frames: [], weight: 0 };
    bucket.frames.push(frame);
    bucket.weight += (frameWeights[index] ?? 0) * frame.pitchConfidence;
    noteBuckets.set(frame.midi, bucket);
  });
  const noteHistogram = [...noteBuckets.entries()].map(([midi, bucket]) => {
    const pitch = frequencyToPitch(440 * 2 ** ((midi - 69) / 12));
    const weights = bucket.frames.map((frame) => Math.max(frame.rms * frame.rms * frame.pitchConfidence, 1e-12));
    const average = (select: (frame: PitchFrame) => number): number => weightedAverage(bucket.frames.map((frame, index) => ({ value: select(frame), weight: weights[index] ?? 0 })));
    return { note: pitch.note, midi, pitchClass: pitch.pitchClass, frameCount: bucket.frames.length, weight: bucket.weight, averageFrequencyHz: average((frame) => frame.fundamentalHz ?? 0), averageCents: average((frame) => frame.cents ?? 0) };
  }).sort((left, right) => right.weight - left.weight || left.midi - right.midi);
  const dominant = noteHistogram[0];
  const pitchedFrames = frames.filter((frame) => frame.fundamentalHz !== undefined && frame.pitchConfidence >= 0.85);
  const startFundamentalHz = pitchedFrames[0]?.fundamentalHz;
  const endFundamentalHz = pitchedFrames[pitchedFrames.length - 1]?.fundamentalHz;
  const chroma = Array.from({ length: 12 }, (_, index) => weighted((frame) => frame.chroma[index] ?? 0));
  const chromaTotal = chroma.reduce((total, value) => total + value, 0);
  if (chromaTotal > 0) for (let index = 0; index < chroma.length; index += 1) chroma[index] = (chroma[index] ?? 0) / chromaTotal;
  return {
    ...(dominant === undefined ? {} : {
      dominantFundamentalHz: dominant.averageFrequencyHz,
      dominantMidiNote: dominant.midi,
      dominantNote: dominant.note,
      dominantPitchClass: dominant.pitchClass,
      centsDeviation: dominant.averageCents,
    }),
    ...(startFundamentalHz === undefined || endFundamentalHz === undefined ? {} : {
      startFundamentalHz,
      endFundamentalHz,
      semitoneSpan: 12 * Math.log2(endFundamentalHz / startFundamentalHz),
    }),
    pitchConfidence: pitchedFrames.length === 0 ? 0 : weightedAverage(pitchedFrames.map((frame) => ({ value: frame.pitchConfidence, weight: Math.max(frame.rms * frame.rms, 1e-12) }))),
    pitchCoverage: pitchedFrames.length / frames.length,
    presenceRatio: weighted((frame) => frame.presenceRatio),
    brillianceRatio: weighted((frame) => frame.brillianceRatio),
    airRatio: weighted((frame) => frame.airRatio),
    extremeHighRatio: weighted((frame) => frame.extremeHighRatio),
    highFrequencyRatio: weighted((frame) => frame.highFrequencyRatio),
    chroma,
    averageCrestFactorDb: weighted((frame) => frame.crestFactorDb),
    maxCrestFactorDb: Math.max(...frames.map((frame) => frame.crestFactorDb)),
    noteHistogram,
  };
}

function attackTimeMs(samples: Float32Array, sampleRate: number): number {
  const blockSize = Math.max(1, Math.round(sampleRate / 1_000));
  const envelope: number[] = [];
  for (let start = 0; start < samples.length; start += blockSize) {
    let sum = 0;
    let count = 0;
    for (let index = start; index < Math.min(samples.length, start + blockSize); index += 1) { const sample = samples[index] ?? 0; sum += sample * sample; count += 1; }
    envelope.push(count > 0 ? Math.sqrt(sum / count) : 0);
  }
  const maximum = Math.max(0, ...envelope);
  if (maximum === 0) return 0;
  const peakIndex = envelope.indexOf(maximum);
  const startIndex = envelope.findIndex((value, index) => index <= peakIndex && value >= maximum * 0.1);
  const endIndex = envelope.findIndex((value, index) => index >= Math.max(0, startIndex) && index <= peakIndex && value >= maximum * 0.9);
  return Math.max(0, (endIndex - Math.max(0, startIndex)) * blockSize / sampleRate * 1_000);
}

export function analyzePcm(samples: Float32Array, sampleRate: number): PcmAnalysis {
  if (!(samples instanceof Float32Array) || samples.length === 0) throw new RangeError("samples must not be empty");
  if (!Number.isFinite(sampleRate) || sampleRate < 8_000 || sampleRate > 192_000) throw new RangeError("sampleRate must be 8000..192000");
  const frameSize = Math.min(2_048, nextPowerOfTwo(samples.length));
  const hopSize = Math.max(1, frameSize / 4);
  const starts: number[] = [];
  if (samples.length <= frameSize) starts.push(0);
  else {
    for (let start = 0; start + frameSize <= samples.length; start += hopSize) starts.push(start);
    const finalStart = samples.length - frameSize;
    if (starts[starts.length - 1] !== finalStart) starts.push(finalStart);
  }
  const frames = starts.map((start) => analyzeFrame(samples, sampleRate, start, frameSize));
  const summary = summarizePitchFrames(frames);
  let squareSum = 0;
  let peak = 0;
  let clipped = 0;
  for (const sample of samples) { squareSum += sample * sample; peak = Math.max(peak, Math.abs(sample)); if (Math.abs(sample) >= 0.999) clipped += 1; }
  const rms = Math.sqrt(squareSum / samples.length);
  return {
    ...summary,
    sampleRate,
    durationSeconds: samples.length / sampleRate,
    peak,
    rms,
    crestFactorDb: rms > 0 ? 20 * Math.log10(Math.max(peak, Number.EPSILON) / rms) : 0,
    clippedSampleRatio: clipped / samples.length,
    attackTimeMs: attackTimeMs(samples, sampleRate),
    frames,
    noteHistogram: summary.noteHistogram,
  };
}

export function summarizePitchWindows(frames: readonly PitchFrame[], windowMs: number): ReadonlyMap<number, PitchSummary> {
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new RangeError("windowMs must be positive");
  const buckets = new Map<number, PitchFrame[]>();
  for (const frame of frames) {
    const bucket = Math.floor(frame.timeSeconds * 1_000 / windowMs);
    const values = buckets.get(bucket) ?? [];
    values.push(frame);
    buckets.set(bucket, values);
  }
  return new Map([...buckets.entries()].map(([bucket, values]) => {
    const { noteHistogram, ...summary } = summarizePitchFrames(values);
    void noteHistogram;
    return [bucket, summary];
  }));
}
