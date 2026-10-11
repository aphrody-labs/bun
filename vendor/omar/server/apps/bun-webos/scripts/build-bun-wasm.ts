#!/usr/bin/env bun
/** Build and install the supported Bun WASM subset used by WebOS. */
import { createHash } from "node:crypto";
import { join } from "node:path";

const appDir = import.meta.dir.replace(/\\scripts$/, "");
const sourceRoot = process.env.BUN_SOURCE_ROOT ?? "C:/bun";
const cargo = Bun.which("cargo") ?? "C:/Users/omara/.cargo/bin/cargo.exe";
const buildArgs = ["build", "-p", "bun_wasm", "--profile", "wasm", "--target", "wasm32-wasip1-threads"];

if (!Bun.argv.includes("--skip-build")) {
  const build = Bun.spawn([cargo, ...buildArgs], { cwd: sourceRoot, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  const code = await build.exited;
  if (code !== 0) process.exit(code);
}

const source = join(sourceRoot, "target/wasm32-wasip1-threads/wasm/bun_wasm.wasm");
const destination = join(appDir, "dist/wasm/bun/bun_wasm.wasm");
const artifact = Bun.file(source);
if (!(await artifact.exists())) throw new Error(`WASM build output not found: ${source}`);
const bytes = new Uint8Array(await artifact.arrayBuffer());
await Bun.write(destination, bytes);
const sha256 = createHash("sha256").update(bytes).digest("hex");

const manifest = {
  schema: "aphrody.bun-webos-wasm/1",
  owner: "C:/bun/src/wasm (bun_wasm)",
  bunVersion: "1.4.4",
  sourceRevision: "65c232c1db46f01037b983a11499df61229d1511",
  target: "wasm32-wasip1-threads",
  profile: "wasm",
  artifact: "dist/wasm/bun/bun_wasm.wasm",
  bytes: bytes.byteLength,
  sha256,
  capabilities: ["Bun.semver.order", "Bun.semver.satisfies", "Bun Shell parse", "Bun.markdown.html"],
  buildCommand: "bun server/apps/bun-webos/scripts/build-bun-wasm.ts",
  qualificationCommand: "bun server/apps/bun-webos/scripts/qualify-bun-wasm.ts",
};
await Bun.write(join(appDir, "bun-wasm.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ artifact: manifest.artifact, bytes: manifest.bytes, sha256 }));
