// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assemble } from "./assemble.ts";
import type { NativeCore } from "./core.ts";
import { ROOT, sha256File } from "./lib.ts";
import { MANIFEST_PATH, verifyManifest } from "./manifest.ts";

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A repository root with the real pins and manifest, a fake CPython prefix and fake release binaries. */
async function fixture(): Promise<{ root: string; targetDir: string; out: string; core: NativeCore; target: string }> {
  const dir = mkdtempSync(join(tmpdir(), "buv-assemble-"));
  directories.push(dir);
  for (const file of ["vendor.json", "buv.json", "Cargo.toml", "LICENSE"]) {
    await Bun.write(join(dir, file), Bun.file(join(ROOT, file)));
  }
  const prefix = join(dir, "build", "python");
  mkdirSync(join(prefix, "bin"), { recursive: true });
  mkdirSync(join(prefix, "lib", "python3.12"), { recursive: true });
  writeFileSync(join(prefix, "bin", "python3.12"), "interpreter");
  symlinkSync("python3.12", join(prefix, "bin", "python3"));
  writeFileSync(join(prefix, "lib", "libpython3.12.so.1.0"), "libpython");
  writeFileSync(join(prefix, "lib", "python3.12", "os.py"), "# os\n");
  const targetDir = join(dir, "target");
  mkdirSync(join(targetDir, "release"), { recursive: true });
  for (const binary of ["buv", "uv", "ruff"]) {
    writeFileSync(join(targetDir, "release", binary), `#!${binary}\n`);
    chmodSync(join(targetDir, "release", binary), 0o644);
  }
  const executable = join(targetDir, "release", "buv");
  return {
    root: dir,
    targetDir,
    out: join(dir, "artifacts"),
    target: "x86_64-unknown-linux-gnu",
    core: {
      schema: "buv-core/1",
      name: "buv",
      version: "1.3.14",
      revision: "1".repeat(40),
      engine: "JavaScriptCore",
      webkit: "2".repeat(40),
      graph: true,
      executable,
      sha256: await sha256File(executable),
      uv: "uv 0.12.24",
    },
  };
}

describe("assemble", () => {
  test("stages one core under Buv and PyJS with a verified prefix and manifest", async () => {
    const { root, targetDir, out, core } = await fixture();
    const revision = "abcdef0123456789abcdef0123456789abcdef01";
    const { artifact, manifest } = await assemble({
      root,
      targetDir,
      out,
      revision,
      toolchain: "rustc 1.98.1",
      target: "x86_64-unknown-linux-gnu",
      core,
    });
    expect(artifact).toBe(join(out, `0.1.0-${revision.slice(0, 8)}`));
    expect(existsSync(`${artifact}.partial`)).toBe(false);
    for (const binary of ["buv", "pyjs", "ruff"]) {
      const mode = lstatSync(join(artifact, "bin", binary)).mode & 0o777;
      expect(manifest.files[`bin/${binary}`]?.mode).toBe(mode);
      if (process.platform !== "win32") expect(mode & 0o111).not.toBe(0);
      expect(manifest.files[`bin/${binary}`]).toBeDefined();
    }
    expect(lstatSync(join(artifact, "bin", "python3")).isSymbolicLink()).toBe(true);
    expect(manifest.links["bin/python3"]).toBe("python3.12");
    expect(existsSync(join(artifact, "share", "buv", "licenses", "buv", "LICENSE"))).toBe(true);
    expect(manifest).toMatchObject({
      schema: 1,
      name: "buv-runtime",
      version: "0.1.0",
      revision,
      toolchain: "rustc 1.98.1",
      capabilities: ["javascript", "uv", "ruff", "python-prefix"],
    });
    expect(manifest.pins["uv"]).toMatchObject({
      upstreamTag: "0.12.24",
      forkBranch: "claude/bun-uv",
    });
    expect(manifest.pins["python"]).toMatchObject({ version: "3.12.15", release: "20261003" });
    expect(await verifyManifest(artifact)).toEqual([]);
    expect(existsSync(join(artifact, MANIFEST_PATH))).toBe(true);
    expect(existsSync(join(artifact, "bin", "uv"))).toBe(false);
    expect(manifest.files["bin/buv"]?.sha256).toBe(manifest.files["bin/pyjs"]?.sha256);
    expect(manifest.files["bin/buv"]?.sha256).toBe(core.sha256);
  });

  test("an incomplete CPython prefix or changed qualified core is refused", async () => {
    const first = await fixture();
    rmSync(join(first.root, "build", "python", "lib", "libpython3.12.so.1.0"));
    await expect(assemble({ ...first, revision: "a".repeat(40), toolchain: "t" })).rejects.toThrow("scripts/fetch.ts");
    const second = await fixture();
    writeFileSync(second.core.executable, "changed core bytes");
    await expect(assemble({ ...second, revision: "a".repeat(40), toolchain: "t" })).rejects.toThrow(
      "qualified core binary changed",
    );
  });

  test("does not replace an artifact with the same version and revision", async () => {
    const { root, targetDir, out, core, target } = await fixture();
    const options = {
      root,
      targetDir,
      out,
      revision: "abcdef0123456789abcdef0123456789abcdef01",
      toolchain: "rustc test",
      core,
      target,
    };
    const first = await assemble(options);
    await expect(assemble(options)).rejects.toThrow("artifact is immutable and already exists");
    expect(first.artifact).toBe(join(out, "0.1.0-abcdef01"));
  });
});
