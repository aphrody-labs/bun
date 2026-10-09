import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchSymbol, parseSymbol, SymbolError, symbolPath, symbolUrl } from "../src/symbols.ts";
import { fakeCdn, SVG } from "./helpers.ts";

const cdn = fakeCdn();
const cache = mkdtempSync(join(tmpdir(), "bun-icons-symbols-"));
afterAll(() => {
  cdn.server.stop(true);
  rmSync(cache, { recursive: true, force: true });
});

describe("parseSymbol", () => {
  test("defaults and every parameter", () => {
    expect(parseSymbol("symbol:home")).toEqual({
      name: "home",
      style: "outlined",
      fill: 0,
      wght: 400,
      grad: 0,
      opsz: 24,
    });
    expect(parseSymbol("symbol:arrow_back?style=rounded&fill=1&wght=300&grad=-25&opsz=48&size=96")).toEqual({
      name: "arrow_back",
      style: "rounded",
      fill: 1,
      wght: 300,
      grad: -25,
      opsz: 48,
      size: 96,
    });
  });

  test.each([
    ["symbol:Home", "name"],
    ["symbol:", "name"],
    ["symbol:home?style=bold", "style=bold"],
    ["symbol:home?fill=0.5", "fill=0.5"],
    ["symbol:home?wght=450", "wght=450"],
    ["symbol:home?grad=100", "grad=100"],
    ["symbol:home?opsz=32", "opsz=32"],
    ["symbol:home?wght=", "wght="],
    ["symbol:home?size=0", "size=0"],
    ["symbol:home?color=red", "unknown parameter"],
  ])("%p is rejected", (spec, message) => {
    expect(() => parseSymbol(spec)).toThrow(SymbolError);
    expect(() => parseSymbol(spec)).toThrow(message);
  });
});

test("symbolPath follows the gstatic layout (wght, then grad, then fill)", () => {
  const path = (spec: string) => symbolPath(parseSymbol(spec));
  expect(path("symbol:home")).toBe("s/i/short-term/release/materialsymbolsoutlined/home/default/24px.svg");
  expect(path("symbol:home?style=sharp&fill=1&wght=700&grad=200&opsz=20")).toBe(
    "s/i/short-term/release/materialsymbolssharp/home/wght700grad200fill1/20px.svg",
  );
  expect(path("symbol:home?grad=-25&fill=1")).toContain("/gradN25fill1/");
  expect(symbolUrl(parseSymbol("symbol:home"), "https://cdn.aphrody.com")).toBe(
    "https://cdn.aphrody.com/s/i/short-term/release/materialsymbolsoutlined/home/default/24px.svg",
  );
});

describe("fetchSymbol", () => {
  test("downloads once, then serves the disk cache; size rewrites width and height", async () => {
    const spec = parseSymbol("symbol:home?style=rounded&fill=1");
    const before = cdn.hits.length;
    const first = await fetchSymbol(spec, { origin: cdn.origin, cacheDir: cache });
    expect(first).toContain(`data-variant="/${symbolPath(spec)}"`);
    const again = await fetchSymbol({ ...spec, size: 96 }, { origin: cdn.origin, cacheDir: cache });
    expect(cdn.hits.length - before).toBe(1);
    expect(again).toStartWith(
      `<svg width="96" height="96" xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960">`,
    );
  });

  test("404 is an unknown symbol, other failures are named", async () => {
    const options = { origin: cdn.origin, cacheDir: false } as const;
    await expect(fetchSymbol(parseSymbol("symbol:no_such_icon"), options)).rejects.toThrow(
      'unknown symbol "no_such_icon"',
    );
    const status = (code: number) => async () => new Response("", { status: code });
    await expect(fetchSymbol(parseSymbol("symbol:home"), { ...options, fetch: status(503) as any })).rejects.toThrow(
      "HTTP 503",
    );
    const script = async () => new Response(SVG.replace("<path", "<script>alert(1)</script><path"));
    await expect(fetchSymbol(parseSymbol("symbol:home"), { ...options, fetch: script as any })).rejects.toThrow(
      "not a plain SVG",
    );
    const down = async () => {
      throw new Error("connection refused");
    };
    await expect(fetchSymbol(parseSymbol("symbol:home"), { ...options, fetch: down as any })).rejects.toThrow(
      "connection refused",
    );
  });
});
