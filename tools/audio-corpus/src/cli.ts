import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { access, copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import {
  aggregateFeatureFrames,
  buildCorpusPlan,
  EVENT_TYPES,
  featureObservationSchema,
  generatedReferenceRevision,
  imageObservationSchema,
  MEDIA_DOMAINS,
  parseFfmpegMetadata,
  sourceRecordSchema,
  stableSplit,
  stratifiedFeatureSample,
  type FeatureObservation,
  type SourceRecord,
} from "./index.js";
import { buildMusicReport, musicPitchReportSchema } from "./music-report.js";
import { harvestOpenverse, type OpenverseMedia } from "./openverse.js";
import { analyzePcm, summarizePitchWindows } from "./pitch.js";
import { harvestWikimedia } from "./wikimedia.js";

const MEDIA_EXTENSIONS = new Set([".aac", ".flac", ".m4a", ".mkv", ".mov", ".mp3", ".mp4", ".ogg", ".opus", ".wav", ".webm"]);
const ANALYSIS_SAMPLE_RATE = 48_000;

function value(args: readonly string[], name: string, fallback?: string): string {
  const index = args.indexOf(name);
  const found = index >= 0 ? args[index + 1] : fallback;
  if (found === undefined || found.startsWith("--")) throw new Error(`Missing ${name}`);
  return found;
}

function values(args: readonly string[], name: string): string[] {
  const found: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== name) continue;
    const item = args[index + 1];
    if (item === undefined || item.startsWith("--")) throw new Error(`Missing ${name}`);
    found.push(item);
  }
  return found;
}

