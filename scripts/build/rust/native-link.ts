/**
 * The Linux executable is linked by clang++, not rustc. Native libraries recorded only in rlib metadata
 * therefore need a final-link input of their own. Build scripts are run by ninja, so collect their output
 * at build time, after the target scripts ran, rather than reading potentially stale output at configure.
 */
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { Config } from "../config.ts";
import { BuildError, assert } from "../error.ts";
import { writeIfChanged } from "../fs.ts";
import type { Ninja } from "../ninja.ts";
import { quote } from "../shell.ts";
import type { BuildScriptOutput } from "./cargo-env.ts";
import { linkedRlibs, type RustGraph } from "./units.ts";

/** clang response-file quoting, not shell quoting: neither a shell nor -Wl parses these arguments. */
export function nativeLinkResponse(args: string[]): string {
  return args.map(arg => `"${arg.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join("\n") + "\n";
}

/**
 * Linux native dependencies emitted by cargo build scripts. A normal static library is already packed
 * into its rlib by rustc (+bundle is the default); only -bundle archives need another linker input.
 * Per-target rustc-link-arg directives are not transitive library metadata and must not leak from deps.
 */
export function nativeLinkArguments(
  outputs: (Pick<BuildScriptOutput, "linkLibs" | "linkSearch"> & { cwd: string })[],
): string[] {
  const args: string[] = [];
  // Search directories precede libraries, preserving Cargo's order (no sorting or library deduplication).
  for (const output of outputs) {
    for (const search of output.linkSearch) {
      const match = /^(native|all|dependency|crate|framework)=(.*)$/.exec(search);
      const kind = match?.[1] ?? "all";
      const path = match?.[2] ?? search;
      if (kind === "dependency" || kind === "crate") continue;
      assert(kind !== "framework", "Rust framework search paths are not supported by the Linux native link");
      assert(path.length > 0 && !/[\0\r\n]/.test(path), "Invalid Rust native library search path");
      // rustc runs in the package directory; the final clang link runs in the build directory.
      args.push(`-L${isAbsolute(path) ? path : resolve(output.cwd, path)}`);
    }
  }
  for (const output of outputs) {
    for (const spec of output.linkLibs) {
      const equal = spec.indexOf("=");
      const [kind, modifiers = ""] = (equal < 0 ? "dylib" : spec.slice(0, equal)).split(":");
      // NAME:RENAME changes rustc's #[link] name, not the name of the library on disk.
      const name = (equal < 0 ? spec : spec.slice(equal + 1)).split(":")[0]!;
      assert(name.length > 0 && !/[\0\r\n]/.test(name), `Invalid Rust native library: ${spec}`);
      assert(kind === "static" || kind === "dylib", `Unsupported Linux Rust native library: ${spec}`);
      const mods = new Map<string, boolean>();
      for (const modifier of modifiers === "" ? [] : modifiers.split(",")) {
        const match = /^([+-])(bundle|whole-archive|verbatim|as-needed)$/.exec(modifier);
        assert(match !== null && !mods.has(match[2]!), `Unsupported Rust native library modifier: ${spec}`);
        mods.set(match[2]!, match[1] === "+");
      }
      assert(
        kind === "static" ? !mods.has("as-needed") : !mods.has("bundle") && !mods.has("whole-archive"),
        `Invalid Rust native library modifiers: ${spec}`,
      );
      if (kind === "static" && (mods.get("bundle") ?? true)) {
        // Whole-archive metadata would require selecting individual bundled members from an rlib.
        assert(!mods.get("whole-archive"), `Bundled whole-archive requires rustc final linking: ${spec}`);
        continue;
      }
      const scoped = kind === "static" || mods.has("as-needed");
      if (scoped) args.push("-Wl,--push-state");
      if (kind === "static") {
        args.push("-Wl,-Bstatic");
        if (mods.get("whole-archive")) args.push("-Wl,--whole-archive");
      } else if (mods.has("as-needed")) {
        args.push(mods.get("as-needed") ? "-Wl,--as-needed" : "-Wl,--no-as-needed");
      }
      args.push(`-l${mods.get("verbatim") ? ":" : ""}${name}`);
      if (scoped) args.push("-Wl,--pop-state");
    }
  }
  return args;
}

/** Return a generated clang response file, or nothing for the unchanged non-Linux build graphs. */
export function emitRustNativeLink(n: Ninja, cfg: Config, graph: RustGraph): string | undefined {
  if (!cfg.linux) return undefined;
  // linkedRlibs excludes proc-macros and their host-only transitive dependencies, including on native builds.
  const scripts = new Map<string, { output: string; cwd: string }>();
  for (const unit of linkedRlibs(graph)) {
    if (unit.buildScript) {
      scripts.set(unit.buildScript.output, { output: unit.buildScript.output, cwd: dirname(unit.pkg.manifest_path) });
    }
  }
  if (scripts.size === 0) return undefined;
  const script = import.meta.filename;
  const manifest = resolve(graph.dir, "native-link.json");
  const response = resolve(graph.dir, "native-link.rsp");
  writeIfChanged(manifest, JSON.stringify([...scripts.values()], null, 2) + "\n");
  const hostWindows = cfg.host.os === "windows";
  n.rule("rust_native_link", {
    command: `${quote(cfg.bun, hostWindows)} ${quote(script, hostWindows)} $manifest $out`,
    description: "Rust native link inputs $out",
    restat: true,
  });
  n.build({
    outputs: [response],
    rule: "rust_native_link",
    inputs: [...scripts.keys()],
    implicitInputs: [manifest, script, resolve(import.meta.dir, "../fs.ts"), resolve(import.meta.dir, "../error.ts")],
    vars: { manifest: quote(manifest, hostWindows) },
  });
  return response;
}

if (import.meta.main) {
  try {
    const [manifest, response] = process.argv.slice(2);
    assert(manifest !== undefined && response !== undefined, "native-link.ts requires a manifest and response path");
    const scripts = JSON.parse(readFileSync(manifest, "utf8")) as { output: string; cwd: string }[];
    const outputs = scripts.map(({ output, cwd }) => ({
      ...(JSON.parse(readFileSync(output, "utf8")) as BuildScriptOutput),
      cwd,
    }));
    writeIfChanged(response, nativeLinkResponse(nativeLinkArguments(outputs)));
  } catch (error) {
    process.stderr.write(error instanceof BuildError ? error.format() : `${error}\n`);
    process.exitCode = 1;
  }
}
