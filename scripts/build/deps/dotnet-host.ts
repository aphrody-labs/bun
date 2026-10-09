import { resolve } from "node:path";
import type { Config } from "../config.ts";

export function dotnetHostRustSources(cfg: Config): string[] {
  const root = resolve(cfg.cwd, "packages/bun-dotnet-native");
  return [
    ...new Bun.Glob("{Cargo.toml,Cargo.lock,crates/**/Cargo.toml,crates/**/*.rs}").scanSync({
      cwd: root,
      onlyFiles: true,
      absolute: true,
    }),
  ].sort();
}
