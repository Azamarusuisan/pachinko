import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createServer } from "vite";
import { analyzePcm, cubicTruePeakProxy4x } from "./pitch.js";
import type { PcmAnalysis } from "./pitch.js";

const SAMPLE_RATE = 48_000;
const RAW_FLOAT_TOLERANCE = 2e-6;
const CUES = ["launch", "nail", "pocket", "out", "rush", "storyAlarm", "storyLaunch", "hotAlert", "storyImpact", "storySync", "storyStrike", "kyuin", "normal"] as const;
const NOJIRU_REFERENCE = {
  repository: "https://github.com/SHOGO391/nojiru.git",
  commit: "bbefab094522f17c85342f2fe4822f7e881292eb",
  deterministicDsp: "packages/audio-lab/src/dsp.ts:18-21,83-88",
  semitonePitch: "packages/audio-lab/src/se.ts:34-35",
  catalogManifest: "tools/assetgen/src/audio.ts:59-115",
  deterministicTests: "packages/audio-lab/tests/audio.test.ts:62-71,140-175",
} as const;

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1] ?? fallback;
}

function trim(samples: Float32Array): Float32Array {
  let end = samples.length - 1;
  while (end > 0 && Math.abs(samples[end] ?? 0) < 1e-7) end -= 1;
  return samples.slice(0, Math.min(samples.length, end + 1 + Math.round(SAMPLE_RATE * 0.01)));
}

type Cue = typeof CUES[number];
type CueReport = Omit<PcmAnalysis, "frames"> & { readonly cue: Cue; readonly sha256: string };

interface RuntimeAudioDiagnostics {
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
  readonly activeByCue: Readonly<Record<string, number>>;
  readonly startedByCue: Readonly<Record<string, number>>;
}

interface RenderedCue {
  readonly pcm: Buffer;
  readonly diagnosticsBeforeRendering: RuntimeAudioDiagnostics;
  readonly diagnosticsAfterRendering: RuntimeAudioDiagnostics;
  readonly manifestMaxConcurrency: number | undefined;
}

async function renderCue(page: Page, cue: Cue, repetitions = 1): Promise<RenderedCue> {
  const renderedCue = await page.evaluate(async ({ cueName, sampleRate, cueRepetitions }) => {
    const runtimeModulePath = "/src/PlayAudio.ts";
    const loadedModule = await import(/* @vite-ignore */ runtimeModulePath) as unknown;
    if (typeof loadedModule !== "object" || loadedModule === null || !("PlayAudio" in loadedModule) || typeof loadedModule.PlayAudio !== "function") {
      throw new Error("PlayAudio export is unavailable");
    }
    const runtimeModule = loadedModule as Record<string, unknown>;
    const PlayAudio = runtimeModule.PlayAudio as new () => Record<string, unknown>;
    const renderedContext: { value?: OfflineAudioContext } = {};
    const originalAudioContext = window.AudioContext;
    const TestAudioContext = new Proxy(originalAudioContext, {
      construct() {
        const context = new OfflineAudioContext(1, sampleRate * 2, sampleRate);
        renderedContext.value = context;
        return {
          get currentTime() { return context.currentTime; },
          get destination() { return context.destination; },
          get sampleRate() { return context.sampleRate; },
          get state() { return "running" as AudioContextState; },
          close: async () => undefined,
          resume: async () => undefined,
          createBiquadFilter: () => context.createBiquadFilter(),
          createBuffer: (channels: number, length: number, rate: number) => context.createBuffer(channels, length, rate),
          createBufferSource: () => context.createBufferSource(),
          createDynamicsCompressor: () => context.createDynamicsCompressor(),
          createGain: () => context.createGain(),
          createOscillator: () => context.createOscillator(),
        } as unknown as AudioContext;
      },
    });
    Object.defineProperty(window, "AudioContext", { configurable: true, value: TestAudioContext });
    try {
      const audio = new PlayAudio();
      const unlock = audio.unlock;
      if (typeof unlock !== "function") throw new Error("PlayAudio.unlock is unavailable");
      (unlock as () => void).call(audio);
      const cueMethod = audio[cueName];
      if (typeof cueMethod !== "function") throw new Error(`PlayAudio.${cueName} is unavailable`);
      for (let repetition = 0; repetition < cueRepetitions; repetition += 1) {
        (cueMethod as (strength?: number) => void).call(audio, ...(cueName === "launch" || cueName === "nail" ? [3.5] : []));
      }
      const diagnosticsMethod = audio.diagnostics;
      if (typeof diagnosticsMethod !== "function") throw new Error("PlayAudio.diagnostics is unavailable");
      const diagnosticsBeforeRendering = (diagnosticsMethod as () => RuntimeAudioDiagnostics).call(audio);
      const offline = renderedContext.value;
      if (offline === undefined) throw new Error(`No OfflineAudioContext for ${cueName}`);
      const rendered = await offline.startRendering();
      const diagnosticsAfterRendering = (diagnosticsMethod as () => RuntimeAudioDiagnostics).call(audio);
      const bytes = new Uint8Array(rendered.getChannelData(0).buffer);
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      let manifestMaxConcurrency: number | undefined;
      if (cueName === "nail" && Array.isArray(runtimeModule.AUDIO_CUE_MANIFESTS)) {
        const manifest = runtimeModule.AUDIO_CUE_MANIFESTS.find((entry: unknown) => typeof entry === "object" && entry !== null && "id" in entry && entry.id === "nail") as { maxConcurrency?: unknown } | undefined;
        if (typeof manifest?.maxConcurrency === "number") manifestMaxConcurrency = manifest.maxConcurrency;
      }
      return { encoded: btoa(binary), diagnosticsBeforeRendering, diagnosticsAfterRendering, manifestMaxConcurrency };
    } finally {
      Object.defineProperty(window, "AudioContext", { configurable: true, value: originalAudioContext });
    }
  }, { cueName: cue, sampleRate: SAMPLE_RATE, cueRepetitions: repetitions });
  const { encoded, ...metadata } = renderedCue;
  return { ...metadata, pcm: Buffer.from(encoded, "base64") };
}

