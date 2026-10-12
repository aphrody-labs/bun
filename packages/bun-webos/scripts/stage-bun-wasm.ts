#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { join, resolve } from "node:path";

const path = Bun.argv[Bun.argv.indexOf("--artifact") + 1];
if (!Bun.argv.includes("--artifact") || !path)
  throw new Error("Provide --artifact <bun_wasm.wasm> from the Bun native build owner");
const artifact = Bun.file(resolve(path));
const bytes = new Uint8Array(await artifact.arrayBuffer());
if (!WebAssembly.validate(bytes)) throw new Error("Artifact is not valid WebAssembly");
const appDir = resolve(import.meta.dir, "..");
const destination = join(appDir, "dist", "wasm", "bun", "bun_wasm.wasm");
await Bun.write(destination, bytes);
const manifest = {
  schema: "bun.webos-wasm/1",
  owner: "src/wasm (bun_wasm)",
  target: "wasm32-wasip1-threads",
  artifact: "dist/wasm/bun/bun_wasm.wasm",
  bytes: bytes.byteLength,
  sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
  qualificationCommand: "bun scripts/qualify-bun-wasm.ts",
};
await Bun.write(join(appDir, "dist", "bun-wasm.manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify(manifest));
