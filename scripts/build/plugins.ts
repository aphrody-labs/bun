/**
 * Plugins: cold subsystems of the fork built as their own executables (`bun-<name>`) beside bun instead of
 * inside it. `src/runtime/cli/plugin_command.rs` finds them next to the executable, in the plugin directory,
 * or downloads them from the release of the exact bun that runs them.
 *
 * Each plugin is one opaque `cargo build` (cargo tracks its sources; restat keeps a no-op build free), then
 * a copy into the binary directory.
 */

import { resolve } from "node:path";
import type { Config } from "./config.ts";
import type { Ninja } from "./ninja.ts";
import { cargoBuildInvocation } from "./rust.ts";
import { quote, quoteArgs } from "./shell.ts";

export interface Plugin {
  /** Plugin name: `bun <name>` dispatches to `bun-<name>`. */
  name: string;
  /** Cargo package of the plugin's executable. */
  package: string;
}

export const plugins: Plugin[] = [{ name: "uv", package: "bun_plugin_uv" }];

/** Release asset name of a plugin, as `plugin_command.rs` `asset_name` computes it. */
export function pluginAssetName(plugin: string, os: string, arch: string, abi = "", exeSuffix = ""): string {
  return `bun-${plugin}-${os}-${arch}${abi}${exeSuffix}`;
}

/** Emit every plugin; returns the executables in the binary directory. */
export function emitPlugins(n: Ninja, cfg: Config): string[] {
  if (cfg.cargo === undefined || plugins.length === 0) return [];
  const hostWin = cfg.host.os === "windows";
  const { unitEnv, linker, triple } = cargoBuildInvocation(cfg);
  const targetDir = resolve(cfg.buildDir, "plugin-target");
  const profile = cfg.debug ? "dev" : "plugin";
  const profileDir = cfg.debug ? "debug" : "plugin";
  const env: Record<string, string> = {
    ...unitEnv,
    CARGO_TERM_COLOR: "always",
    // As for bun's own rustc edges, no compiler wrapper.
    RUSTC_WRAPPER: "",
    CARGO_BUILD_RUSTC_WRAPPER: "",
    [`CARGO_TARGET_${triple.toUpperCase().replace(/-/g, "_")}_LINKER`]: linker,
  };
  const envArgs = Object.entries(env)
    .map(([k, v]) => `--env=${k}=${quote(v, hostWin)}`)
    .join(" ");
  const copy = resolve(cfg.cwd, "scripts/build/copy-executable.ts");
  n.rule("plugin_copy", {
    command: `${quote(cfg.jsRuntime, hostWin)} ${quote(copy, hostWin)} $in $out`,
    description: "copy $out",
    restat: true,
  });
  // cargo decides what is stale, so its edge runs on every build.
  n.phony("plugin-always", []);
  const outputs: string[] = [];
  for (const plugin of plugins) {
    const exe = `bun-${plugin.name}${cfg.exeSuffix}`;
    const built = resolve(targetDir, triple, profileDir, exe);
    const args = [
      "-p",
      plugin.package,
      "--bin",
      `bun-${plugin.name}`,
      "--target",
      triple,
      "--target-dir",
      targetDir,
      "--profile",
      profile,
      "--locked",
    ];
    n.build({
      outputs: [built],
      rule: "dep_cargo",
      inputs: [],
      implicitInputs: ["plugin-always", cfg.cargo, resolve(cfg.cwd, "rust-toolchain.toml")],
      vars: { name: `plugin-${plugin.name}`, manifestdir: cfg.cwd, env: envArgs, args: quoteArgs(args, hostWin) },
    });
    const out = resolve(cfg.binaryDir, exe);
    n.build({ outputs: [out], rule: "plugin_copy", inputs: [built], implicitInputs: [copy] });
    outputs.push(out);
  }
  n.phony(
    "plugins",
    outputs.map(o => n.rel(o)),
  );
  return outputs;
}
