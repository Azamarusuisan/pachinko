import { AudioRegistry } from "@pachinko/effect-system";
import type { AudioManifest } from "@pachinko/effect-system";

const SEMITONES = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 } as const;
const MAX_GAIN = 0.16;
export const MAX_AUDIO_VOICES = 24;

export const AUDIO_CUE_IDS = ["launch", "nail", "pocket", "out", "rush", "storyAlarm", "storyLaunch", "hotAlert", "storyImpact", "storySync", "storyStrike", "kyuin", "normal"] as const;
export type AudioCueId = typeof AUDIO_CUE_IDS[number];

export const AUDIO_CUE_MANIFESTS: readonly AudioManifest[] = [
  { id: "launch", path: "procedural:launch", preload: true, priority: 20, cooldownMs: 20, maxConcurrency: 4, group: "physical", tags: ["ball.launch"] },
  { id: "nail", path: "procedural:nail", preload: true, priority: 10, cooldownMs: 12, maxConcurrency: 8, group: "physical", tags: ["nail.hit"] },
  { id: "pocket", path: "procedural:pocket", preload: true, priority: 50, cooldownMs: 40, maxConcurrency: 4, group: "physical", tags: ["sensor.start"] },
  { id: "out", path: "procedural:out", preload: true, priority: 15, cooldownMs: 20, maxConcurrency: 4, group: "physical", tags: ["sensor.out"] },
  { id: "rush", path: "procedural:rush", preload: true, priority: 90, cooldownMs: 500, maxConcurrency: 1, group: "result", tags: ["jackpot", "phase.rush"] },
  { id: "storyAlarm", path: "procedural:story-alarm", preload: true, priority: 55, cooldownMs: 500, maxConcurrency: 1, group: "lottery", tags: ["hot"] },
  { id: "storyLaunch", path: "procedural:story-launch", preload: true, priority: 45, cooldownMs: 250, maxConcurrency: 1, group: "lottery", tags: ["reach"] },
  { id: "hotAlert", path: "procedural:hot-alert", preload: true, priority: 80, cooldownMs: 500, maxConcurrency: 1, group: "lottery", tags: ["hot", "confirm"] },
  { id: "storyImpact", path: "procedural:story-impact", preload: true, priority: 60, cooldownMs: 250, maxConcurrency: 1, group: "lottery", tags: ["reach", "impact"] },
  { id: "storySync", path: "procedural:story-sync", preload: true, priority: 65, cooldownMs: 250, maxConcurrency: 1, group: "lottery", tags: ["reach"] },
  { id: "storyStrike", path: "procedural:story-strike", preload: true, priority: 75, cooldownMs: 250, maxConcurrency: 1, group: "lottery", tags: ["result"] },
  { id: "kyuin", path: "procedural:kyuin", preload: true, priority: 100, cooldownMs: 1_000, maxConcurrency: 1, group: "result", tags: ["jackpot", "confirm"] },
  { id: "normal", path: "procedural:normal", preload: true, priority: 30, cooldownMs: 250, maxConcurrency: 1, group: "phase", tags: ["phase.normal"] },
] as const;

export function createRuntimeAudioRegistry(): AudioRegistry {
  const registry = new AudioRegistry();
  for (const manifest of AUDIO_CUE_MANIFESTS) registry.register(manifest);
  return registry;
}

const finiteOr = (value: number, fallback: number): number => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value));

function hash32(value: number, salt: number): number {
  let hash = (Math.trunc(finiteOr(value, 0)) ^ salt) >>> 0;
  hash = Math.imul(hash ^ hash >>> 16, 0x7feb352d);
  hash = Math.imul(hash ^ hash >>> 15, 0x846ca68b);
  return (hash ^ hash >>> 16) >>> 0;
}

const variation = (counter: number, salt: number): number => hash32(counter, salt) / 0xffffffff;

