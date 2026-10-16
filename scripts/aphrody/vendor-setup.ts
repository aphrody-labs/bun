// Re-creates optional source checkouts under vendor/ at pinned revisions.
// Inventory and rationale: docs/project/vendor.md.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");

type Source = { repo: string; rev: string; dest: string; patch?: string; submodules?: boolean; after?: string[] };

export const SOURCES: Record<string, Source> = {
  // Audit-only references; the build uses the crates.io releases (axum 0.8.9, leptos 0.8.22).
  axum: {
    repo: "https://github.com/aphrody-labs/axum",
    rev: "c59208c86fded335cd85e388030ad59347b0e5ae",
    dest: "vendor/axum",
  },
  leptos: {
    repo: "https://github.com/aphrody-labs/leptos",
    rev: "7ec903d4008ddf7679e771863f7b8b90f5cdebde",
    dest: "vendor/leptos",
  },
  gn: {
    repo: "https://github.com/aphrody-labs/gn",
    rev: "3f99f58c2568dd267952dcd80696406474f7e2ea",
    dest: "build/sources/gn",
    after: ["bun", "scripts/aphrody/vendor-gn.ts", "--source=build/sources/gn"],
  },
  cef: {
    repo: "https://github.com/aphrody-labs/cef",
    rev: "7e28cb05af72af8c0cdfafe7facfca97eed139c8",
    dest: "vendor/cef",
  },
  ffmpeg: {
    repo: "https://github.com/FFmpeg/FFmpeg",
    rev: "263f2714221637396d088abe9a2dbe7c98192cc5",
    dest: "vendor/ffmpeg",
  },
  mpv: {
    repo: "https://github.com/mpv-player/mpv",
    rev: "88eb9f2e73945d8bc9c133a2f67babaa9af34680",
    dest: "vendor/mpv",
    patch: "scripts/aphrody/vendor-patches/mpv.patch",
  },
  libplacebo: {
    repo: "https://github.com/haasn/libplacebo",
    rev: "1dd022687b9ac1dd996855b51433bf770ae76aab",
    dest: "vendor/libplacebo",
    patch: "scripts/aphrody/vendor-patches/libplacebo.patch",
    submodules: true,
  },
  fluentui: {
    repo: "https://github.com/aphrody-labs/fluentui",
    rev: "a2ebcfa86f7df5930fb4c75a4dde5b81c6d24860",
    dest: "vendor/fluentui",
  },
  powershell: {
    repo: "https://github.com/aphrody-labs/PowerShell",
    rev: "cf5765391c7c78914d5316f0b8105fa652456cc4",
    dest: "vendor/powershell",
  },
  roslyn: {
    repo: "https://github.com/aphrody-labs/roslyn",
    rev: "c8b2c7a7e2c29fb031f39008e6258a8706dbf6b1",
    dest: "vendor/roslyn",
  },
  vcpkg: {
    repo: "https://github.com/aphrody-labs/vcpkg",
    rev: "e664453ac3e6a07c62c92bedeb562effe662a44b",
    dest: "vendor/vcpkg",
  },
  "windows-terminal": {
    repo: "https://github.com/aphrody-labs/terminal",
    rev: "2304e801074b546b4544f5cd697e98b0e4c94359",
    dest: "vendor/windows-terminal",
  },
};

async function run(cmd: string[], cwd = root) {
  const proc = Bun.spawn(cmd, { cwd, stdout: "inherit", stderr: "inherit" });
  if ((await proc.exited) !== 0) throw new Error(`${cmd.join(" ")} failed`);
}

export async function setup(name: string) {
  const source = SOURCES[name];
  if (!source) throw new Error(`Unknown vendor source ${name}`);
  const dest = join(root, source.dest);
  if (!existsSync(join(dest, ".git"))) await run(["git", "init", "-q", dest]);
  await run(["git", "-C", dest, "fetch", "--depth=1", source.repo, source.rev]);
  await run(["git", "-C", dest, "checkout", "-q", "--force", source.rev]);
  if (source.submodules) await run(["git", "-C", dest, "submodule", "update", "--init", "--depth=1"]);
  if (source.patch) await run(["git", "-C", dest, "apply", join(root, source.patch)]);
  if (source.after) await run(source.after);
}

if (import.meta.main) {
  const names = Bun.argv.slice(2);
  if (!names.length || names[0] === "list") {
    for (const [name, s] of Object.entries(SOURCES)) console.log(`${name}\t${s.repo}@${s.rev}\t${s.dest}`);
  } else {
    for (const name of names[0] === "all" ? Object.keys(SOURCES) : names) await setup(name);
  }
}
