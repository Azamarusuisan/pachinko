import { z } from "zod";
import { buildCorpusPlan, sourceRecordSchema, type MediaDomain, type SourceRecord } from "./index.js";

const metadataValueSchema = z.object({ value: z.string().optional() }).passthrough();
const pageSchema = z.object({
  pageid: z.number().int().positive(),
  title: z.string().min(1),
  imageinfo: z.array(z.object({
    timestamp: z.string().optional(),
    sha1: z.string().optional(),
    mime: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    thumburl: z.url(),
    thumbwidth: z.number().int().positive(),
    thumbheight: z.number().int().positive(),
    descriptionurl: z.url(),
    extmetadata: z.record(z.string(), metadataValueSchema).default({}),
  })).default([]),
});

const responseSchema = z.object({
  continue: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  query: z.object({ pages: z.array(pageSchema).default([]) }).optional(),
});

const SEARCHES: Readonly<Record<MediaDomain, { readonly queries: readonly string[]; readonly title: RegExp; readonly exclude?: RegExp }>> = {
  pachinko: {
    queries: ["pachinko machine", "pachinko balls", "pachinko"],
    title: /pachinko|パチンコ/i,
  },
  pachislot: {
    queries: ["casino slot machine", "video slot machine", "slot reels", "pachislot", "slot machine", "fruit machine", "one armed bandit"],
    title: /slot(?: |-)machine|slot reels?|pachislot|パチスロ|one(?: |-)armed bandit|fruit(?: |-)machine|video slot|casino slot/i,
    exclude: /pataphysical|grab crane|souvenir coin|loading the slot machine|ISCA vs|slot machine doll|corridor .* slot machine|Rob & Matt|pretending|phonebox|Atari 2600|illustration|bakery slot/i,
  },
  online_slot: {
    queries: ["abstract neon lights", "geometric neon lights", "light beams", "confetti", "fireworks", "prism light", "LED lights"],
    title: /neon|confetti|fireworks?|light beams?|prism|LED|jackpot/i,
    exclude: /tour|concert|festival|singer|Demi Lovato|Dan Flavin|PCB|neon \(Ne\)|palm and tarot|street|building|city|strip|Kabukicho|Hong Kong|Lisboa|Tokyo|September 11|twin towers|mountain|ruins|Red Square|Moscow|Mardi Gras|birthday|balloons|America|bride|groom|Moma|Toronto|interior|winter tree|early confetti|IMG|children|lighthouse|telescope|objective|GTI|bush|bulbs|holiday/i,
  },
};

const LICENSES = [
  { url: /creativecommons\.org\/publicdomain\/zero\//i, rights: "cc0", name: "CC0" },
  { url: /creativecommons\.org\/licenses\/by-sa\//i, rights: "cc-by-sa", name: "CC BY-SA" },
  { url: /creativecommons\.org\/licenses\/by\//i, rights: "cc-by", name: "CC BY" },
  { url: /creativecommons\.org\/publicdomain\/mark\//i, rights: "public-domain", name: "Public domain" },
] as const;

function text(value: string | undefined): string | undefined {
  const plain = value
    ?.replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return plain === "" ? undefined : plain;
}

function httpsUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    const url = new URL(value, "https://commons.wikimedia.org/");
    if (url.protocol !== "https:") return undefined;
    return url.href;
  } catch { return undefined; }
}

export function wikimediaPageToSource(input: unknown, domain: MediaDomain, query: string, capturedAt: string): SourceRecord | null {
  const page = pageSchema.parse(input);
  const search = SEARCHES[domain];
  if (!search.title.test(page.title) || search.exclude?.test(page.title) === true) return null;
  const info = page.imageinfo[0];
  if (info === undefined || !IMAGE_MIME_TYPES.has(info.mime) || info.width < 400 || info.height < 300 || info.thumbwidth < 320 || info.thumbheight < 240) return null;
  const metadata = info.extmetadata;
  if (text(metadata.Restrictions?.value) !== undefined) return null;
  const licenseUrl = httpsUrl(metadata.LicenseUrl?.value);
  const license = licenseUrl === undefined ? undefined : LICENSES.find((item) => item.url.test(licenseUrl));
  const machineReference = domain !== "online_slot";
  if (license === undefined || (!machineReference && license.rights === "cc-by-sa")) return null;
  const creator = text(metadata.Artist?.value);
  if ((license.rights === "cc-by" || license.rights === "cc-by-sa") && creator === undefined) return null;
  const sourceUrl = info.descriptionurl;
  const title = page.title.replace(/^File:/, "");
  const rights = machineReference ? "research-only" : license.rights;
  const attribution = license.rights === "cc-by" || license.rights === "cc-by-sa" ? `${title} — ${creator} — ${text(metadata.LicenseShortName?.value) ?? license.name} — ${sourceUrl}` : undefined;
  return sourceRecordSchema.parse({
    id: `commons-image-${page.pageid}`,
    domain,
    mediaType: "image",
    eventType: "unknown",
    rights,
    claimedRights: license.rights,
    rightsVerification: "verified",
    provenance: machineReference ? "observation-only" : license.rights === "public-domain" ? "public-domain" : "licensed-third-party",
    sourceUrl,
    assetUrl: info.thumburl,
    title,
    creator,
    provider: "Wikimedia Commons",
    indexedAt: info.timestamp === undefined ? undefined : new Date(info.timestamp).toISOString(),
    mature: false,
    width: info.thumbwidth,
    height: info.thumbheight,
    harvestQuery: query,
    rawMetadata: page,
    licenseName: text(metadata.LicenseShortName?.value) ?? license.name,
    licenseUrl,
    attribution,
    capturedAt,
    rewardLevel: 0,
    tags: ["wikimedia-commons", machineReference ? "machine-reference" : "effect-reference", query],
  });
}

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface WikimediaHarvestOptions {
  readonly target: number;
  readonly delayMs?: number;
  readonly capturedAt?: string;
  readonly request?: (url: URL) => Promise<unknown>;
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function defaultRequest(url: URL): Promise<unknown> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "pachinko-research/0.1 (https://github.com/Azamarusuisan/pachinko; local reference corpus)" }, signal: controller.signal });
      if (response.ok) return await response.json();
      if (response.status !== 429 && response.status !== 503) throw new Error(`Wikimedia ${response.status}: ${response.statusText}`);
      const retryAfter = Number(response.headers.get("retry-after"));
      await wait(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : 5_000 * (attempt + 1));
    } finally { clearTimeout(timeout); }
  }
  throw new Error("Wikimedia request failed after 4 attempts");
}

