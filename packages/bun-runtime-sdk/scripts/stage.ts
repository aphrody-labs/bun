// SPDX-License-Identifier: Apache-2.0
// Stages target/runtime into the verified artifact layout the Python ctypes binding loads:
// target/artifact/<triple>/current/{library, yolo_runtime.h, manifest.json}.
// Usage: bun scripts/stage.ts  (after `cargo build --profile runtime -p yolo-runtime`)
import { $ } from "bun";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const library = join(
  root,
  "target/runtime",
  process.platform === "win32"
    ? "yolo_runtime.dll"
    : process.platform === "darwin"
      ? "libyolo_runtime.dylib"
      : "libyolo_runtime.so",
);
const header = join(root, "include/yolo_runtime.h");
if (!(await Bun.file(library).exists())) {
  console.error(`missing ${library}: run cargo build --profile runtime -p yolo-runtime`);
  process.exit(1);
}

const triple = (await $`rustc -vV`.cwd(root).text()).match(/^host: (.+)$/m)![1].trim();
const rev = (await $`git rev-parse HEAD`.cwd(root).text()).trim();
const dirty = (await $`git status --porcelain -- .`.cwd(root).text()).trim().length > 0;
const abi = (await Bun.file(header).text()).match(/YOLO_ABI_MAJOR (\d+)u[\s\S]*?YOLO_ABI_MINOR (\d+)u/)!;

const out = join(root, "target/artifact", triple, "current");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const files: Record<string, { bytes: number; sha256: string }> = {};
for (const source of [library, header]) {
  const target = join(out, basename(source));
  copyFileSync(source, target);
  const bytes = await Bun.file(target).bytes();
  files[basename(source)] = { bytes: bytes.length, sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") };
}
await Bun.write(
  join(out, "manifest.json"),
  JSON.stringify(
    {
      schema: 1,
      name: "yolo-runtime",
      target: triple,
      abi: `${abi[1]}.${abi[2]}`,
      compatibility: { abiMajor: Number(abi[1]) },
      sources: { yolo: { rev, dirty } },
      build: { panicRecovery: true, profile: "runtime" },
      files,
    },
    null,
    2,
  ),
);
console.log(join(out, basename(library)));
if (dirty) console.warn("warning: uncommitted changes, the Python binding refuses a dirty artifact");
