import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { iconsPlugin } from "../index.ts";
import { fakeCdn, sampleIco } from "./helpers.ts";

const cdn = fakeCdn();
const dir = mkdtempSync(join(tmpdir(), "bun-icons-plugin-"));
writeFileSync(join(dir, "app.ico"), sampleIco().bytes);
afterAll(() => {
  cdn.server.stop(true);
  rmSync(dir, { recursive: true, force: true });
});
const options = () => ({ origin: cdn.origin, cacheDir: join(dir, "cache") });

test("Bun.plugin: symbol: and .ico imports at runtime", async () => {
  Bun.plugin(iconsPlugin(options()));
  try {
    const symbol = await import("symbol:home?style=rounded&fill=1&size=32");
    expect(symbol.default).toStartWith(`<svg width="32" height="32"`);
    expect(symbol.default).toContain("/materialsymbolsrounded/home/fill1/24px.svg");
    expect(symbol.url).toBe(`${cdn.origin}s/i/short-term/release/materialsymbolsrounded/home/fill1/24px.svg`);

    const ico = await import(join(dir, "app.ico"));
    expect(ico.entries.map((e: { width: number }) => e.width)).toEqual([16, 24, 32, 48, 64, 256]);
    expect(ico.default).toStartWith("data:image/png;base64,");
    expect(ico.best(256)).toBe(ico.default);
    expect(ico.best(20)).not.toBe(ico.best(16));
    expect(ico.best(17)).toBe(ico.best(24));
    expect(ico.best(1000)).toBe(ico.default);

    await expect(import("symbol:no_such_icon")).rejects.toThrow('unknown symbol "no_such_icon"');
  } finally {
    Bun.plugin.clearAll();
  }
});

test("Bun.build: symbols and icons are inlined in the bundle", async () => {
  writeFileSync(
    join(dir, "entry.ts"),
    `import home from "symbol:home?style=sharp";
import logo, { best, entries } from "./app.ico";
console.log(JSON.stringify({ home, logo: logo.slice(0, 22), best: best(32) === logo, n: entries.length }));`,
  );
  const result = await Bun.build({ entrypoints: [join(dir, "entry.ts")], plugins: [iconsPlugin(options())] });
  expect(result.logs).toEqual([]);
  expect(result.success).toBe(true);
  const code = await result.outputs[0].text();
  expect(code).toContain("materialsymbolssharp/home/default/24px.svg");
  expect(code).toContain("data:image/png;base64,");

  const out = join(dir, "out.js");
  writeFileSync(out, code);
  const proc = Bun.spawnSync({ cmd: [process.execPath, out], stderr: "pipe" });
  const printed = JSON.parse(proc.stdout.toString());
  expect(printed).toMatchObject({ logo: "data:image/png;base64,", best: false, n: 6 });
  expect(printed.home).toStartWith("<svg ");
  expect(proc.exitCode).toBe(0);
});