function positiveInteger(input: string, name: string): number {
  const parsed = Number(input);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function nonnegativeInteger(input: string, name: string): number {
  const parsed = Number(input);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${name} must be a nonnegative integer`);
  return parsed;
}

async function parseNdjson<T>(path: string, parser: (input: unknown) => T): Promise<T[]> {
  const text = await readFile(resolve(path), "utf8");
  return text.split(/\r?\n/).flatMap((line, index) => {
    if (line.trim() === "") return [];
    try { return [parser(JSON.parse(line))]; }
    catch (error) { throw new Error(`${path}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`); }
  });
}

async function parseNdjsonFiles<T>(paths: readonly string[], parser: (input: unknown) => T): Promise<T[]> {
  return (await Promise.all(paths.map((path) => parseNdjson(path, parser)))).flat();
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", resolvePromise);
    stream.on("error", reject);
  });
  return hash.digest("hex");
}

async function ffmpegMetadata(path: string): Promise<string> {
  if (!MEDIA_EXTENSIONS.has(extname(path).toLowerCase())) throw new Error(`Unsupported media extension: ${path}`);
  await access(path);
  const filter = [
    `aformat=sample_rates=${ANALYSIS_SAMPLE_RATE}:channel_layouts=mono`,
    "ebur128=metadata=1",
    "astats=metadata=1:reset=1:measure_perchannel=none:measure_overall=Peak_level+RMS_level+Entropy",
    "aspectralstats=win_size=2048:overlap=0.5:measure=centroid+spread+entropy+flatness+crest+flux+rolloff",
    "ametadata=mode=print:file=-:direct=1",
  ].join(",");
  // ponytail: metadata is buffered per source; switch to line streaming if single inputs exceed one hour.
  return new Promise((resolvePromise, reject) => {
    const child = spawn("ffmpeg", ["-v", "error", "-nostats", "-i", path, "-map", "0:a:0", "-af", filter, "-f", "null", "-"], { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise(Buffer.concat(stdout).toString("utf8"));
      else reject(new Error(`ffmpeg exited ${code}: ${Buffer.concat(stderr).toString("utf8").trim()}`));
    });
  });
}

async function ffmpegPcm(path: string): Promise<Float32Array> {
  if (!MEDIA_EXTENSIONS.has(extname(path).toLowerCase())) throw new Error(`Unsupported media extension: ${path}`);
  await access(path);
  // ponytail: PCM is buffered per source; stream it if individual inputs grow beyond a few minutes.
  return new Promise((resolvePromise, reject) => {
    const child = spawn("ffmpeg", ["-v", "error", "-nostats", "-i", path, "-map", "0:a:0", "-ac", "1", "-ar", String(ANALYSIS_SAMPLE_RATE), "-f", "f32le", "-"], { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) { reject(new Error(`ffmpeg exited ${code}: ${Buffer.concat(stderr).toString("utf8").trim()}`)); return; }
      const bytes = Buffer.concat(stdout);
      if (bytes.length === 0 || bytes.length % 4 !== 0) { reject(new Error(`${path}: invalid PCM byte length ${bytes.length}`)); return; }
      const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      resolvePromise(new Float32Array(copy));
    });
  });
}

async function writeAtomic(path: string, text: string, force: boolean): Promise<void> {
  const absolute = resolve(path);
  if (!force) {
    try { await access(absolute); throw new Error(`${absolute} exists; pass --force to replace it`); }
    catch (error) { if (error instanceof Error && !error.message.includes("ENOENT")) throw error; }
  }
  const temporary = `${absolute}.tmp-${process.pid}`;
  try { await writeFile(temporary, text); await rename(temporary, absolute); }
  catch (error) { await rm(temporary, { force: true }); throw error; }
}

const IMAGE_EXTENSIONS = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

async function downloadImage(source: SourceRecord, directory: string, cacheDirectory: string | undefined, force: boolean): Promise<readonly [SourceRecord, boolean]> {
  if (source.assetUrl === undefined) throw new Error(`${source.id}: assetUrl is required`);
  if (!force) {
    for (const extension of IMAGE_EXTENSIONS.values()) {
      const existing = join(directory, `${source.id}${extension}`);
      try { await access(existing); return [sourceRecordSchema.parse({ ...source, localPath: relative(process.cwd(), existing), sha256: await sha256(existing) }), false]; }
      catch (error) { if (error instanceof Error && !error.message.includes("ENOENT")) throw error; }
    }
    if (cacheDirectory !== undefined) {
      for (const extension of IMAGE_EXTENSIONS.values()) {
        const cached = join(cacheDirectory, `${source.id}${extension}`);
        const target = join(directory, `${source.id}${extension}`);
        try {
          await access(cached);
          await copyFile(cached, target);
          return [sourceRecordSchema.parse({ ...source, localPath: relative(process.cwd(), target), sha256: await sha256(target) }), false];
        } catch (error) { if (error instanceof Error && !error.message.includes("ENOENT")) throw error; }
      }
    }
  }
  let response: Response | undefined;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const candidate = await fetch(source.assetUrl, { headers: { "User-Agent": "pachinko-research/0.1 (https://github.com/Azamarusuisan/pachinko; local reference corpus)" }, redirect: "follow", signal: AbortSignal.timeout(30_000) });
      if (candidate.ok) { response = candidate; break; }
      if (candidate.status !== 429 && candidate.status !== 503) throw new Error(`${source.id}: download failed ${candidate.status}`);
      const retryAfter = Number(candidate.headers.get("retry-after"));
      await candidate.body?.cancel();
      await new Promise((resolvePromise) => setTimeout(resolvePromise, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : 5_000 * (attempt + 1)));
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000 * (attempt + 1)));
    }
  }
  if (response === undefined) throw new Error(`${source.id}: download failed after 4 attempts`);
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  const extension = contentType === undefined ? undefined : IMAGE_EXTENSIONS.get(contentType);
  if (extension === undefined) throw new Error(`${source.id}: unsupported Content-Type ${contentType ?? "missing"}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1_024 || bytes.length > 15_000_000) throw new Error(`${source.id}: invalid image size ${bytes.length}`);
  const absolute = join(directory, `${source.id}${extension}`);
  if (!force) {
    try { await access(absolute); return [sourceRecordSchema.parse({ ...source, localPath: relative(process.cwd(), absolute), sha256: await sha256(absolute) }), false]; }
    catch (error) { if (error instanceof Error && !error.message.includes("ENOENT")) throw error; }
  }
  const temporary = `${absolute}.tmp-${process.pid}`;
  try { await writeFile(temporary, bytes); await rename(temporary, absolute); }
  catch (error) { await rm(temporary, { force: true }); throw error; }
  return [sourceRecordSchema.parse({ ...source, localPath: relative(process.cwd(), absolute), sha256: createHash("sha256").update(bytes).digest("hex") }), true];
}

function countBy<T extends string>(values: readonly T[]): Record<T, number> {
  const counts = {} as Record<T, number>;
  for (const item of values) counts[item] = (counts[item] ?? 0) + 1;
  return counts;
}

