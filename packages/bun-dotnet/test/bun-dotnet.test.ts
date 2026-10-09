import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, dotnet, generateTypes, loadAssembly, packageOutput } from "../src/index.ts";

const fixture = join(import.meta.dir, "fixture");
const assembly = join(fixture, "bin", "Interop.dll");
const packed = existsSync(join(packageOutput, "node-api-dotnet", "net10.0.js"));

test("drives the .NET SDK", async () => {
  const result = await dotnet(["--version"]);
  expect(result.stdout.trim()).toMatch(/^10\./);
  expect(result.exitCode).toBe(0);
});

describe.skipIf(!packed)("CLR hosted in Bun (run `bun run build` first)", () => {
  let Interop: any;

  beforeAll(async () => {
    const result = await build(["-v", "q"], { cwd: fixture });
    expect(result.exitCode).toBe(0);
    Interop = loadAssembly(assembly).Interop;
  }, 120_000);

  test("static methods", () => {
    expect(Interop.Calc.Add(20, 22)).toBe(42);
  });

  test("instances, properties and methods", () => {
    const counter = new Interop.Counter(5);
    counter.Increment();
    expect(counter.Value).toBe(6);
    expect(counter).toBeInstanceOf(Interop.Counter);
  });

  test("Task<T> becomes a Promise", async () => {
    const pending = Interop.Calc.EchoAsync("bun");
    expect(pending).toBeInstanceOf(Promise);
    expect(await pending).toBe("bun!");
  });

  test("JS functions passed as .NET delegates", () => {
    expect(Interop.Calc.Apply((x: number) => x * 3, 14)).toBe(42);
  });

  test(".NET event delivered to a JS callback", () => {
    const counter = new Interop.Counter(0);
    const seen: number[] = [];
    counter.OnChanged((value: number) => seen.push(value));
    counter.Increment();
    counter.Increment();
    expect(seen).toEqual([1, 2]);
  });

  test("generates TypeScript declarations", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bun-dotnet-"));
    try {
      const output = join(dir, "Interop.d.ts");
      const result = await generateTypes({ assembly, output });
      expect(result.stderr).not.toContain("error");
      expect(result.exitCode).toBe(0);
      const dts = readFileSync(output, "utf8").replaceAll("\r\n", "\n");
      expect(dts).toContain("declare module 'node-api-dotnet'");
      expect(dts).toContain("export function EchoAsync(text: string): Promise<string>;");
      expect(dts).toContain("export class Counter {\n\t\t\tconstructor(start: number);");
      expect(dts).toContain("OnChanged(listener: System.Action$1<number>): void;");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
