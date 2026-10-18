import { describe, expect, test } from "bun:test";
import { normalizeCrunchyrollPath } from "../src/crunchyroll-har-map";

describe("crunchyroll HAR map", () => {
  test("normalises ids in API paths", () => {
    expect(normalizeCrunchyrollPath("/content/v2/cms/series/GXJ3DXE2Y/seasons")).toBe(
      "/content/v2/cms/series/:id/seasons",
    );
    expect(normalizeCrunchyrollPath("/content/v2/cms/objects/1234567")).toBe("/content/v2/cms/objects/:id");
    expect(normalizeCrunchyrollPath("/auth/v1/token")).toBe("/auth/v1/token");
  });
});

describe("crunchyroll HAR map on the captured session", () => {
  test("maps hosts, CDN and the encrypted DASH manifest", async () => {
    const { mapCrunchyrollHar } = await import("../src/crunchyroll-har-map");
    const map = await mapCrunchyrollHar("C:/bun/packages/bun-video/.local/www.crunchyroll.com.har");
    expect(map.apiHosts[0]?.host).toBe("www.crunchyroll.com");
    expect(map.cdn).toContain("vod-gcp.crunchyrollcdn.com");
    expect(map.manifests.some(m => m.kind === "dash" && m.encrypted && m.representations >= 4)).toBe(true);
  });
});
