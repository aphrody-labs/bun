import { afterAll, expect, test } from "bun:test";
import { bunEnv, bunExe, isASAN, isDebug, tempDir } from "harness";
import { join } from "node:path";
import { endChildren, spawn } from "../children";

afterAll(endChildren);

async function check(cwd: string, ...args: string[]) {
  const started = performance.now();
  const timing = process.env.BUN_CHECK_DECLARATIONS_TIMING === "1";
  if (timing) console.error(JSON.stringify({ phase: "start", args }));
  const child = spawn({
    cmd: [bunExe(), "check", "--threads", "1", ...args],
    cwd,
    env: bunEnv,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (timing) console.error(JSON.stringify({ phase: "end", args, milliseconds: performance.now() - started, code }));
  return { code, output: stdout + stderr };
}

const config = JSON.stringify({
  compilerOptions: { strict: true, target: "esnext", module: "esnext", types: [], skipLibCheck: true },
});
// Each case starts several checkers; a cold debug/ASAN checker alone can exceed five seconds.
const deadline = isDebug || isASAN ? 30_000 : 5_000;

test(
  "declaration-only emission produces a typed importable API; ordinary checks stay readonly",
  async () => {
    using dir = tempDir("check-declarations", {
      "tsconfig.json": config,
      "entry.ts": "export interface Item { name: string }; export function identity(item: Item): Item { return item }",
    });
    const ordinary = await check(String(dir), "--declaration", "--outDir", "ordinary", "entry.ts");
    expect(ordinary.output).not.toContain("error TS");
    expect(ordinary.code).toBe(0);
    expect(await Bun.file(join(String(dir), "ordinary/entry.d.ts")).exists()).toBe(false);
    const emitted = await check(String(dir), "--declaration", "--emitDeclarationOnly", "--outDir", "dist", "entry.ts");
    expect(emitted.output).not.toContain("error TS");
    expect(emitted.code).toBe(0);
    expect(await Bun.file(join(String(dir), "dist/entry.d.ts")).text()).toContain("identity");
    expect(await Bun.file(join(String(dir), "dist/entry.js")).exists()).toBe(false);
    await Bun.write(
      join(String(dir), "consumer.ts"),
      'import { identity } from "./dist/entry"; identity({ name: "valid" });',
    );
    const good = await check(String(dir), "consumer.ts");
    expect(good.output).not.toContain("error TS");
    expect(good.code).toBe(0);
    await Bun.write(
      join(String(dir), "consumer.ts"),
      'import { identity } from "./dist/entry"; identity({ name: 42 });',
    );
    const bad = await check(String(dir), "consumer.ts");
    expect(bad.output).toContain("TS2322");
    expect(bad.code).not.toBe(0);
  },
  deadline,
);

test(
  "declaration emission honors noEmit, noEmitOnError and reports output IO failures",
  async () => {
    using dir = tempDir("check-declaration-errors", {
      "tsconfig.json": config,
      "entry.ts": "export const value: string = 42;",
      "blocked": "a file cannot be an output directory",
    });
    const flags = ["--declaration", "--emitDeclarationOnly", "--outDir", "dist"];
    const invalid = await check(String(dir), ...flags, "--noEmitOnError", "entry.ts");
    expect(invalid.output).toContain("TS2322");
    expect(invalid.code).not.toBe(0);
    expect(await Bun.file(join(String(dir), "dist/entry.d.ts")).exists()).toBe(false);
    await Bun.write(join(String(dir), "entry.ts"), "export const value = 42;");
    const disabled = await check(String(dir), ...flags, "--noEmit", "entry.ts");
    expect(disabled.output).not.toContain("error TS");
    expect(disabled.code).toBe(0);
    expect(await Bun.file(join(String(dir), "dist/entry.d.ts")).exists()).toBe(false);
    const failed = await check(
      String(dir),
      "--declaration",
      "--emitDeclarationOnly",
      "--outDir",
      "blocked",
      "entry.ts",
    );
    expect(failed.output).toContain("TS5033");
    expect(failed.code).not.toBe(0);
  },
  deadline,
);
