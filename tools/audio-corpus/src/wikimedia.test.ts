import { describe, expect, it } from "vitest";
import { harvestWikimedia, wikimediaPageToSource } from "./wikimedia.js";

const page = (pageid: number, title: string, licenseUrl = "https://creativecommons.org/licenses/by/4.0/") => ({
  pageid,
  title: `File:${title}`,
  imageinfo: [{
    timestamp: "2026-08-01T00:00:00Z",
    sha1: pageid.toString(16).padStart(40, "0"),
    mime: "image/jpeg",
    width: 1920,
    height: 1080,
    thumburl: `https://upload.wikimedia.org/${pageid}.jpg`,
    thumbwidth: 960,
    thumbheight: 540,
    descriptionurl: `https://commons.wikimedia.org/wiki/File:${pageid}`,
    extmetadata: {
      LicenseShortName: { value: licenseUrl.includes("zero") ? "CC0 1.0" : "CC BY 4.0" },
      LicenseUrl: { value: licenseUrl },
      Artist: { value: "<b>Example Artist</b>" },
      Restrictions: { value: "" },
    },
  }],
});

describe("Wikimedia Commons boundary", () => {
  it("keeps machine photos research-only and allows verified abstract effects", () => {
    expect(wikimediaPageToSource(page(1, "Pachinko machine.jpg"), "pachinko", "pachinko", "2026-08-11T00:00:00Z")).toMatchObject({
      rights: "research-only", claimedRights: "cc-by", rightsVerification: "verified", provenance: "observation-only",
    });
    expect(wikimediaPageToSource(page(2, "Neon lights.jpg", "https://creativecommons.org/publicdomain/zero/1.0/"), "online_slot", "neon lights", "2026-08-11T00:00:00Z")).toMatchObject({
      rights: "cc0", rightsVerification: "verified", provenance: "licensed-third-party",
    });
  });

  it("allows share-alike only for research references and rejects unrelated or unsafe files", () => {
    expect(wikimediaPageToSource(page(3, "Medieval tumbrel.jpg"), "pachinko", "pachinko", "2026-08-11T00:00:00Z")).toBeNull();
    expect(wikimediaPageToSource(page(9, "Demi Lovato Neon Lights Tour.jpg"), "online_slot", "abstract neon lights", "2026-08-11T00:00:00Z")).toBeNull();
    expect(wikimediaPageToSource(page(4, "Pachinko.jpg", "https://creativecommons.org/licenses/by-sa/4.0/"), "pachinko", "pachinko", "2026-08-11T00:00:00Z")).toMatchObject({ rights: "research-only", claimedRights: "cc-by-sa" });
    expect(wikimediaPageToSource(page(8, "Neon lights.jpg", "https://creativecommons.org/licenses/by-sa/4.0/"), "online_slot", "neon lights", "2026-08-11T00:00:00Z")).toBeNull();
    const restricted = page(5, "Pachinko.jpg");
    const restrictedInfo = restricted.imageinfo[0];
    if (restrictedInfo === undefined) throw new Error("missing fixture imageinfo");
    restrictedInfo.extmetadata.Restrictions.value = "Trademarked";
    expect(wikimediaPageToSource(restricted, "pachinko", "pachinko", "2026-08-11T00:00:00Z")).toBeNull();
    const small = page(6, "Pachinko.jpg");
    const smallInfo = small.imageinfo[0];
    if (smallInfo === undefined) throw new Error("missing fixture imageinfo");
    smallInfo.width = 320;
    expect(wikimediaPageToSource(small, "pachinko", "pachinko", "2026-08-11T00:00:00Z")).toBeNull();
    const tiff = page(7, "Pachinko.jpg");
    const tiffInfo = tiff.imageinfo[0];
    if (tiffInfo === undefined) throw new Error("missing fixture imageinfo");
    tiffInfo.mime = "image/tiff";
    expect(wikimediaPageToSource(tiff, "pachinko", "pachinko", "2026-08-11T00:00:00Z")).toBeNull();
  });

  it("allocates ten verified references 4/4/2", async () => {
    let nextId = 10;
    const records = await harvestWikimedia({
      target: 10,
      delayMs: 0,
      capturedAt: "2026-08-11T00:00:00Z",
      request: async (url) => {
        const query = url.searchParams.get("gsrsearch") ?? "";
        const title = query.startsWith("pachinko") ? "Pachinko machine" : query.startsWith("slot machine") ? "Slot machine" : "Neon lights";
        return { query: { pages: Array.from({ length: 50 }, () => page(nextId++, `${title}.jpg`)) } };
      },
    });
    expect(records.filter((item) => item.domain === "pachinko")).toHaveLength(4);
    expect(records.filter((item) => item.domain === "pachislot")).toHaveLength(4);
    expect(records.filter((item) => item.domain === "online_slot")).toHaveLength(2);
  });
});