export function noteFrequency(note: string): number {
  const match = /^([A-G](?:#)?)(-?\d+)$/.exec(note);
  if (match === null) throw new Error(`Invalid note: ${note}`);
  const pitch = match[1] as keyof typeof SEMITONES;
  const octave = Number(match[2]);
  if (!Number.isInteger(octave) || octave < -1 || octave > 9) throw new Error(`Invalid note: ${note}`);
  const midi = (octave + 1) * 12 + SEMITONES[pitch];
  return 440 * 2 ** ((midi - 69) / 12);
}

export function launchCue(speed: number, counter: number) {
  const intensity = clamp(finiteOr(speed, 3.5) / 4, 0.45, 1);
  const pitch = 0.97 + variation(counter, 0x4c41554e) * 0.06;
  return {
    intensity,
    clickFrequency: 260 * pitch,
    lowNoiseFrequency: 1250 * pitch,
    highNoiseFrequency: 3600 * pitch,
    seed: hash32(counter, 0x4b415348),
  } as const;
}

export function nailCue(speedBefore: number, counter: number) {
  const speed = finiteOr(speedBefore, 0);
  if (speed < 0.18) return null;
  const intensity = clamp(speed / 3.5, 0.2, 1);
  const detune = 0.94 + variation(counter, 0x4e41494c) * 0.12;
  return {
    intensity,
    resonance: noteFrequency("C7") * detune * (0.92 + intensity * 0.08),
    seed: hash32(counter, 0x4d455441),
  } as const;
}

export interface AudioDiagnostics {
  readonly activeVoices: number;
  readonly peakActiveVoices: number;
  readonly activeNodes: number;
  readonly peakActiveNodes: number;
  readonly startedCues: number;
  readonly releasedCues: number;
  readonly preemptedVoices: number;
  readonly rejectedByCooldown: number;
  readonly rejectedByConcurrency: number;
  readonly rejectedByPriority: number;
  readonly activeByCue: Readonly<Partial<Record<AudioCueId, number>>>;
  readonly startedByCue: Readonly<Partial<Record<AudioCueId, number>>>;
}

export interface PlayAudioOptions {
  readonly contextFactory?: () => AudioContext;
  readonly registry?: AudioRegistry;
  readonly maxVoices?: number;
}

interface VoiceSourceGroup {
  readonly source: AudioScheduledSourceNode;
  readonly nodes: readonly AudioNode[];
  released: boolean;
}

interface ActiveVoice {
  readonly id: number;
  readonly cueId: AudioCueId;
  readonly priority: number;
  readonly sources: Set<VoiceSourceGroup>;
  endsAt: number;
  released: boolean;
}

const disconnectQuietly = (node: AudioNode): void => {
  try { node.disconnect(); } catch { /* Already detached. */ }
};

export class PlayAudio {
  private context: AudioContext | null = null;
  private output: AudioNode | null = null;
  private cueCounter = 0;
  private silentUntil = -Infinity;
  private readonly contextFactory: () => AudioContext;
  private readonly registry: AudioRegistry;
  private readonly maxVoices: number;
  private readonly activeVoices = new Set<ActiveVoice>();
  private readonly lastStartedAt = new Map<AudioCueId, number>();
  private readonly startedByCue = new Map<AudioCueId, number>();
  private currentVoice: ActiveVoice | null = null;
  private nextVoiceId = 0;
  private activeNodeCount = 0;
  private peakActiveVoices = 0;
  private peakActiveNodes = 0;
  private startedCues = 0;
  private releasedCues = 0;
  private preemptedVoices = 0;
  private rejectedByCooldown = 0;
  private rejectedByConcurrency = 0;
  private rejectedByPriority = 0;

  constructor(options: PlayAudioOptions = {}) {
    this.contextFactory = options.contextFactory ?? (() => new AudioContext());
    this.registry = options.registry ?? createRuntimeAudioRegistry();
    this.maxVoices = Math.max(1, Math.trunc(finiteOr(options.maxVoices ?? MAX_AUDIO_VOICES, MAX_AUDIO_VOICES)));
  }

  unlock(): void {
    if (this.context?.state === "closed") { this.context = null; this.output = null; }
    if (this.context === null) {
      const context = this.contextFactory();
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -14; compressor.knee.value = 8; compressor.ratio.value = 4;
      compressor.attack.value = 0.002; compressor.release.value = 0.08;
      const master = context.createGain(); master.gain.value = 0.72;
      master.connect(compressor);
      compressor.connect(context.destination);
      this.context = context; this.output = master;
    }
    if (this.context.state === "suspended") void this.context.resume();
  }

  launch(speed = 3.5): void {
    this.playCue("launch", () => {
      const cue = launchCue(speed, this.nextCueCounter());
      this.tone(cue.clickFrequency, 0.014, 0.025 * cue.intensity, "square", -95);
      this.noise(0.018, 0.03 * cue.intensity, "bandpass", cue.lowNoiseFrequency, 1.6, 0, cue.lowNoiseFrequency * 1.35, cue.seed);
      this.noise(0.044, 0.024 * cue.intensity, "bandpass", cue.highNoiseFrequency, 0.9, 0.007, 1650, hash32(cue.seed, 0x53485555));
    });
  }

  nail(speedBefore = 1): void {
    if (nailCue(speedBefore, 0) === null) return;
    this.playCue("nail", () => {
      const cue = nailCue(speedBefore, this.nextCueCounter());
      if (cue === null) return;
      this.tone(cue.resonance, 0.016, 0.011 + 0.021 * cue.intensity, "sine", -cue.resonance * 0.22);
      this.tone(cue.resonance * 2.32, 0.01, 0.004 + 0.008 * cue.intensity, "sine", -cue.resonance * 0.36);
      this.tone(cue.resonance * 3.87, 0.007, 0.002 + 0.004 * cue.intensity, "sine", -cue.resonance * 0.52);
      this.noise(0.011, 0.005 + 0.009 * cue.intensity, "highpass", 4100, 1.2, 0, 5200, cue.seed);
    });
  }

  pocket(): void { this.playCue("pocket", () => { this.tone(noteFrequency("C5"), 0.028, 0.018, "triangle", -90); this.sequence([[noteFrequency("C6"), .085], [noteFrequency("E6"), .085], [noteFrequency("G6"), .1], [noteFrequency("C7"), .18]], 74, "sine", .038, 0); }); }
  out(): void { this.playCue("out", () => this.tone(105, 0.08, 0.025, "sine", -45)); }
  rush(): void { this.playCue("rush", () => this.chord([392, 523.25, 659.25, 783.99], 0.45, 0.06)); }
  storyAlarm(): void { this.playCue("storyAlarm", () => this.sequence([[190, .12], [190, .12], [285, .2]], 120, "sawtooth")); }
  storyLaunch(): void { this.playCue("storyLaunch", () => { this.tone(70, .65, .075, "sawtooth", 850); this.noise(.32, .075, "lowpass", 1800, .7, .18); }); }
  hotAlert(): void { this.playCue("hotAlert", () => { this.tone(92, .48, .08, "square", 40); this.sequence([[880, .1], [1320, .1], [1760, .2]], 82, "sawtooth"); }); }
  storyImpact(): void { this.playCue("storyImpact", () => { this.noise(.22, .09); this.tone(55, .38, .1, "square", -20); }); }
  storySync(): void { this.playCue("storySync", () => this.sequence([[330, .12], [440, .12], [660, .16], [990, .25]], 85, "triangle")); }
  storyStrike(): void { this.playCue("storyStrike", () => { this.noise(.42, .13); this.chord([110, 220, 440, 880], .48, .055); }); }
  kyuin(): void {
    this.playCue("kyuin", () => {
      const accentStart = noteFrequency("F#8");
      this.tone(noteFrequency("A6"), .22, .058, "sine", noteFrequency("A7") - noteFrequency("A6"));
      this.tone(noteFrequency("E7"), .34, .052, "sine", noteFrequency("E8") - noteFrequency("E7"), .11);
      this.tone(noteFrequency("A7"), .18, .024, "sine", 0, .31);
      this.tone(accentStart, .052, .014, "square", noteFrequency("A8") - accentStart, .008);
      this.noise(.034, .009, "highpass", 6_800, .8, .012, 10_500, hash32(this.nextCueCounter(), 0x4b595549));
    });
  }
  normal(): void { this.playCue("normal", () => this.chord([523.25, 392], 0.2, 0.035)); }

  silence(milliseconds: number): void {
    const now = this.context?.currentTime ?? 0;
    this.silentUntil = milliseconds === Number.POSITIVE_INFINITY ? milliseconds : now + Math.max(0, finiteOr(milliseconds, 0)) / 1_000;
  }

  diagnostics(): AudioDiagnostics {
    this.releaseExpired(this.context?.currentTime ?? 0);
    const activeByCue: Partial<Record<AudioCueId, number>> = {};
    for (const voice of this.activeVoices) activeByCue[voice.cueId] = (activeByCue[voice.cueId] ?? 0) + 1;
    return {
      activeVoices: this.activeVoices.size,
      peakActiveVoices: this.peakActiveVoices,
      activeNodes: this.activeNodeCount,
      peakActiveNodes: this.peakActiveNodes,
      startedCues: this.startedCues,
      releasedCues: this.releasedCues,
      preemptedVoices: this.preemptedVoices,
      rejectedByCooldown: this.rejectedByCooldown,
      rejectedByConcurrency: this.rejectedByConcurrency,
      rejectedByPriority: this.rejectedByPriority,
      activeByCue,
      startedByCue: Object.fromEntries(this.startedByCue),
    };
  }

  dispose(): void {
    for (const voice of [...this.activeVoices]) this.releaseVoice(voice, true);
    if (this.context !== null) void this.context.close();
    this.context = null;
    this.output = null;
    this.currentVoice = null;
    this.lastStartedAt.clear();
    this.silentUntil = -Infinity;
  }

  private playCue(cueId: AudioCueId, render: () => void): void {
    const context = this.context;
    if (context === null || this.output === null || context.state !== "running" || context.currentTime < this.silentUntil) return;
    const manifest = this.registry.get(cueId);
    if (manifest === undefined) throw new Error(`Missing audio manifest: ${cueId}`);
    const now = context.currentTime;
    this.releaseExpired(now);
    const lastStarted = this.lastStartedAt.get(cueId);
    if (lastStarted !== undefined && now - lastStarted < manifest.cooldownMs / 1_000) { this.rejectedByCooldown += 1; return; }
    const sameCue = [...this.activeVoices].filter((voice) => voice.cueId === cueId).length;
    if (sameCue >= manifest.maxConcurrency) { this.rejectedByConcurrency += 1; return; }
    if (this.activeVoices.size >= this.maxVoices) {
      const victim = [...this.activeVoices].sort((left, right) => left.priority - right.priority || left.id - right.id)[0];
      if (victim === undefined || victim.priority >= manifest.priority) { this.rejectedByPriority += 1; return; }
      this.preemptedVoices += 1;
      this.releaseVoice(victim, true);
    }
    const voice: ActiveVoice = { id: this.nextVoiceId++, cueId, priority: manifest.priority, sources: new Set(), endsAt: now, released: false };
    this.activeVoices.add(voice);
    this.lastStartedAt.set(cueId, now);
    this.startedByCue.set(cueId, (this.startedByCue.get(cueId) ?? 0) + 1);
    this.startedCues += 1;
    this.peakActiveVoices = Math.max(this.peakActiveVoices, this.activeVoices.size);
    const previousVoice = this.currentVoice;
    this.currentVoice = voice;
    try { render(); }
    catch (error) { this.releaseVoice(voice, true); throw error; }
    finally { this.currentVoice = previousVoice; }
    if (voice.sources.size === 0) this.releaseVoice(voice, false);
  }

  private releaseExpired(now: number): void {
    for (const voice of [...this.activeVoices]) if (voice.endsAt <= now) this.releaseVoice(voice, false);
  }

  private trackSource(source: AudioScheduledSourceNode, nodes: readonly AudioNode[], endsAt: number): void {
    const voice = this.currentVoice;
    if (voice === null) return;
    const group: VoiceSourceGroup = { source, nodes, released: false };
    voice.sources.add(group);
    voice.endsAt = Math.max(voice.endsAt, endsAt);
    this.activeNodeCount += nodes.length;
    this.peakActiveNodes = Math.max(this.peakActiveNodes, this.activeNodeCount);
    source.onended = () => this.releaseSource(voice, group);
  }

  private releaseSource(voice: ActiveVoice, group: VoiceSourceGroup): void {
    if (group.released) return;
    group.released = true;
    group.source.onended = null;
    for (const node of group.nodes) disconnectQuietly(node);
    this.activeNodeCount = Math.max(0, this.activeNodeCount - group.nodes.length);
    voice.sources.delete(group);
    if (voice.sources.size === 0) this.releaseVoice(voice, false);
  }

  private releaseVoice(voice: ActiveVoice, stopSources: boolean): void {
    if (voice.released) return;
    voice.released = true;
    this.activeVoices.delete(voice);
    for (const group of [...voice.sources]) {
      if (stopSources) try { group.source.stop(this.context?.currentTime); } catch { /* Already stopped. */ }
      this.releaseSource(voice, group);
    }
    this.releasedCues += 1;
  }

  private nextCueCounter(): number {
    const counter = this.cueCounter;
    this.cueCounter = (this.cueCounter + 1) >>> 0;
    return counter;
  }

  private tone(frequency: number, duration: number, gainValue: number, type: OscillatorType, sweep: number, delay = 0): void {
    const context = this.context; const output = this.output;
    if (context === null || output === null || context.state !== "running") return;
    const safeFrequency = clamp(finiteOr(frequency, 440), 30, 18_000);
    const safeDuration = clamp(finiteOr(duration, 0.01), 0.001, 5);
    const safeGain = clamp(finiteOr(gainValue, 0), 0, MAX_GAIN);
    if (safeGain === 0) return;
    const endFrequency = clamp(safeFrequency + finiteOr(sweep, 0), 30, 18_000);
    const oscillator = context.createOscillator(); const gain = context.createGain(); const start = context.currentTime + clamp(finiteOr(delay, 0), 0, 10);
    oscillator.type = type; oscillator.frequency.setValueAtTime(safeFrequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + safeDuration);
    gain.gain.setValueAtTime(safeGain, start); gain.gain.exponentialRampToValueAtTime(0.0001, start + safeDuration);
    oscillator.connect(gain); gain.connect(output); oscillator.start(start); oscillator.stop(start + safeDuration);
    this.trackSource(oscillator, [oscillator, gain], start + safeDuration);
  }

  private chord(frequencies: number[], duration: number, gain: number): void {
    frequencies.forEach((frequency, index) => this.tone(frequency, duration, gain, "sine", frequency * 0.08, index * .045));
  }

  private sequence(notes: Array<[number, number]>, delay: number, type: OscillatorType, gain = .05, sweepRatio = .18): void {
    notes.forEach(([frequency, duration], index) => this.tone(frequency, duration, gain, type, frequency * sweepRatio, index * delay / 1000));
  }

  private noise(duration: number, gainValue: number, filterType: BiquadFilterType = "lowpass", frequency = 1800, q = .7, delay = 0, endFrequency = frequency, seed?: number): void {
    const context = this.context; const output = this.output;
    if (context === null || output === null || context.state !== "running") return;
    const safeDuration = clamp(finiteOr(duration, 0.01), 0.001, 2);
    const safeGain = clamp(finiteOr(gainValue, 0), 0, MAX_GAIN);
    if (safeGain === 0) return;
    const startFrequency = clamp(finiteOr(frequency, 1800), 30, 18_000);
    const finishFrequency = clamp(finiteOr(endFrequency, startFrequency), 30, 18_000);
    const length = Math.max(1, Math.ceil(context.sampleRate * safeDuration)); const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0); let state = (seed ?? hash32(this.nextCueCounter(), 0x4e4f4953)) >>> 0 || 0x6d2b79f5;
    for (let index = 0; index < length; index += 1) {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      data[index] = (state >>> 0) / 0x80000000 - 1;
    }
    const source = context.createBufferSource(); const filter = context.createBiquadFilter(); const gain = context.createGain(); const start = context.currentTime + clamp(finiteOr(delay, 0), 0, 10);
    source.buffer = buffer; filter.type = filterType; filter.frequency.setValueAtTime(startFrequency, start); filter.frequency.exponentialRampToValueAtTime(finishFrequency, start + safeDuration); filter.Q.setValueAtTime(clamp(finiteOr(q, .7), 0.01, 40), start);
    gain.gain.setValueAtTime(safeGain, start); gain.gain.exponentialRampToValueAtTime(.0001, start + safeDuration);
    source.connect(filter); filter.connect(gain); gain.connect(output); source.start(start); source.stop(start + safeDuration);
    this.trackSource(source, [source, filter, gain], start + safeDuration);
  }
}