async function plan(args: readonly string[]): Promise<void> {
  const result = buildCorpusPlan(
    positiveInteger(value(args, "--audio", "100000"), "--audio"),
    positiveInteger(value(args, "--images", "100"), "--images"),
    positiveInteger(value(args, "--window-ms", "500"), "--window-ms"),
  );
  const text = `${JSON.stringify(result, null, 2)}\n`;
  const out = args.includes("--out") ? value(args, "--out") : undefined;
  if (out === undefined) process.stdout.write(text);
  else await writeAtomic(out, text, args.includes("--force"));
}

async function extract(args: readonly string[]): Promise<void> {
  const sources = await parseNdjson(value(args, "--manifest"), (input) => sourceRecordSchema.parse(input));
  const windowMs = positiveInteger(value(args, "--window-ms", "500"), "--window-ms");
  const target = positiveInteger(value(args, "--target", "100000"), "--target");
  const observations: FeatureObservation[] = [];
  const sourceHashes = new Set<string>();
  for (const source of sources) {
    if (source.mediaType === "image" || source.localPath === undefined) continue;
    if (source.rights === "unknown") throw new Error(`${source.id}: rights must be known before extraction`);
    const localPath = resolve(source.localPath);
    const withHash: SourceRecord = sourceRecordSchema.parse({ ...source, sha256: source.sha256 ?? await sha256(localPath) });
    if (withHash.sha256 === undefined || sourceHashes.has(withHash.sha256)) continue;
    sourceHashes.add(withHash.sha256);
    const [metadata, pcm] = await Promise.all([ffmpegMetadata(localPath), ffmpegPcm(localPath)]);
    const pitchByWindow = summarizePitchWindows(analyzePcm(pcm, ANALYSIS_SAMPLE_RATE).frames, windowMs);
    const enriched = aggregateFeatureFrames(withHash, parseFfmpegMetadata(metadata), windowMs).map((observation) => featureObservationSchema.parse({
      ...observation,
      ...pitchByWindow.get(Math.floor(observation.startMs / windowMs)),
    }));
    observations.push(...enriched);
  }
  const selected = stratifiedFeatureSample(observations, target, windowMs);
  const out = value(args, "--out");
  await writeAtomic(out, selected.map((row) => JSON.stringify(row)).join("\n") + (selected.length > 0 ? "\n" : ""), args.includes("--force"));
  process.stdout.write(`${JSON.stringify({ extracted: observations.length, uniqueSources: sourceHashes.size, observations: selected.length, target, complete: selected.length >= target, byDomain: countBy(selected.map((row) => row.domain)), bySplit: countBy(selected.map((row) => row.split)), out }, null, 2)}\n`);
}

async function pitchReport(args: readonly string[]): Promise<void> {
  const sources = await parseNdjson(value(args, "--manifest"), (input) => sourceRecordSchema.parse(input));
  const reports = [];
  for (const source of sources) {
    if (source.mediaType === "image" || source.localPath === undefined) continue;
    const localPath = resolve(source.localPath);
    const analysis = analyzePcm(await ffmpegPcm(localPath), ANALYSIS_SAMPLE_RATE);
    reports.push({ source: sourceRecordSchema.parse({ ...source, sha256: source.sha256 ?? await sha256(localPath) }), analysis });
  }
  const out = value(args, "--out");
  await writeAtomic(out, `${JSON.stringify({ sampleRate: ANALYSIS_SAMPLE_RATE, reports }, null, 2)}\n`, args.includes("--force"));
  process.stdout.write(`${JSON.stringify({ sources: reports.length, sampleRate: ANALYSIS_SAMPLE_RATE, out }, null, 2)}\n`);
}

async function musicReport(args: readonly string[]): Promise<void> {
  const manifestPath = resolve(value(args, "--manifest"));
  const featuresPath = resolve(value(args, "--features"));
  const pitchPath = resolve(value(args, "--pitch"));
  const [sources, features, pitch, manifestSha256, featuresSha256, pitchSha256] = await Promise.all([
    parseNdjson(manifestPath, (input) => sourceRecordSchema.parse(input)),
    parseNdjson(featuresPath, (input) => featureObservationSchema.parse(input)),
    readFile(pitchPath, "utf8").then((text) => musicPitchReportSchema.parse(JSON.parse(text) as unknown)),
    sha256(manifestPath),
    sha256(featuresPath),
    sha256(pitchPath),
  ]);
  const report = { ...buildMusicReport(sources, features, pitch), inputSha256: { manifest: manifestSha256, features: featuresSha256, pitch: pitchSha256 } };
  const text = `${JSON.stringify(report, null, 2)}\n`;
  const out = args.includes("--out") ? value(args, "--out") : undefined;
  if (out === undefined) process.stdout.write(text);
  else await writeAtomic(out, text, args.includes("--force"));
}

