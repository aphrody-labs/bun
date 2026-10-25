/**
 * Generates the repo-root `.cargo/config.toml` at configure time.
 *
 * Why generated and not checked in: the linker for the Rust crates is
 * `clang++` driving `lld` — but the absolute path to that clang++ is
 * machine-specific (CI puts the LLVM toolchain at a versioned path like
 * `/opt/llvm-N/bin/clang++`; a contributor's box has it wherever rustup /
 * the system package manager dropped it). `tools.ts` already discovers the
 * real toolchain (`cfg.hostCxx`), so we write the per-target `linker = `
 * lines from that discovered path rather than hardcoding one.
 *
 * For the `bun bd` / ninja build this file is purely advisory: `rust.ts`
 * passes `-C linker=` (plus `CC`/`CXX`/`AR` in the environment) and
 * `-Clink-arg=-fuse-ld=lld` on every rustc edge itself, which overrides
 * anything here. The file matters for a contributor running `cargo build` /
 * `cargo check` directly, and for rust-analyzer.
 *
 * `writeIfChanged` semantics (precedent: `depVersionsHeader.ts`) so a
 * reconfigure with an unchanged toolchain doesn't bump the file's mtime and
 * trigger a spurious rust-analyzer / cargo reanalysis.
 */

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Config } from "./config.ts";
import { writeIfChanged } from "./fs.ts";
import { allRustTargets, rustTarget } from "./rust.ts";

/** OS component of a Rust target triple (`x86_64-unknown-linux-gnu` → `"linux"`). */
function tripleOs(triple: string): "linux" | "darwin" | "windows" | "freebsd" {
  if (triple.includes("darwin")) return "darwin";
  if (triple.includes("windows")) return "windows";
  if (triple.includes("freebsd")) return "freebsd";
  return "linux";
}

/**
 * Linker for `triple`. When the triple's OS matches the host OS we know the
 * discovered host clang++ can drive the link (a linux clang++ links every
 * linux arch's staticlib; macOS clang is multi-arch) — use the absolute path
 * so a versioned/non-PATH toolchain still works. For a foreign OS we don't
 * have a verified cross-linker path; `cargo check` never links and the ninja
 * build sets the linker via env anyway, so fall back to the conventional
 * driver name and let PATH resolve it if someone actually cross-links.
 */
function linkerFor(triple: string, cfg: Config): string {
  // android needs the NDK sysroot/runtimes; musl needs a different libc/sysroot.
  // The host's gnu clang++ isn't a valid driver for either even on a linux
  // host, so fall back to the conventional driver name (PATH-resolved) —
  // matches the foreign-OS case below. `cargo check` never links, and the ninja
  // build passes `-C linker=` on its rustc edges anyway.
  if (triple.includes("android") || triple.includes("musl")) return "clang++";
  // cfg.hostCxx, not cfg.cxx: this entry covers HOST artifacts (build
  // scripts, proc-macros) even during ninja builds, and when cross-compiling
  // for windows cfg.cxx is clang-cl — not a valid posix link driver.
  return tripleOs(triple) === cfg.host.os ? cfg.hostCxx : "clang++";
}

/**
 * The native Windows host's entry, so `cargo check`/`cargo build`/rust-analyzer work from any shell
 * without a developer prompt: rustc's own MSVC discovery takes the newest Visual Studio instance,
 * which need not have the x64 libraries (`LNK1104: cannot open 'msvcrt.lib'`), and its default
 * `link.exe` resolves through PATH, where Git Bash puts coreutils' `link`. Instead: lld-link by
 * absolute path, searching the library directories of the toolset `bun bd` itself pinned (the LIB
 * that `loadNativeMsvcEnv()` in scripts/build.ts, or a developer prompt, put in this process), which
 * come before any LIB rustc sets for the linker. Build scripts' cc-rs makes the same choice of
 * instance (`cl.exe` of the newest one), so `[env]` gives it the compilers `bun bd` passes its own
 * edges and that toolset's INCLUDE and LIB; a variable already set (a developer prompt) wins.
 */
