/**
 * Plugins: cold subsystems of the fork built as their own executables (`bun-<name>`) beside bun instead of
 * inside it. `src/runtime/cli/plugin_command.rs` finds them next to the executable, in the plugin directory,
 * or downloads them from the release of the exact bun that runs them.
 *
 * Each plugin is its own repository (aphrody-labs/bun-<name>), mounted as the optional submodule `plugins/<name>`
 * (`update = none`; `git submodule update --init --checkout --recursive plugins/<name>`). Its Cargo workspace
 * path-depends on crates of this checkout. Unmounted plugins are skipped.
 *
 * Each plugin is one opaque `cargo build` in its workspace (cargo tracks its sources; restat keeps a no-op build
 * free), then a copy into the binary directory.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Config } from "./config.ts";
import { WINFW_SYSTEM_LIBRARIES } from "./deps/winfw.ts";
import type { Ninja } from "./ninja.ts";
import { cargoBuildInvocation } from "./rust.ts";
import { quote, quoteArgs } from "./shell.ts";

export interface Plugin {
  /** Plugin name: `bun <name>` dispatches to `bun-<name>`. */
  name: string;
  /** Cargo package of the plugin's executable. */
  package: string;
  /** Build outputs of bun's graph the plugin links, their environment for cargo and extra rustflags. */
  native?: (cfg: Config) => { inputs: string[]; env: Record<string, string>; rustflags: string[] };
}

export const plugins: Plugin[] = [
  { name: "uv", package: "bun_plugin_uv" },
  {
    name: "vpn",
    package: "bun_plugin_vpn",
    // talpid-core links the Windows firewall library bun's graph compiles (deps/winfw.ts).
    native: cfg =>
      cfg.windows
        ? {
            inputs: [resolve(cfg.buildDir, "deps/winfw/winfw.lib")],
            env: { BUN_WINFW_STATIC: "1", WINFW_LIB_DIR: resolve(cfg.buildDir, "deps/winfw") },
            rustflags: WINFW_SYSTEM_LIBRARIES.map(lib => `-Clink-arg=${lib}`),
          }
        : { inputs: [], env: {}, rustflags: [] },
  },
  { name: "ssh", package: "bun_plugin_ssh" },
  { name: "docker", package: "bun_plugin_docker" },
  { name: "just", package: "bun_plugin_just" },
  { name: "winmd", package: "bun_plugin_winmd" },
];

/** Checkout directory of a plugin's workspace, mounted as a submodule. */
export function pluginDir(cwd: string, plugin: Plugin): string {
  return resolve(cwd, "plugins", plugin.name);
}

/** The plugins whose submodule is checked out. */
export function mountedPlugins(cwd: string): Plugin[] {
  return plugins.filter(plugin => existsSync(resolve(pluginDir(cwd, plugin), "Cargo.toml")));
}

/** Emit every mounted plugin; returns the executables in the binary directory. */
export function emitPlugins(n: Ninja, cfg: Config): string[] {
  const mounted = mountedPlugins(cfg.cwd);
  if (cfg.cargo === undefined || mounted.length === 0) return [];
  const hostWin = cfg.host.os === "windows";
  const { unitEnv, triple } = cargoBuildInvocation(cfg);
  // What bun's graph compiles is LLVM bitcode under LTO (deps/winfw for the vpn plugin), which only lld reads.
  const linker = cfg.windows ? cfg.ld : cfg.cxx;
  const targetDir = resolve(cfg.buildDir, "plugin-target");
  const profile = cfg.debug ? "dev" : "plugin";
  const profileDir = cfg.debug ? "debug" : "plugin";
  const copy = resolve(cfg.cwd, "scripts/build/copy-executable.ts");
  n.rule("plugin_copy", {
    command: `${quote(cfg.jsRuntime, hostWin)} ${quote(copy, hostWin)} $in $out`,
    description: "copy $out",
    restat: true,
  });
  // cargo decides what is stale, so its edge runs on every build.
  n.phony("plugin-always", []);
  const outputs: string[] = [];
  for (const plugin of mounted) {
    const dir = pluginDir(cfg.cwd, plugin);
    const native = plugin.native?.(cfg) ?? { inputs: [], env: {}, rustflags: [] };
    // The C/C++ bun's graph compiles for Windows uses the static CRT (/MT); so does every plugin, which then
    // needs no Visual C++ runtime installed.
    const rustflags = [
      ...(cfg.windows ? ["-Ctarget-feature=+crt-static"] : ["-Clink-arg=-fuse-ld=lld"]),
      // A cross build's lld-link finds the CRT and SDK import libraries only through the sysroot, as the shim's does.
      ...(cfg.windows && cfg.winsysroot !== undefined ? [`-Clink-arg=/winsysroot:${cfg.winsysroot}`] : []),
      ...native.rustflags,
    ];
    const env: Record<string, string> = {
      ...unitEnv,
      ...native.env,
      CARGO_TERM_COLOR: "always",
      // As for bun's own rustc edges, no compiler wrapper.
      RUSTC_WRAPPER: "",
      CARGO_BUILD_RUSTC_WRAPPER: "",
      // aws-lc-sys (russh, rustls) assembles with nasm from PATH; its prebuilt objects need none.
      ...(cfg.windows ? { AWS_LC_SYS_PREBUILT_NASM: "1" } : {}),
      [`CARGO_TARGET_${triple.toUpperCase().replace(/-/g, "_")}_LINKER`]: linker,
      ...(rustflags.length > 0 ? { RUSTFLAGS: rustflags.join(" ") } : {}),
    };
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
      implicitInputs: [
        "plugin-always",
        cfg.cargo,
        resolve(cfg.cwd, "rust-toolchain.toml"),
        resolve(dir, "Cargo.lock"),
        ...native.inputs,
      ],
      vars: {
        name: `plugin-${plugin.name}`,
        manifestdir: dir,
        env: Object.entries(env)
          .map(([k, v]) => `--env=${k}=${quote(v, hostWin)}`)
          .join(" "),
        args: quoteArgs(args, hostWin),
      },
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
