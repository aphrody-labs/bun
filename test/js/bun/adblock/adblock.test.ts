import { Engine } from "bun:adblock";
import { describe, expect, test } from "bun:test";

const list = `
! local fixture list
||ads.example.com^
/banner/*$image
@@||ads.example.com/allowed^
||tracker.example.net^$important
@@||tracker.example.net^
##.ad-banner
example.org##.sponsored
example.org#@#.ad-banner
`;

describe("bun:adblock Engine", () => {
  const engine = new Engine({ rules: list, debug: true });

  test("blocks a matching network request", () => {
    const result = engine.check("https://ads.example.com/x.js", "https://news.test/", "script");
    expect(result).toMatchObject({ matched: true, blocked: true, important: false, filter: "||ads.example.com^" });
    expect(result.exception).toBeUndefined();
  });

  test("exception rules unblock", () => {
    const result = engine.check("https://ads.example.com/allowed", "https://news.test/", "script");
    expect(result).toMatchObject({ matched: true, blocked: false, exception: "@@||ads.example.com/allowed^" });
  });

  test("important rules win over exceptions", () => {
    const result = engine.check("https://tracker.example.net/p", "https://news.test/", "xmlhttprequest");
    expect(result).toMatchObject({ blocked: true, important: true });
  });

  test("request type options apply", () => {
    expect(engine.check("https://cdn.test/banner/a.png", "https://news.test/", "image").blocked).toBe(true);
    expect(engine.check("https://cdn.test/banner/a.js", "https://news.test/", "script").blocked).toBe(false);
  });

  test("unmatched request and defaults", () => {
    expect(engine.check("https://ok.test/")).toEqual({ matched: false, blocked: false, important: false });
  });

  test("cosmetic resources and generic class selectors", () => {
    const page = engine.urlCosmeticResources("https://example.org/page");
    expect(page.hideSelectors).toEqual([".sponsored"]);
    expect(page.exceptions).toEqual([".ad-banner"]);
    expect(page.generichide).toBe(false);
    expect(engine.hiddenClassIdSelectors(["ad-banner"], [], page.exceptions)).toEqual([]);
    const other = engine.urlCosmeticResources("https://other.test/");
    expect(engine.hiddenClassIdSelectors(["ad-banner", "x"], [], other.exceptions)).toEqual([".ad-banner"]);
  });

  test("hosts format and rule arrays", () => {
    const hosts = new Engine({ rules: "0.0.0.0 bad.test\n127.0.0.1 worse.test", format: "hosts" });
    expect(hosts.check("https://bad.test/a", "https://site.test/").blocked).toBe(true);
    expect(hosts.check("https://good.test/a", "https://site.test/").blocked).toBe(false);
    const array = new Engine({ rules: ["||one.test^", "||two.test^"] });
    expect(array.check("https://two.test/", "https://site.test/").blocked).toBe(true);
  });

  test("serialize and deserialize round-trip", () => {
    const bytes = engine.serialize();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(0);
    const copy = Engine.deserialize(bytes);
    expect(copy.check("https://ads.example.com/x.js", "https://news.test/", "script").blocked).toBe(true);
    expect(copy.check("https://ok.test/", "https://news.test/").blocked).toBe(false);
    expect(() => Engine.deserialize(new Uint8Array([1, 2, 3]))).toThrow(/Invalid serialized engine/);
  });

  test("validates arguments", () => {
    // @ts-expect-error
    expect(() => new Engine()).toThrow(/rules/);
    // @ts-expect-error
    expect(() => new Engine({ rules: "", format: "abp" })).toThrow(/format/);
    // @ts-expect-error
    expect(() => engine.check(1)).toThrow(/url/);
  });
});

describe("fetch adblock option", () => {
  test("rejects blocked requests before I/O and lets others through", async () => {
    let hits = 0;
    using server = Bun.serve({
      port: 0,
      fetch(req) {
        hits++;
        return new Response(new URL(req.url).pathname);
      },
    });
    const engine = new Engine({ rules: "/blocked/*\n" });
    const error = await fetch(new URL("/blocked/x", server.url), { adblock: engine }).catch(e => e);
    expect(error.code).toBe("ERR_ADBLOCK_BLOCKED");
    expect(error).toBeInstanceOf(TypeError);
    expect(hits).toBe(0);
    const ok = await fetch(new URL("/fine", server.url), { adblock: engine });
    expect(await ok.text()).toBe("/fine");
    expect(hits).toBe(1);
  });

  test("rejects a non-engine adblock value", async () => {
    // @ts-expect-error
    const error = await fetch("http://127.0.0.1:1/", { adblock: {} }).catch(e => e);
    expect(error.code).toBe("ERR_INVALID_ARG_TYPE");
  });
});
