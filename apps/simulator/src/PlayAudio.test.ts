import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioRegistry } from "@pachinko/effect-system";
import { AUDIO_CUE_IDS, AUDIO_CUE_MANIFESTS, MAX_AUDIO_VOICES, PlayAudio, createRuntimeAudioRegistry, launchCue, nailCue, noteFrequency } from "./PlayAudio.js";

afterEach(() => vi.unstubAllGlobals());

function captureAudio(action: (audio: PlayAudio) => void) {
  const tones: Array<{ start?: number; end?: number }> = [];
  const filters: Array<{ type?: string; start?: number; end?: number }> = [];
  const sources: Array<{ kind: "tone" | "noise"; start?: number; stop?: number }> = [];
  const audioParam = (target: { start?: number; end?: number }) => ({
    setValueAtTime: (value: number) => { target.start = value; },
    exponentialRampToValueAtTime: (value: number) => { target.end = value; },
    value: 0,
  });
  const connect = (node: unknown) => node;
  const timer = vi.fn();
  vi.stubGlobal("window", { setTimeout: timer });
  vi.stubGlobal("AudioContext", vi.fn(() => ({
    state: "running", currentTime: 0, sampleRate: 48_000, destination: {},
    createDynamicsCompressor: () => ({ threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, connect, disconnect: vi.fn() }),
    createGain: () => ({ gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect, disconnect: vi.fn() }),
    createOscillator: () => {
      const values = {}; const source: { kind: "tone"; start?: number; stop?: number } = { kind: "tone" }; tones.push(values); sources.push(source);
      return { type: "sine", frequency: audioParam(values), connect, disconnect: vi.fn(), onended: null, start: (at: number) => { source.start = at; }, stop: (at: number) => { source.stop = at; } };
    },
    createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => {
      const source: { kind: "noise"; start?: number; stop?: number } = { kind: "noise" }; sources.push(source);
      return { buffer: null, connect, disconnect: vi.fn(), onended: null, start: (at: number) => { source.start = at; }, stop: (at: number) => { source.stop = at; } };
    },
    createBiquadFilter: () => { const values: { type?: string; start?: number; end?: number } = {}; filters.push(values); return { get type() { return values.type ?? "lowpass"; }, set type(value: string) { values.type = value; }, frequency: audioParam(values), Q: { setValueAtTime: vi.fn() }, connect, disconnect: vi.fn() }; },
    close: vi.fn(),
  })));
  const audio = new PlayAudio();
  audio.unlock();
  action(audio);
  return { tones, filters, sources, timer };
}

interface ManagedSource {
  onended: (() => void) | null;
  readonly disconnect: ReturnType<typeof vi.fn>;
  finish(): void;
}

function managedAudioContext() {
  const sources: ManagedSource[] = [];
  let currentTime = 0;
  const connect = (node: unknown) => node;
  const parameter = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const createSource = (properties: Record<string, unknown>): ManagedSource & Record<string, unknown> => {
    const source = {
      ...properties,
      onended: null as (() => void) | null,
      connect,
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      finish() { const callback = source.onended; if (callback !== null) callback(); },
    };
    sources.push(source);
    return source;
  };
  const context = {
    state: "running",
    get currentTime() { return currentTime; },
    sampleRate: 48_000,
    destination: {},
    createDynamicsCompressor: () => ({ threshold: parameter(), knee: parameter(), ratio: parameter(), attack: parameter(), release: parameter(), connect, disconnect: vi.fn() }),
    createGain: () => ({ gain: parameter(), connect, disconnect: vi.fn() }),
    createOscillator: () => createSource({ type: "sine", frequency: parameter() }),
    createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    createBufferSource: () => createSource({ buffer: null }),
    createBiquadFilter: () => ({ type: "lowpass", frequency: parameter(), Q: parameter(), connect, disconnect: vi.fn() }),
    close: vi.fn(),
    resume: vi.fn(),
  } as unknown as AudioContext;
  return {
    context,
    sources,
    advanceTo(value: number) { currentTime = value; },
    finishAll() { for (const source of sources) source.finish(); },
  };
}

