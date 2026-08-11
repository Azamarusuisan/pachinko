import { z } from "zod";

export const runtimeAssetSchema = z.strictObject({
  path: z.string().regex(/^\/assets\/[A-Za-z0-9._/-]+$/).refine((path) => !path.split("/").includes(".."), "Asset path cannot traverse directories"),
  purpose: z.string().min(1),
  source: z.string().min(1),
  provenanceStatus: z.enum(["verified", "unverified"]),
  licenseStatus: z.enum(["verified", "unverified"]),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type RuntimeAsset = z.infer<typeof runtimeAssetSchema>;

export const runtimeAssetManifestSchema = z.strictObject({
  version: z.literal(1),
  assets: z.array(runtimeAssetSchema).min(1),
}).superRefine(({ assets }, context) => {
  const paths = new Set<string>();
  for (const asset of assets) {
    if (paths.has(asset.path)) context.addIssue({ code: "custom", message: `Duplicate runtime asset: ${asset.path}` });
    paths.add(asset.path);
  }
});
export type RuntimeAssetManifest = z.infer<typeof runtimeAssetManifestSchema>;

export const effectManifestSchema = z.strictObject({
  id: z.string().min(1),
  type: z.enum(["VIDEO", "IMAGE", "AUDIO", "THREE", "COMPOSITE"]),
  path: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
  priority: z.number().int(),
  preload: z.boolean(),
  tags: z.array(z.string().min(1)),
});
export type EffectManifest = z.infer<typeof effectManifestSchema>;

export interface AssetCache<T> { get(id: string): T | undefined; set(id: string, asset: T): void; evict(id: string): void }
export interface AssetLoader<T> { load(manifest: EffectManifest, signal?: AbortSignal): Promise<T> }
export interface PreloadQueue { enqueue(manifest: EffectManifest): void; cancel(id: string): void }

export class EffectRegistry {
  private readonly manifests = new Map<string, EffectManifest>();
  register(input: unknown): EffectManifest {
    const manifest = effectManifestSchema.parse(input);
    if (this.manifests.has(manifest.id)) throw new Error(`Duplicate effect: ${manifest.id}`);
    this.manifests.set(manifest.id, manifest);
    return manifest;
  }
  get(id: string): EffectManifest | undefined { return this.manifests.get(id); }
  findByTag(tag: string): readonly EffectManifest[] { return [...this.manifests.values()].filter((manifest) => manifest.tags.includes(tag)); }
}

export const audioManifestSchema = z.strictObject({
  id: z.string().min(1),
  path: z.string().min(1),
  preload: z.boolean(),
  priority: z.number().int().default(0),
  cooldownMs: z.number().int().nonnegative().default(0),
  maxConcurrency: z.number().int().positive(),
  group: z.string().min(1),
  tags: z.array(z.string().min(1)),
});
export type AudioManifest = z.infer<typeof audioManifestSchema>;
export class AudioRegistry {
  private readonly manifests = new Map<string, AudioManifest>();
  register(input: unknown): AudioManifest {
    const manifest = audioManifestSchema.parse(input);
    if (this.manifests.has(manifest.id)) throw new Error(`Duplicate audio asset: ${manifest.id}`);
    this.manifests.set(manifest.id, manifest);
    return manifest;
  }
  get(id: string): AudioManifest | undefined { return this.manifests.get(id); }
  values(): readonly AudioManifest[] { return [...this.manifests.values()]; }
}
export interface AudioSystem { handleCue(cueId: string): Promise<void>; stopGroup(group: string): void }

export interface Mechanism {
  initialize(): Promise<void> | void;
  activate(): void;
  deactivate(): void;
  update(fixedDt: number): void;
  reset(): void;
}
