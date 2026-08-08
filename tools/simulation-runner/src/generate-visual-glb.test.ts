import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const nodeSchema = z.object({ extras: z.object({ visualOnly: z.boolean(), policy: z.string() }) });
const meshSchema = z.object({ primitives: z.array(z.unknown()) });
const gltfSchema = z.object({
  asset: z.object({ version: z.string() }),
  nodes: z.tuple([nodeSchema]).rest(nodeSchema),
  meshes: z.tuple([meshSchema]).rest(meshSchema),
});

describe("generated cabinet GLB", () => {
  it("contains a valid glTF 2 container and visual-only provenance", async () => {
    const bytes = await readFile(new URL("../../../assets/models/eva15_reference_cabinet.glb", import.meta.url));
    expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
    expect(bytes.readUInt32LE(4)).toBe(2);
    expect(bytes.readUInt32LE(8)).toBe(bytes.length);
    const jsonLength = bytes.readUInt32LE(12);
    expect(bytes.readUInt32LE(16)).toBe(0x4e4f534a);
    const raw: unknown = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
    const document = gltfSchema.parse(raw);
    expect(document.asset.version).toBe("2.0");
    expect(document.nodes[0].extras.visualOnly).toBe(true);
    expect(document.nodes[0].extras.policy).toContain("reference-based approximation");
    expect(document.meshes[0].primitives.length).toBeGreaterThan(5);
  });
});
