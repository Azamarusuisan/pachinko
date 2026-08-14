import { describe, expect, it } from "vitest";
import { harvestOpenverse, openverseResultToSource } from "./openverse.js";

const result = (id: string, license = "by") => ({
  id,
  title: "Arcade light",
  indexed_on: "2026-08-01T00:00:00Z",
  creator: "Example Artist",
  creator_url: "https://example.com/artist",
  foreign_landing_url: `https://example.com/work/${id}`,
  url: `https://cdn.example.com/${id}.jpg`,
  license,
  license_version: "4.0",
  license_url: "https://creativecommons.org/licenses/by/4.0/",
  provider: "example",
  source: "example-source",
  attribution: "Arcade light by Example Artist, CC BY 4.0",
  mature: false,
  width: 1920,
  height: 1080,
  tags: [{ name: "neon" }],
});

describe("Openverse metadata boundary", () => {
  it("stores API claims as observation-only until the landing page is verified", () => {
    const source = openverseResultToSource(result("one"), "image", "pachinko", "pachinko", "2026-08-11T00:00:00Z");
    expect(source).toMatchObject({ rights: "unknown", claimedRights: "cc-by", rightsVerification: "observed", provenance: "observation-only", mature: false });
    expect(source?.attribution).toContain("Example Artist");
  });

  it("rejects mature results and licenses outside the initial CC0/CC-BY allowlist", () => {
    expect(openverseResultToSource({ ...result("mature"), mature: true }, "image", "pachinko", "pachinko", "2026-08-11T00:00:00Z")).toBeNull();
    expect(openverseResultToSource(result("share-alike", "by-sa"), "image", "pachinko", "pachinko", "2026-08-11T00:00:00Z")).toBeNull();
  });

  it("balances a ten-record fixture 4/4/2 without downloading assets", async () => {
    const records = await harvestOpenverse({
      media: "image",
      target: 10,
      delayMs: 0,
      capturedAt: "2026-08-11T00:00:00Z",
      request: async (url) => ({
        page_count: 10,
        results: Array.from({ length: 20 }, (_, index) => result(`${url.searchParams.get("q")}-${url.searchParams.get("page")}-${index}`)),
      }),
    });
    expect(records).toHaveLength(10);
    expect(records.filter((item) => item.domain === "pachinko")).toHaveLength(4);
    expect(records.filter((item) => item.domain === "pachislot")).toHaveLength(4);
    expect(records.filter((item) => item.domain === "online_slot")).toHaveLength(2);
    expect(records.every((item) => item.localPath === undefined && item.assetUrl !== undefined)).toBe(true);
  });
});
