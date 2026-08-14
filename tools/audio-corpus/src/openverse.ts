import { z } from "zod";
import { buildCorpusPlan, sourceRecordSchema, type MediaDomain, type SourceRecord } from "./index.js";

export type OpenverseMedia = "audio" | "image";

const QUERIES: Readonly<Record<OpenverseMedia, Readonly<Record<MediaDomain, readonly string[]>>>> = {
  audio: {
    pachinko: ["pachinko", "metal ball arcade", "pinball machine", "arcade mechanism", "mechanical launcher"],
    pachislot: ["slot machine", "reel spin", "casino jackpot", "coin payout", "arcade button"],
    online_slot: ["digital slot", "video game jackpot", "game reward", "UI confirmation", "casino ambience"],
  },
  image: {
    pachinko: ["pachinko machine", "pachinko parlor", "Japanese arcade machine", "pinball lights"],
    pachislot: ["slot machine", "slot reels", "casino jackpot lights", "Japanese slot machine"],
    online_slot: ["digital slot machine", "online casino slot", "casino game interface", "jackpot screen", "neon lights", "gold particles", "prism light", "confetti", "fireworks"],
  },
};

const resultSchema = z.object({
  id: z.string().min(1),
  title: z.string().nullable().optional(),
  indexed_on: z.string().nullable().optional(),
  creator: z.string().nullable().optional(),
  creator_url: z.string().nullable().optional(),
  foreign_landing_url: z.string().min(1),
  url: z.string().min(1),
  license: z.string().min(1),
  license_version: z.string().nullable().optional(),
  license_url: z.string().nullable().optional(),
  provider: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  attribution: z.string().nullable().optional(),
  mature: z.boolean().nullable().optional(),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  tags: z.array(z.object({ name: z.string().min(1) })).optional(),
});

const responseSchema = z.object({
  page_count: z.number().int().nonnegative(),
  results: z.array(resultSchema),
});

const CLAIMED_RIGHTS_BY_LICENSE = {
  cc0: "cc0",
  by: "cc-by",
} as const;

function safeUrl(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch { return undefined; }
}

function safeIso(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined || !Number.isFinite(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}

export function openverseResultToSource(input: unknown, media: OpenverseMedia, domain: MediaDomain, query: string, capturedAt: string): SourceRecord | null {
  const result = resultSchema.parse(input);
  const claimedRights = CLAIMED_RIGHTS_BY_LICENSE[result.license.toLowerCase() as keyof typeof CLAIMED_RIGHTS_BY_LICENSE];
  const sourceUrl = safeUrl(result.foreign_landing_url);
  const assetUrl = safeUrl(result.url);
  if (claimedRights === undefined || result.mature === true || sourceUrl === undefined || assetUrl === undefined) return null;
  const creator = result.creator?.trim() || undefined;
  const title = result.title?.trim() || undefined;
  const licenseVersion = result.license_version?.trim();
  const licenseName = result.license.toLowerCase() === "pdm" ? "Public Domain Mark" : `${result.license.toUpperCase()}${licenseVersion ? ` ${licenseVersion}` : ""}`;
  const attribution = claimedRights === "cc-by"
    ? result.attribution?.trim() || `${title ?? "Untitled"} — ${creator ?? "creator not supplied by source"} — ${sourceUrl}`
    : undefined;
  return sourceRecordSchema.parse({
    id: `openverse-${media}-${result.id.replace(/[^a-zA-Z0-9._-]/g, "-")}`,
    domain,
    mediaType: media,
    eventType: "unknown",
    rights: "unknown",
    claimedRights,
    rightsVerification: "observed",
    provenance: "observation-only",
    sourceUrl,
    assetUrl,
    title,
    creator,
    creatorUrl: safeUrl(result.creator_url),
    provider: result.provider?.trim() || result.source?.trim() || "Openverse",
    indexedAt: safeIso(result.indexed_on),
    mature: result.mature ?? false,
    width: result.width ?? undefined,
    height: result.height ?? undefined,
    harvestQuery: query,
    rawMetadata: result,
    licenseName,
    licenseUrl: safeUrl(result.license_url),
    attribution,
    capturedAt,
    rewardLevel: 0,
    tags: ["openverse", query, ...(result.tags ?? []).map((tag) => tag.name).slice(0, 20)],
  });
}

export interface HarvestOptions {
  readonly media: OpenverseMedia;
  readonly target: number;
  readonly delayMs?: number;
  readonly capturedAt?: string;
  readonly request?: (url: URL) => Promise<unknown>;
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function defaultRequest(url: URL): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "pachinko-audio-corpus/0.1 local-research" }, redirect: "error", signal: controller.signal });
      if (response.ok) return await response.json();
      if (response.status !== 429 && response.status < 500) throw new Error(`Openverse ${response.status}: ${response.statusText}`);
      const retryAfter = Number(response.headers.get("retry-after"));
      await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 4_000 * (attempt + 1));
    } finally { clearTimeout(timeout); }
  }
  throw new Error("Openverse request failed after 3 attempts");
}

export async function harvestOpenverse(options: HarvestOptions): Promise<SourceRecord[]> {
  if (!Number.isInteger(options.target) || options.target <= 0) throw new RangeError("target must be a positive integer");
  const capturedAt = options.capturedAt ?? new Date().toISOString();
  const request = options.request ?? defaultRequest;
  const delayMs = options.delayMs ?? 3_100;
  const plan = buildCorpusPlan(Math.max(1, options.target), Math.max(1, options.target));
  const domainTargets = options.media === "image" ? plan.imagesByDomain : plan.audioByDomain;
  const records: SourceRecord[] = [];
  const seenIds = new Set<string>();
  const seenLandingUrls = new Set<string>();

  for (const domain of ["pachinko", "pachislot", "online_slot"] as const) {
    const target = domainTargets[domain];
    const queries = QUERIES[options.media][domain];
    let domainCount = 0;
    for (let page = 1; domainCount < target; page += 1) {
      let anyResults = false;
      for (const query of queries) {
        const endpoint = options.media === "image" ? "images" : "audio";
        const url = new URL(`https://api.openverse.org/v1/${endpoint}/`);
        url.searchParams.set("q", query);
        url.searchParams.set("license", "cc0,by");
        url.searchParams.set("page_size", "20");
        url.searchParams.set("page", String(page));
        const response = responseSchema.parse(await request(url));
        anyResults ||= response.results.length > 0;
        for (const result of response.results) {
          const record = openverseResultToSource(result, options.media, domain, query, capturedAt);
          if (record === null || seenIds.has(record.id) || record.sourceUrl === undefined || seenLandingUrls.has(record.sourceUrl)) continue;
          const withPage = sourceRecordSchema.parse({ ...record, harvestPage: page });
          seenIds.add(record.id);
          seenLandingUrls.add(record.sourceUrl);
          records.push(withPage);
          domainCount += 1;
          if (domainCount >= target) break;
        }
        if (domainCount >= target) break;
        if (delayMs > 0) await wait(delayMs);
      }
      if (!anyResults || page >= 50) break;
    }
  }
  return records.slice(0, options.target);
}