async function validate(args: readonly string[]): Promise<void> {
  const manifestPaths = values(args, "--manifest");
  if (manifestPaths.length === 0) throw new Error("Missing --manifest");
  const sources = await parseNdjsonFiles(manifestPaths, (input) => sourceRecordSchema.parse(input));
  const sourceIds = new Set<string>();
  for (const source of sources) {
    if (sourceIds.has(source.id)) throw new Error(`Duplicate source id: ${source.id}`);
    sourceIds.add(source.id);
  }
  const featurePaths = values(args, "--features");
  const features = await parseNdjsonFiles(featurePaths, (input) => featureObservationSchema.parse(input));
  const imagePaths = values(args, "--images");
  const images = await parseNdjsonFiles(imagePaths, (input) => imageObservationSchema.parse(input));
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const problems = {
    duplicateFeatureIds: [] as string[],
    duplicateImageIds: [] as string[],
    missingSources: [] as string[],
    mediaTypeMismatches: [] as string[],
    domainMismatches: [] as string[],
    eventMismatches: [] as string[],
    datasetRoleMismatches: [] as string[],
    sourceHashMismatches: [] as string[],
    rightsMismatches: [] as string[],
    splitMismatches: [] as string[],
    missingLocalFiles: [] as string[],
    hashMismatches: [] as string[],
    missingGeneratedReferenceRevisions: [] as string[],
  };
  for (const source of sources) {
    if (source.datasetRole === "generated-reference" && generatedReferenceRevision(source) === undefined) problems.missingGeneratedReferenceRevisions.push(source.id);
  }
  const featureIds = new Set<string>();
  const splitsByHash = new Map<string, Set<string>>();
  const uniqueWindows = new Map<string, FeatureObservation>();
  for (const feature of features) {
    if (featureIds.has(feature.id)) problems.duplicateFeatureIds.push(feature.id);
    featureIds.add(feature.id);
    const source = sourcesById.get(feature.sourceId);
    if (source === undefined) { problems.missingSources.push(`${feature.id}:${feature.sourceId}`); continue; }
    let matches = true;
    if (source.mediaType === "image") { problems.mediaTypeMismatches.push(feature.id); matches = false; }
    if (source.domain !== feature.domain) { problems.domainMismatches.push(feature.id); matches = false; }
    if (source.eventType !== feature.eventType) { problems.eventMismatches.push(feature.id); matches = false; }
    if (source.datasetRole !== feature.datasetRole) { problems.datasetRoleMismatches.push(feature.id); matches = false; }
    if (source.sha256 !== feature.sourceSha256) { problems.sourceHashMismatches.push(feature.id); matches = false; }
    if (source.rights !== feature.rights || source.licenseName !== feature.licenseName) { problems.rightsMismatches.push(feature.id); matches = false; }
    if (!matches) continue;
    const expectedSplit = stableSplit(feature.sourceSha256);
    if (feature.split !== expectedSplit) problems.splitMismatches.push(feature.id);
    const splits = splitsByHash.get(feature.sourceSha256) ?? new Set<string>();
    splits.add(feature.split);
    splitsByHash.set(feature.sourceSha256, splits);
    uniqueWindows.set(`${feature.sourceSha256}:${feature.startMs}:${feature.durationMs}`, feature);
  }
  const imageIds = new Set<string>();
  for (const image of images) {
    if (imageIds.has(image.id)) problems.duplicateImageIds.push(image.id);
    imageIds.add(image.id);
    const source = sourcesById.get(image.sourceId);
    if (source === undefined) { problems.missingSources.push(`${image.id}:${image.sourceId}`); continue; }
    if (source.mediaType !== "image") problems.mediaTypeMismatches.push(image.id);
    if (source.domain !== image.domain) problems.domainMismatches.push(image.id);
    if (source.sha256 === undefined || image.split !== stableSplit(source.sha256)) problems.splitMismatches.push(image.id);
  }
  const imageSources = sources.filter((source) => source.mediaType === "image");
  const targetAudio = args.includes("--target-audio")
    ? positiveInteger(value(args, "--target-audio"), "--target-audio")
    : args.includes("--target") ? positiveInteger(value(args, "--target"), "--target") : featurePaths.length > 0 ? 100_000 : 0;
  const targetImages = args.includes("--target-images") ? positiveInteger(value(args, "--target-images"), "--target-images") : 0;
  const featureSourceIds = new Set(features.map((feature) => feature.sourceId));
  const requireLocalMedia = args.includes("--require-local-media");
  const requireLocalImages = args.includes("--require-local-images");
  for (const source of sources) {
    const required = featureSourceIds.has(source.id)
      || (requireLocalMedia && source.mediaType !== "image")
      || (requireLocalImages && source.mediaType === "image");
    if (!required) continue;
    if (source.localPath === undefined || source.sha256 === undefined) { problems.missingLocalFiles.push(source.id); continue; }
    try {
      if (await sha256(resolve(source.localPath)) !== source.sha256) problems.hashMismatches.push(source.id);
    } catch {
      problems.missingLocalFiles.push(source.id);
    }
  }
  const unique = [...uniqueWindows.values()];
  const byDomain = countBy(unique.map((row) => row.domain));
  const byDatasetRole = countBy(unique.map((row) => row.datasetRole));
  const realCalibration = unique.filter((row) => row.datasetRole === "real-calibration");
  const plan = targetAudio > 0 ? buildCorpusPlan(targetAudio, Math.max(1, targetImages)) : undefined;
  const domainDeficits = plan === undefined ? {} : Object.fromEntries(MEDIA_DOMAINS.map((domain) => [domain, Math.max(0, plan.audioByDomain[domain] - (byDomain[domain] ?? 0))]));
  const eventDeficits = plan === undefined ? {} : Object.fromEntries(MEDIA_DOMAINS.map((domain) => {
    const rows = unique.filter((row) => row.domain === domain);
    const actual = countBy(rows.map((row) => row.eventType));
    return [domain, Object.fromEntries(EVENT_TYPES.flatMap((event) => {
      const target = plan.audioByEvent[domain][event] ?? 0;
      const deficit = Math.max(0, target - (actual[event] ?? 0));
      return deficit === 0 ? [] : [[event, deficit]];
    }))];
  }));
  const crossSplitHashes = [...splitsByHash.entries()].filter(([, splits]) => splits.size > 1).map(([hash]) => hash);
  const audioSourceHashes = sources.filter((source) => source.mediaType !== "image").map((source) => source.sha256).filter((hash): hash is string => hash !== undefined);
  const duplicateSourceHashes = [...new Set(audioSourceHashes.filter((hash, index) => audioSourceHashes.indexOf(hash) !== index))];
  const unknownRights = sources.filter((source) => source.rights === "unknown").map((source) => source.id);
  const generatedReferenceRevisions = countBy(sources.flatMap((source) => {
    const revision = generatedReferenceRevision(source);
    return revision === undefined ? [] : [revision];
  }));
  const targetMet = unique.length >= targetAudio
    && imageSources.length >= targetImages
    && images.length >= targetImages
    && Object.values(domainDeficits).every((count) => count === 0)
    && Object.values(eventDeficits).every((events) => Object.keys(events).length === 0);
  const problemCount = Object.values(problems).reduce((sum, items) => sum + items.length, 0);
  const report = {
    sources: sources.length,
    uniqueAudioSourceHashes: new Set(audioSourceHashes).size,
    duplicateAudioSourceHashCount: duplicateSourceHashes.length,
    audioObservationRows: features.length,
    uniqueAudioObservations: unique.length,
    duplicateWindowRows: features.length - unique.length,
    targetAudioObservations: targetAudio,
    audioProgress: targetAudio === 0 ? 1 : unique.length / targetAudio,
    imageSources: imageSources.length,
    imageObservations: images.length,
    targetImages,
    verifiedImageSources: imageSources.filter((source) => source.rightsVerification === "verified").length,
    localImageSources: imageSources.filter((source) => source.localPath !== undefined && source.sha256 !== undefined).length,
    sourceByDomain: countBy(sources.map((source) => source.domain)),
    audioByDomain: byDomain,
    audioByDatasetRole: byDatasetRole,
    realCalibrationObservations: realCalibration.length,
    realCalibrationByDomain: countBy(realCalibration.map((row) => row.domain)),
    generatedReferenceRevisions,
    domainDeficits,
    eventDeficits,
    rights: countBy(sources.map((source) => source.rights)),
    unknownRightsCount: unknownRights.length,
    unknownRights: unknownRights.slice(0, 20),
    crossSplitHashCount: crossSplitHashes.length,
    crossSplitHashes: crossSplitHashes.slice(0, 20),
    problems: Object.fromEntries(Object.entries(problems).map(([key, items]) => [key, { count: items.length, examples: items.slice(0, 20) }])),
    complete: targetMet && unknownRights.length === 0 && crossSplitHashes.length === 0 && problemCount === 0,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.complete) process.exitCode = 2;
}

