import { z } from "zod";

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
}
export interface AudioSystem { handleCue(cueId: string): Promise<void>; stopGroup(group: string): void }

export interface Mechanism {
  initialize(): Promise<void> | void;
  activate(): void;
  deactivate(): void;
  update(fixedDt: number): void;
  reset(): void;
}
