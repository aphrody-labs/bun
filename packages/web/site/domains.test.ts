import { describe, expect, test } from "bun:test";
import { APHRODY_DOMAINS, canonicalUrl, domainForHost } from "../src/domains.ts";

describe("public domain manifest", () => {
  test("has one canonical owner per public host", () => {
    expect(new Set(APHRODY_DOMAINS.map(domain => domain.host)).size).toBe(APHRODY_DOMAINS.length);
    expect(domainForHost("WWW.APHRODY.APP:443")?.canonical).toBe("https://aphrody.app");
  });

  test("does not make AI or infrastructure hosts indexable", () => {
    expect(domainForHost("ai.aphrody.com")?.indexable).toBe(false);
    expect(domainForHost("cdn.aphrody.com")?.indexable).toBe(false);
    expect(domainForHost("aphrody.com")?.indexable).toBe(true);
  });

  test("builds canonical URLs from the owning host", () => {
    expect(canonicalUrl("www.aphrody.com", "/docs/start")).toBe("https://aphrody.com/docs/start");
    expect(canonicalUrl("bun.aphrody.com", "/install")).toBe("https://aphrody.app/install");
  });
});