function decodeFloat32(bytes: Buffer): Float32Array {
  if (bytes.length % Float32Array.BYTES_PER_ELEMENT !== 0) throw new Error("Rendered PCM byte length is invalid");
  const samples = new Float32Array(bytes.length / Float32Array.BYTES_PER_ELEMENT);
  for (let index = 0; index < samples.length; index += 1) samples[index] = bytes.readFloatLE(index * Float32Array.BYTES_PER_ELEMENT);
  return samples;
}

function rawDifference(first: Float32Array, second: Float32Array): number {
  if (first.length !== second.length) throw new Error("Rendered PCM lengths differ");
  let maximumDifference = 0;
  for (let index = 0; index < first.length; index += 1) {
    const difference = Math.abs((first[index] ?? 0) - (second[index] ?? 0));
    maximumDifference = Math.max(maximumDifference, difference);
  }
  return maximumDifference;
}

function canonicalPcm16(samples: Float32Array): Buffer {
  const maximum = 0x7fff;
  const bytes = Buffer.allocUnsafe(samples.length * 2);
  for (let index = 0; index < samples.length; index += 1) {
    const normalized = Math.min(1, Math.max(-1, samples[index] ?? 0));
    // Nojiru's WAV encoder first maps -1..1 to signed PCM16. Clearing four
    // insignificant bits makes Web Audio's sub-ULP compressor variance hash-stable.
    const quantized = Math.trunc(Math.round(normalized * maximum) / 16) * 16;
    bytes.writeInt16LE(quantized, index * 2);
  }
  return bytes;
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => typeof item === "number" && Number.isFinite(item) ? Number(item.toPrecision(4)) : item, 2);
}

