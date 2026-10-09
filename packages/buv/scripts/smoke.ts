#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { qualifyCore } from "./core.ts";
import { run, sha256File } from "./lib.ts";
import { MANIFEST_PATH, verifyManifest, type Manifest } from "./manifest.ts";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
  ms: number;
}
export interface SmokeOptions {
  wheel?: string;
  expectUv: string;
  expectRuff: string;
  expectPython: string;
}
export const OLDEST_HOST_GLIBC = "2.39";

export function smokePlan(
  prefix: string,
  scratch: string,
  options: SmokeOptions,
): { name: string; run: () => Promise<{ ok: boolean; detail: string }> }[] {
  const extension = process.platform === "win32" ? ".exe" : "";
  const bin = (name: string) => join(prefix, "bin", `${name}${extension}`);
  const env = { BUV_RUNTIME: prefix, UV_PYTHON_DOWNLOADS: "never", UV_NO_CONFIG: "1", PYTHONDONTWRITEBYTECODE: "1" };
  return [
    {
      name: "manifest",
      run: async () => {
        const problems = await verifyManifest(prefix);
        const manifest = (await Bun.file(join(prefix, MANIFEST_PATH)).json()) as Manifest;
        if (!manifest.nativeCore) problems.push("native core provenance is missing");
        return {
          ok: !problems.length,
          detail: problems.length ? problems.slice(0, 5).join("; ") : "every artifact file and link matches",
        };
      },
    },
    {
      name: "native core",
      run: async () => {
        const core = await qualifyCore(bin("buv"), options.expectUv);
        const manifest = (await Bun.file(join(prefix, MANIFEST_PATH)).json()) as Manifest;
        return {
          ok: core.sha256 === manifest.nativeCore?.sha256,
          detail: `${core.version}; ${core.uv}; ${core.engine} ${core.webkit}`,
        };
      },
    },
    {
      name: "PyJS binary identity",
      run: async () => {
        const [core, alias] = await Promise.all([sha256File(bin("buv")), sha256File(bin("pyjs"))]);
        return { ok: core === alias, detail: "buv and pyjs must contain the same native core" };
      },
    },
    {
      name: "embedded UV",
      run: async () => {
        const result = await run([bin("buv"), "uv", "--version"], { env });
        return {
          ok:
            result.code === 0 &&
            new RegExp(`^uv ${options.expectUv.replaceAll(".", "\\.")}(?:\\s|$)`).test(result.stdout.trim()),
          detail: result.stdout.trim(),
        };
      },
    },
    ...(existsSync(bin("ruff"))
      ? [
          {
            name: "packaged Ruff",
            run: async () => {
              const sample = join(scratch, "sample.py");
              await Bun.write(sample, "import os\n");
              const [version, result] = await Promise.all([
                run([bin("ruff"), "--version"], { env }),
                run([bin("ruff"), "check", "--no-cache", sample], { env }),
              ]);
              return {
                ok:
                  version.code === 0 &&
                  new RegExp(`^ruff ${options.expectRuff.replaceAll(".", "\\.")}(?:\\s|$)`).test(
                    version.stdout.trim(),
                  ) &&
                  result.code === 1 &&
                  result.stdout.includes("F401"),
                detail: `${version.stdout.trim()}; F401 exit ${result.code}; separate packaged component`,
              };
            },
          },
        ]
      : []),
    ...(existsSync(bin("python3"))
      ? [
          {
            name: "packaged CPython prefix",
            run: async () => {
              const result = await run(
                [bin("python3"), "-c", "import sys,ssl,sqlite3,zlib,ctypes; print(sys.version.split()[0])"],
                { env },
              );
              return {
                ok: result.code === 0 && result.stdout.trim() === options.expectPython,
                detail: `${result.stdout.trim()}; shared PyJS host requires its own native integration gate`,
              };
            },
          },
        ]
      : []),
  ];
}

export async function smoke(prefix: string, options: SmokeOptions): Promise<{ ok: boolean; checks: Check[] }> {
  if (options.wheel)
    throw new Error(
      "wheel parity requires a separately qualified native PyJS host; this package smoke does not imply one",
    );
  const scratch = mkdtempSync(join(tmpdir(), "buv-smoke-"));
  try {
    const checks = await Promise.all(
      smokePlan(prefix, scratch, options).map(async check => {
        const start = performance.now();
        try {
          return { name: check.name, ...(await check.run()), ms: performance.now() - start };
        } catch (error) {
          return {
            name: check.name,
            ok: false,
            detail: error instanceof Error ? error.message : String(error),
            ms: performance.now() - start,
          };
        }
      }),
    );
    return { ok: checks.every(check => check.ok), checks };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const value = (flag: string) => {
    const at = argv.indexOf(flag);
    return at >= 0 ? argv[at + 1] : undefined;
  };
  if (!argv[0]) throw new Error("usage: smoke.ts <Buv artifact>");
  const result = await smoke(resolve(argv[0]), {
    expectUv: value("--expect-uv") ?? "0.12.24",
    expectRuff: value("--expect-ruff") ?? "0.16.10",
    expectPython: value("--expect-python") ?? "3.12.15",
    wheel: value("--wheel"),
  });
  console.log(JSON.stringify(result));
  process.exitCode = result.ok ? 0 : 1;
}
