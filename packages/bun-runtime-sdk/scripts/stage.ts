// SPDX-License-Identifier: Apache-2.0
// Stages target/runtime into the verified artifact layout the Python ctypes binding loads:
// target/artifact/<triple>/current/{library, yolo_runtime.h, manifest.json}.
// Usage: bun scripts/stage.ts [explicit-built-library] [artifact-root]
import { $ } from "bun";
import { copyFileSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { Runtime, standaloneLibraryFile, type BuildInfo } from "../src/index.ts";
import { hostTargetInfo } from "../src/target.ts";
import { validateArtifactManifest } from "../src/artifact.ts";

export function assertStagedRuntimeIdentity(input: {
  native: BuildInfo;
  capabilities: string[];
  source: string;
  target: string;
  abi: string;
  version: string;
}) {
  if (
    input.native.abi !== input.abi ||
    input.native.target !== input.target ||
    input.native.version !== input.version ||
    input.native.panic_recovery !== true ||
    !/^[a-f0-9]{40}$/.test(input.source) ||
    !/^[a-f0-9]{12,40}$/.test(input.native.git_rev) ||
    !input.source.startsWith(input.native.git_rev) ||
    !["process.stdin", "process.wait"].every(capability => input.capabilities.includes(capability))
  )
    throw new Error(
      "Native runtime identity/capabilities differ from the current header, source or unwind profile; rebuild the runtime before staging",
    );
}

export async function stageRuntimeSDK(options: { sdkRoot?: string; library?: string; artifactRoot?: string } = {}) {
  const root = options.sdkRoot ?? resolve(import.meta.dir, "..");
  if (
    ![
      root,
      ...(options.library ? [options.library] : []),
      ...(options.artifactRoot ? [options.artifactRoot] : []),
    ].every(isAbsolute)
  )
    throw new Error("Native staging owners require absolute source, library and artifact paths");
  const defaultLibrary = join(
    root,
    "target/runtime",
    process.platform === "win32"
      ? "yolo_runtime.dll"
      : process.platform === "darwin"
        ? "libyolo_runtime.dylib"
        : "libyolo_runtime.so",
  );
  const library = options.library ?? defaultLibrary;
  const header = join(root, "include/yolo_runtime.h");
  const canonicalHeader = join(root, "include/buv_runtime.h");
  if (!(await Bun.file(library).exists())) {
    throw new Error(`missing ${library}: run cargo build --profile runtime -p yolo-runtime`);
  }

  const compilerHost = (await $`rustc -vV`.cwd(root).text()).match(/^host: (.+)$/m)?.[1]?.trim();
  if (!compilerHost) throw new Error("Native compiler host identity is absent");
  const host = hostTargetInfo(),
    triple = host.target;
  const rev = (await $`git rev-parse HEAD`.cwd(root).text()).trim();
  const dirty = (await $`git status --porcelain -- .`.cwd(root).text()).trim().length > 0;
  if (dirty) throw new Error("Commit the runtime SDK source before staging a pinned native artifact");
  const wholeCheckoutDirty = (await $`git status --porcelain --untracked-files=no`.cwd(root).text()).trim().length > 0;
  const abi = (await Bun.file(header).text()).match(/YOLO_ABI_MAJOR (\d+)u[\s\S]*?YOLO_ABI_MINOR (\d+)u/)!;
  const cargo = Bun.TOML.parse(await Bun.file(join(root, "Cargo.toml")).text()) as {
    workspace: { package: { version: string } };
  };

  const libraryBytes = await Bun.file(library).bytes();
  const librarySha256 = new Bun.CryptoHasher("sha256").update(libraryBytes).digest("hex");
  const runtime = Runtime.load({ libraryPath: library });
  let nativeBuild: BuildInfo;
  let capabilities: string[];
  try {
    nativeBuild = runtime.buildInfo();
    capabilities = runtime.capabilities();
    assertStagedRuntimeIdentity({
      native: nativeBuild,
      capabilities,
      source: rev,
      target: triple,
      abi: `${abi[1]}.${abi[2]}`,
      version: cargo.workspace.package.version,
    });
  } finally {
    runtime.close();
  }
  if (new Bun.CryptoHasher("sha256").update(await Bun.file(library).bytes()).digest("hex") !== librarySha256)
    throw new Error("Native runtime changed during identity verification");

  const artifactRoot = options.artifactRoot ?? join(root, "target/artifact");
  const out = join(artifactRoot, triple, "current");
  const scoped = relative(artifactRoot, resolve(out));
  if (!scoped || scoped.startsWith("..") || isAbsolute(scoped)) throw new Error("Unsafe native artifact destination");
  mkdirSync(out, { recursive: true });
  const resolvedRoot = realpathSync(artifactRoot),
    resolvedOut = realpathSync(out);
  const resolvedScope = relative(resolvedRoot, resolvedOut);
  if (!resolvedScope || resolvedScope.startsWith("..") || isAbsolute(resolvedScope))
    throw new Error("The native artifact destination escapes its explicit artifact store");
  const files: Record<string, { bytes: number; sha256: string }> = {};
  for (const source of [library, header, canonicalHeader]) {
    const name = source === library ? standaloneLibraryFile() : basename(source);
    const target = join(out, name);
    copyFileSync(source, target);
    const bytes = await Bun.file(target).bytes();
    files[name] = { bytes: bytes.length, sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") };
    if (source === library && files[name]!.sha256 !== librarySha256)
      throw new Error("Native runtime changed while staging its verified bytes");
  }
  const manifest = {
    schema: 1,
    name: "buv-runtime",
    version: cargo.workspace.package.version,
    target: triple,
    abi: `${abi[1]}.${abi[2]}`,
    compatibility: { abiMajor: Number(abi[1]) },
    toolchain: compilerHost,
    ...(host.libc ? { libc: host.libc } : {}),
    sources: { bun: { rev, dirty } },
    sourceStatus: { cleanScope: "packages/bun-runtime-sdk", wholeCheckoutDirty },
    build: { panicRecovery: nativeBuild.panic_recovery, profile: "runtime", native: nativeBuild },
    capabilities,
    files,
  };
  validateArtifactManifest(manifest, triple);
  await Bun.write(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
  // Remove the known retired library name only after the replacement's manifest is written.
  const legacyName =
    process.platform === "win32"
      ? "yolo_runtime.dll"
      : `libyolo_runtime.${process.platform === "darwin" ? "dylib" : "so"}`;
  if (legacyName !== standaloneLibraryFile()) rmSync(join(out, legacyName), { force: true });
  return join(out, standaloneLibraryFile());
}

if (import.meta.main) {
  if (process.argv.length > 4) throw new Error("Usage: bun scripts/stage.ts [explicit-built-library] [artifact-root]");
  console.log(
    await stageRuntimeSDK({
      ...(process.argv[2] ? { library: resolve(process.argv[2]) } : {}),
      ...(process.argv[3] ? { artifactRoot: resolve(process.argv[3]) } : {}),
    }),
  );
}