function policyRegistry(options: { readonly cooldownMs: number; readonly maxConcurrency: number; readonly includeStrike?: boolean }): AudioRegistry {
  const registry = new AudioRegistry();
  registry.register({ id: "nail", path: "procedural:nail", preload: true, priority: 10, cooldownMs: options.cooldownMs, maxConcurrency: options.maxConcurrency, group: "physical", tags: ["nail.hit"] });
  if (options.includeStrike === true) registry.register({ id: "storyStrike", path: "procedural:story-strike", preload: true, priority: 100, cooldownMs: 0, maxConcurrency: 1, group: "lottery", tags: ["result"] });
  return registry;
}

describe("musical pitch cues", () => {
  it("registers every runtime cue with explicit admission policy", () => {
    const registry = createRuntimeAudioRegistry();
    expect(registry.values().map(({ id }) => id)).toEqual(AUDIO_CUE_IDS);
    expect(AUDIO_CUE_MANIFESTS).toHaveLength(13);
    for (const manifest of registry.values()) {
      expect(manifest.priority).toBeGreaterThanOrEqual(0);
      expect(manifest.cooldownMs).toBeGreaterThanOrEqual(0);
      expect(manifest.maxConcurrency).toBeGreaterThan(0);
    }
    expect(registry.get("nail")).toMatchObject({ priority: 10, cooldownMs: 12, maxConcurrency: 8 });
    expect(MAX_AUDIO_VOICES).toBe(24);
  });

  it("maps note names to equal-tempered frequencies", () => {
    expect(noteFrequency("A4")).toBe(440);
    expect(noteFrequency("C5")).toBeCloseTo(523.251, 3);
    expect(noteFrequency("C7")).toBeCloseTo(noteFrequency("C6") * 2, 10);
    expect(noteFrequency("A7")).toBeCloseTo(noteFrequency("A6") * 2, 10);
    expect(noteFrequency("E8")).toBeCloseTo(noteFrequency("E7") * 2, 10);
    expect(() => noteFrequency("H4")).toThrow("Invalid note");
    expect(() => noteFrequency("C10")).toThrow("Invalid note");
  });

  it("keeps launch and metal-hit variation deterministic and finite", () => {
    const launch = launchCue(Number.NaN, 12);
    expect(launchCue(Number.NaN, 12)).toEqual(launch);
    expect(launchCue(Number.NaN, 13)).not.toEqual(launch);
    expect(Object.values(launch).every(Number.isFinite)).toBe(true);
    expect(launch.intensity).toBeGreaterThanOrEqual(0.45);
    expect(launch.intensity).toBeLessThanOrEqual(1);

    expect(nailCue(0.17, 1)).toBeNull();
    expect(nailCue(Number.POSITIVE_INFINITY, 1)).toBeNull();
    const hit = nailCue(99, 7);
    expect(hit).not.toBeNull();
    expect(hit?.intensity).toBe(1);
    expect(Object.values(hit ?? {}).every(Number.isFinite)).toBe(true);
  });

  it("captures the exact pitch sweeps used by every runtime cue", () => {
    const starts = (action: Parameters<typeof captureAudio>[0]) => captureAudio(action).tones.map((tone) => tone.start);
    expect(starts((audio) => audio.pocket())).toEqual([noteFrequency("C5"), noteFrequency("C6"), noteFrequency("E6"), noteFrequency("G6"), noteFrequency("C7")]);
    expect(starts((audio) => audio.out())).toEqual([105]);
    expect(starts((audio) => audio.rush())).toEqual([392, 523.25, 659.25, 783.99]);
    expect(starts((audio) => audio.storyAlarm())).toEqual([190, 190, 285]);
    expect(starts((audio) => audio.storyLaunch())).toEqual([70]);
    expect(starts((audio) => audio.hotAlert())).toEqual([92, 880, 1320, 1760]);
    expect(starts((audio) => audio.storyImpact())).toEqual([55]);
    expect(starts((audio) => audio.storySync())).toEqual([330, 440, 660, 990]);
    expect(starts((audio) => audio.storyStrike())).toEqual([110, 220, 440, 880]);
    expect(starts((audio) => audio.kyuin())).toEqual([1_500, 1_500 * 2.76]);
    expect(starts((audio) => audio.normal())).toEqual([523.25, 392]);

    const kyuin = captureAudio((audio) => audio.kyuin()).tones;
    expect(kyuin.map((tone) => tone.end)).toEqual([6_400, 6_400 * 2.76]);
    expect(captureAudio((audio) => audio.kyuin()).filters).toMatchObject([{ type: "highpass", start: 3_000, end: 3_000 }]);
    expect(captureAudio((audio) => audio.kyuin()).sources.every((source) => source.start === 0)).toBe(true);

    const nail = captureAudio((audio) => audio.nail(3.5));
    const resonance = nailCue(3.5, 0)?.resonance ?? 0;
    expect(nail.tones.map((tone) => tone.start)).toEqual([resonance, resonance * 2.32, resonance * 3.87]);
    expect(nail.tones[2]?.start).toBeGreaterThan(7_000);
    expect(nail.filters).toMatchObject([{ type: "highpass", start: 4_100, end: 5_200 }]);
  });

  it("schedules the story-launch impact on the shared AudioContext clock", () => {
    const capture = captureAudio((audio) => audio.storyLaunch());
    expect(capture.sources).toMatchObject([
      { kind: "tone", start: 0, stop: .65 },
      { kind: "noise", start: .18, stop: .5 },
    ]);
    expect(capture.timer).not.toHaveBeenCalled();
  });

  it("bounds a high-density nail collision burst and releases every transient node", () => {
    const fake = managedAudioContext();
    const audio = new PlayAudio({ contextFactory: () => fake.context });
    audio.unlock();
    for (let event = 0; event < 1_000; event += 1) audio.nail(3.5);
    expect(audio.diagnostics()).toMatchObject({
      activeVoices: 1,
      peakActiveVoices: 1,
      startedCues: 1,
      rejectedByCooldown: 999,
      rejectedByConcurrency: 0,
    });
    expect(audio.diagnostics().peakActiveVoices).toBeLessThanOrEqual(8);
    fake.finishAll();
    expect(audio.diagnostics()).toMatchObject({ activeVoices: 0, activeNodes: 0, releasedCues: 1 });
  });

  it("enforces per-cue concurrency independently from cooldown", () => {
    const fake = managedAudioContext();
    const audio = new PlayAudio({ contextFactory: () => fake.context, registry: policyRegistry({ cooldownMs: 0, maxConcurrency: 2 }) });
    audio.unlock();
    for (let event = 0; event < 10; event += 1) audio.nail(3.5);
    expect(audio.diagnostics()).toMatchObject({ activeVoices: 2, peakActiveVoices: 2, startedCues: 2, rejectedByConcurrency: 8 });
    fake.finishAll();
    expect(audio.diagnostics()).toMatchObject({ activeVoices: 0, activeNodes: 0 });
  });

  it("preempts a lower-priority physical voice for a confirmation cue", () => {
    const fake = managedAudioContext();
    const audio = new PlayAudio({ contextFactory: () => fake.context, registry: policyRegistry({ cooldownMs: 0, maxConcurrency: 8, includeStrike: true }), maxVoices: 1 });
    audio.unlock();
    audio.nail(3.5);
    audio.storyStrike();
    expect(audio.diagnostics()).toMatchObject({ activeVoices: 1, peakActiveVoices: 1, preemptedVoices: 1, activeByCue: { storyStrike: 1 } });
    fake.finishAll();
    expect(audio.diagnostics()).toMatchObject({ activeVoices: 0, activeNodes: 0 });
  });

  it("keeps physical cues silent throughout an indefinite PUSH wait", async () => {
    const createOscillator = vi.fn();
    const createBuffer = vi.fn();
    const compressor = { threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, connect: vi.fn() };
    const master = { gain: { value: 0 }, connect: vi.fn() };
    const close = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("AudioContext", vi.fn(() => ({ state: "running", currentTime: 0, destination: {}, createDynamicsCompressor: () => compressor, createGain: () => master, createOscillator, createBuffer, close })));
    const { PlayAudio } = await import("./PlayAudio.js");
    const audio = new PlayAudio();
    audio.unlock();
    audio.silence(Number.POSITIVE_INFINITY);
    audio.launch(); audio.nail(1); audio.pocket();
    expect(createOscillator).not.toHaveBeenCalled();
    expect(createBuffer).not.toHaveBeenCalled();
    audio.dispose();
  });
});
