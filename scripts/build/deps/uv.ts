import { resolve } from "node:path";
import type { Config } from "../config.ts";
import type { Dependency } from "../source.ts";

export function uvRustSources(cfg: Config): string[] {
  const root = resolve(cfg.cwd, "vendor/uv");
  return [
    ...new Bun.Glob("{Cargo.toml,Cargo.lock,rust-toolchain.toml,crates/**/Cargo.toml,crates/**/*.rs}").scanSync({
      cwd: root,
      onlyFiles: true,
      absolute: true,
    }),
  ].sort();
}

export const uv: Dependency = {
  name: "uv",
  source: () => ({ kind: "in-tree", path: "vendor/uv" }),
  build: () => ({ kind: "none" }),
  provides: () => ({ libs: [], includes: [] }),
};
