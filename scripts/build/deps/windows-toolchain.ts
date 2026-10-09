import { resolve } from "node:path";
import type { Config } from "../config.ts";

/**
 * In-tree crates behind `bun msvc` and `bun winmd` (path dependencies of bun_runtime, not fetched):
 * vendor/find-msvc-tools (cc-rs) and vendor/windows-rs (windows-bindgen, windows-metadata and the
 * zstd-compressed default .winmd files). Listed so editing them re-runs cargo.
 */
export function windowsToolchainRustSources(cfg: Config): string[] {
  const sources: string[] = [];
  for (const dir of ["vendor/find-msvc-tools", "vendor/windows-rs"]) {
    const root = resolve(cfg.cwd, dir);
    sources.push(
      ...new Bun.Glob("{Cargo.toml,**/Cargo.toml,**/*.rs,**/*.winmd.zst}").scanSync({
        cwd: root,
        onlyFiles: true,
        absolute: true,
      }),
    );
  }
  return sources.sort();
}