async function harvest(args: readonly string[]): Promise<void> {
  const media = value(args, "--media");
  if (media !== "audio" && media !== "image") throw new Error("--media must be audio or image");
  const target = positiveInteger(value(args, "--target", media === "image" ? "100" : "300"), "--target");
  const records = await harvestOpenverse({
    media: media as OpenverseMedia,
    target,
    delayMs: nonnegativeInteger(value(args, "--delay-ms", "3100"), "--delay-ms"),
  });
  const out = value(args, "--out");
  await writeAtomic(out, records.map((row) => JSON.stringify(row)).join("\n") + (records.length > 0 ? "\n" : ""), args.includes("--force"));
  process.stdout.write(`${JSON.stringify({ records: records.length, target, complete: records.length >= target, media, byDomain: countBy(records.map((row) => row.domain)), rightsVerification: countBy(records.map((row) => row.rightsVerification)), out }, null, 2)}\n`);
  if (records.length < target) process.exitCode = 2;
}

async function harvestCommons(args: readonly string[]): Promise<void> {
  const target = positiveInteger(value(args, "--target", "100"), "--target");
  const directory = resolve(value(args, "--download-dir"));
  await mkdir(directory, { recursive: true });
  const candidates = await harvestWikimedia({
    target,
    delayMs: nonnegativeInteger(value(args, "--delay-ms", "1100"), "--delay-ms"),
  });
  const out = value(args, "--out");
  const candidatesOut = args.includes("--candidates-out") ? value(args, "--candidates-out") : out.endsWith(".ndjson") ? out.replace(/\.ndjson$/, ".candidates.ndjson") : `${out}.candidates.ndjson`;
  await writeAtomic(candidatesOut, candidates.map((row) => JSON.stringify(row)).join("\n") + "\n", true);
  if (args.includes("--candidates-only")) {
    process.stdout.write(`${JSON.stringify({ candidates: candidates.length, target, complete: candidates.length === target, byDomain: countBy(candidates.map((row) => row.domain)), candidatesOut }, null, 2)}\n`);
    return;
  }
  const records: SourceRecord[] = [];
  const downloadDelayMs = nonnegativeInteger(value(args, "--download-delay-ms", "1000"), "--download-delay-ms");
  const cacheDirectory = args.includes("--cache-dir") ? resolve(value(args, "--cache-dir")) : undefined;
  for (const candidate of candidates) {
    const [record, downloaded] = await downloadImage(candidate, directory, cacheDirectory, args.includes("--force"));
    records.push(record);
    if (records.length % 10 === 0 || records.length === target) process.stderr.write(`processed ${records.length}/${target}\n`);
    if (downloaded && downloadDelayMs > 0) await new Promise((resolvePromise) => setTimeout(resolvePromise, downloadDelayMs));
  }
  await writeAtomic(out, records.map((row) => JSON.stringify(row)).join("\n") + (records.length > 0 ? "\n" : ""), args.includes("--force"));
  process.stdout.write(`${JSON.stringify({ records: records.length, target, complete: records.length === target, downloaded: records.filter((row) => row.localPath !== undefined && row.sha256 !== undefined).length, byDomain: countBy(records.map((row) => row.domain)), rights: countBy(records.map((row) => row.rights)), candidatesOut, out, directory }, null, 2)}\n`);
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === "plan") await plan(args);
  else if (command === "extract") await extract(args);
  else if (command === "pitch-report") await pitchReport(args);
  else if (command === "music-report") await musicReport(args);
  else if (command === "validate") await validate(args);
  else if (command === "harvest-openverse") await harvest(args);
  else if (command === "harvest-wikimedia") await harvestCommons(args);
  else throw new Error("Usage: audio-corpus <plan|extract|pitch-report|music-report|validate|harvest-openverse|harvest-wikimedia> [options]");
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