export function msvcHostEntry(
  cfg: Pick<Config, "host" | "ld" | "cc" | "cxx" | "ar">,
  host: string,
  env: NodeJS.ProcessEnv = process.env,
): string[] | undefined {
  if (cfg.host.os !== "windows" || !host.endsWith("-pc-windows-msvc") || !/lld-link(\.exe)?$/i.test(cfg.ld))
    return undefined;
  const dirs = (name: string) => (env[name] ?? "").split(";").filter(dir => dir.length > 0);
  const libs = dirs("LIB");
  const includes = dirs("INCLUDE");
  if (libs.length === 0 || includes.length === 0) return undefined;
  const rustflags = libs.flatMap(dir => ["-C", `link-arg=/LIBPATH:${dir}`]);
  const entry = (name: string, value: string) => `${name} = { value = ${JSON.stringify(value)}, force = false }`;
  const suffix = host.replace(/-/g, "_");
  return [
    `[target.${host}]  # host`,
    `linker = ${JSON.stringify(cfg.ld)}`,
    `rustflags = [${rustflags.map(flag => JSON.stringify(flag)).join(", ")}]`,
    "",
    "[env]",
    entry(`CC_${suffix}`, cfg.cc),
    entry(`CXX_${suffix}`, cfg.cxx),
    entry(`AR_${suffix}`, cfg.ar),
    entry("INCLUDE", includes.join(";")),
    entry("LIB", libs.join(";")),
  ];
}

/**
 * Write `.cargo/config.toml` next to the workspace `Cargo.toml` (repo root).
 * Returns the absolute path written.
 *
 * Windows-msvc targets get only the native host's entry (`msvcHostEntry`): the MSVC linkers aren't
 * clang drivers and don't take `-fuse-ld=lld`. `bun bd` itself passes `-C linker=` on its rustc edges.
 */
export function generateCargoConfig(cfg: Config): string {
  const outPath = resolve(cfg.cwd, ".cargo", "config.toml");
  const host = rustTarget(cfg);

  const lines: string[] = [
    "# GENERATED by scripts/build/ — do not edit; regenerate with `bun bd`",
    "#",
    "# Linker for the Rust crates: clang++ driving lld. The C/C++ object set",
    "# pulled in by `bun_runtime` is built with clang and assumes lld",
    "# semantics, and libstdc++ is linked statically via the driver — neither",
    "# of which the default `cc` link handles cleanly. Paths come from the",
    "# toolchain `scripts/build/tools.ts` discovered (`cfg.hostCxx`), so this",
    "# file is correct on whatever machine ran configure.",
  ];

  const msvc = msvcHostEntry(cfg, host);
  if (msvc !== undefined) lines.push("", ...msvc);

  for (const triple of allRustTargets) {
    if (tripleOs(triple) === "windows") continue;
    lines.push("");
    lines.push(`[target.${triple}]${triple === host ? "  # host" : ""}`);
    lines.push(`linker = ${JSON.stringify(linkerFor(triple, cfg))}`);
    // -Qunused-arguments: rustc passes link args that don't apply to every
    // artifact kind (e.g. `-no-pie` when it links a target cdylib; none
    // exists today, so this is defensive — same rationale as `emitRust` in
    // rust.ts), and its `linker_messages` lint re-surfaces clang's "argument
    // unused during compilation" complaint as a warning on every build-rust
    // job.
    // These config rustflags reach the cargo invocations that don't set
    // CARGO_ENCODED_RUSTFLAGS themselves (the lolhtml dep edge, plain
    // `cargo build`/`cargo check`, rust-analyzer); real linker errors still
    // fail the link.
    lines.push(
      `rustflags = ["-C", "link-arg=-fuse-ld=lld", "-C", "link-arg=-Qunused-arguments", "-A", "linker_messages"]`,
    );
  }
  lines.push("");

  mkdirSync(resolve(cfg.cwd, ".cargo"), { recursive: true });
  writeIfChanged(outPath, lines.join("\n"));
  return outPath;
}
