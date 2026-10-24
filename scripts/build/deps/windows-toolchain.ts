import { resolve } from "node:path";
import type { Config } from "../config.ts";

/**
 * In-tree crate behind `bun msvc` (a path dependency of bun_runtime, not fetched): vendor/find-msvc-tools (cc-rs).
 * Listed so editing it re-runs cargo.
 */
export function windowsToolchainRustSources(cfg: Config): string[] {
  const sources: string[] = [];
  for (const dir of ["vendor/find-msvc-tools"]) {
    const root = resolve(cfg.cwd, dir);
    sources.push(
      ...new Bun.Glob("{Cargo.toml,**/Cargo.toml,**/*.rs}").scanSync({
        cwd: root,
        onlyFiles: true,
        absolute: true,
      }),
    );
  }
  return sources.sort();
}