async function main(): Promise<void> {
  const server = await createServer({ root: resolve("apps/simulator"), configFile: false, logLevel: "error", server: { host: "127.0.0.1", port: 0, strictPort: false } });
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
  try {
    await server.listen();
    const origin = server.resolvedUrls?.local[0];
    if (origin === undefined) throw new Error("Vite did not expose a local URL");
    const cdpEndpoint = argument("--cdp", "http://127.0.0.1:9223");
    browser = await chromium.connectOverCDP(cdpEndpoint);
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      try {
        await page.addInitScript({ content: "globalThis.__name=(target,value)=>Object.defineProperty(target,'name',{value,configurable:true});" });
        await page.goto(`${origin}src/PlayAudio.ts`);
        const cues: CueReport[] = [];
        for (const cue of CUES) {
          const first = await renderCue(page, cue);
          const second = await renderCue(page, cue);
          const firstRaw = decodeFloat32(first.pcm);
          const secondRaw = decodeFloat32(second.pcm);
          const maximumDifference = rawDifference(firstRaw, secondRaw);
          if (maximumDifference > RAW_FLOAT_TOLERANCE) throw new Error(`${cue}: raw PCM differs by ${maximumDifference}, above ${RAW_FLOAT_TOLERANCE}`);
          const firstSamples = trim(firstRaw);
          const secondSamples = trim(secondRaw);
          const firstHash = createHash("sha256").update(canonicalPcm16(firstSamples)).digest("hex");
          const secondHash = createHash("sha256").update(canonicalPcm16(secondSamples)).digest("hex");
          if (firstHash !== secondHash) throw new Error(`${cue}: canonical 12-bit PCM is not deterministic`);
          const { frames, ...analysis } = analyzePcm(firstSamples, SAMPLE_RATE);
          void frames;
          cues.push({ cue, sha256: firstHash, ...analysis });
        }
        const stressEvents = 1_000;
        const firstStress = await renderCue(page, "nail", stressEvents);
        const secondStress = await renderCue(page, "nail", stressEvents);
        const firstStressRaw = decodeFloat32(firstStress.pcm);
        const secondStressRaw = decodeFloat32(secondStress.pcm);
        const stressMaximumDifference = rawDifference(firstStressRaw, secondStressRaw);
        if (stressMaximumDifference > RAW_FLOAT_TOLERANCE) throw new Error(`nail stress: raw PCM differs by ${stressMaximumDifference}, above ${RAW_FLOAT_TOLERANCE}`);
        const firstStressSamples = trim(firstStressRaw);
        const secondStressSamples = trim(secondStressRaw);
        const firstStressHash = createHash("sha256").update(canonicalPcm16(firstStressSamples)).digest("hex");
        const secondStressHash = createHash("sha256").update(canonicalPcm16(secondStressSamples)).digest("hex");
        if (firstStressHash !== secondStressHash) throw new Error("nail stress: canonical 12-bit PCM is not deterministic");
        const maxConcurrency = firstStress.manifestMaxConcurrency;
        if (maxConcurrency === undefined) throw new Error("nail stress: production manifest maxConcurrency is unavailable");
        const before = firstStress.diagnosticsBeforeRendering;
        const after = firstStress.diagnosticsAfterRendering;
        if (before.peakActiveVoices > maxConcurrency) throw new Error(`nail stress: peak voices ${before.peakActiveVoices} exceed manifest max ${maxConcurrency}`);
        const accountedEvents = before.startedCues + before.rejectedByCooldown + before.rejectedByConcurrency + before.rejectedByPriority;
        if (accountedEvents !== stressEvents) throw new Error(`nail stress: ${accountedEvents}/${stressEvents} collision events were accounted for`);
        if (after.activeVoices !== 0 || after.activeNodes !== 0) throw new Error(`nail stress: leaked ${after.activeVoices} voices and ${after.activeNodes} nodes`);
        const { frames: stressFrames, ...stressAnalysis } = analyzePcm(firstStressSamples, SAMPLE_RATE);
        void stressFrames;
        const truePeakProxy = cubicTruePeakProxy4x(firstStressSamples);
        if (stressAnalysis.peak >= 1 || stressAnalysis.clippedSampleRatio !== 0) throw new Error(`nail stress: sample clipping detected (peak=${stressAnalysis.peak}, clipped=${stressAnalysis.clippedSampleRatio})`);
        if (truePeakProxy >= 1) throw new Error(`nail stress: cubic 4x true-peak proxy is ${truePeakProxy}`);
        const nailCollisionStress = {
          collisionEvents: stressEvents,
          scheduling: "all calls at AudioContext.currentTime=0",
          manifestMaxConcurrency: maxConcurrency,
          diagnosticsBeforeRendering: before,
          diagnosticsAfterRendering: after,
          durationSeconds: stressAnalysis.durationSeconds,
          samplePeak: stressAnalysis.peak,
          clippedSampleRatio: stressAnalysis.clippedSampleRatio,
          cubic4xTruePeakProxy: truePeakProxy,
          truePeakMethod: "Catmull-Rom cubic interpolation at 4x; screening proxy, not ITU-R BS.1770",
          rawFloatDeterministicWithinTolerance: true,
          rawFloatTolerance: RAW_FLOAT_TOLERANCE,
          sha256: firstStressHash,
          deterministic: true,
        } as const;
        const out = resolve(argument("--out", "research-data/runtime-cue-report.json"));
        const runtimeSourceSha256 = createHash("sha256").update(await readFile(resolve("apps/simulator/src/PlayAudio.ts"))).digest("hex");
        await mkdir(dirname(out), { recursive: true });
        await writeFile(out, `${stableJson({ version: 1, renderer: "PlayAudio/Chromium OfflineAudioContext", runtimeSource: "apps/simulator/src/PlayAudio.ts", runtimeSourceSha256, browserVersion: browser.version(), sampleRate: SAMPLE_RATE, hashPcmFormat: "signed 16-bit little-endian, low 4 bits cleared", deterministic: true, determinismScope: "canonical PCM; raw browser floats must agree within tolerance", rawFloatTolerance: RAW_FLOAT_TOLERANCE, reportPrecisionSignificantDigits: 4, generatedReference: NOJIRU_REFERENCE, nailCollisionStress, cues })}\n`);
        process.stdout.write(`${JSON.stringify({ cues: cues.length, stressEvents, sampleRate: SAMPLE_RATE, deterministic: true, out }, null, 2)}\n`);
      } finally {
        await page.close();
      }
    } finally {
      await context.close();
    }
  } finally {
    await server.close();
  }
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  },
);