export async function harvestWikimedia(options: WikimediaHarvestOptions): Promise<SourceRecord[]> {
  if (!Number.isInteger(options.target) || options.target <= 0) throw new RangeError("target must be a positive integer");
  const capturedAt = options.capturedAt ?? new Date().toISOString();
  const delayMs = options.delayMs ?? 1_100;
  const request = options.request ?? defaultRequest;
  const targets = buildCorpusPlan(1, options.target).imagesByDomain;
  const records: SourceRecord[] = [];
  const seenPages = new Set<number>();
  const seenHashes = new Set<string>();

  for (const domain of ["pachinko", "pachislot", "online_slot"] as const) {
    let count = 0;
    for (const query of SEARCHES[domain].queries) {
      const perQueryTarget = domain === "online_slot" ? Math.ceil(targets[domain] / 5) : targets[domain];
      let queryCount = 0;
      let continuation: Record<string, string | number> = {};
      for (let pageNumber = 0; pageNumber < 3 && count < targets[domain] && queryCount < perQueryTarget; pageNumber += 1) {
        const url = new URL("https://commons.wikimedia.org/w/api.php");
        const parameters = {
          action: "query", generator: "search", gsrsearch: `${query} filetype:bitmap`, gsrnamespace: "6", gsrlimit: "200",
          prop: "imageinfo", iiprop: "url|mime|size|sha1|timestamp|extmetadata", iiurlwidth: "960",
          iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|Restrictions", format: "json", formatversion: "2", maxlag: "5",
        };
        for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
        for (const [key, value] of Object.entries(continuation)) url.searchParams.set(key, typeof value === "number" ? value.toString() : value);
        const response = responseSchema.parse(await request(url));
        for (const page of response.query?.pages ?? []) {
          const hash = page.imageinfo[0]?.sha1;
          if (seenPages.has(page.pageid) || (hash !== undefined && seenHashes.has(hash))) continue;
          const record = wikimediaPageToSource(page, domain, query, capturedAt);
          if (record === null) continue;
          seenPages.add(page.pageid);
          if (hash !== undefined) seenHashes.add(hash);
          records.push(record);
          count += 1;
          queryCount += 1;
          if (count >= targets[domain] || queryCount >= perQueryTarget) break;
        }
        if (response.continue === undefined) break;
        continuation = response.continue;
        if (count < targets[domain] && delayMs > 0) await wait(delayMs);
      }
      if (count >= targets[domain]) break;
    }
    if (count < targets[domain]) throw new Error(`Only found ${count}/${targets[domain]} verified ${domain} images`);
  }
  return records.slice(0, options.target);
}
