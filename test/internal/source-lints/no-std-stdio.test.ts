import { Glob } from "bun";
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isInLinkedCrate } from "./crates.ts";

// A release build of Bun has no symbol of `std::io::stdio`. The first use of `println!`, `eprintln!`, `dbg!`,
// `std::io::stdout()`, `std::io::stderr()` or `std::process::exit` (which flushes stdout) brings in the output capture
// that the default panic hook of the standard library shares. The hook is then no longer inlined, its backtrace
// printer stays, and that imports `_Unwind_Backtrace` from libgcc_s.so.1. musl and FreeBSD link libgcc_s only if it is
// needed, so `verify-binary` fails there, far from the line that caused it.
//
// Print with `bun_core::Output`, or `bun_sys::File::stdout().write_all(..)` where that is not set up. End the process
// with `bun_core::Global::exit` or `std::process::abort`.
test("Rust sources linked into Bun do not use the streams of the standard library", async () => {
  const repoRoot = path.resolve(import.meta.dir, "..", "..", "..");
  const banned =
    /(?:(?<![\w:!])|(?<=\bstd::))(?:e?println!|e?print!|dbg!)\s*\(|\bstd::io::(?:stdout|stderr)\s*\(|\bstd::process::exit\s*\(/;

  // Not compiled into a release build: tests, debug output, Windows debug macros, and the message of the allocator.
  const known = new Map([
    // Readiness output lives only in archive.rs #[cfg(test)] mod tests.
    ["src/browser/crates/crawl/src/archive.rs", 2],
    ["src/bun_alloc/lib.rs", 1],
    ["src/bun_core/Global.rs", 1],
    ["src/libuv_sys/libuv.rs", 1],
    // The uutils applets buffer in the stdout of the standard library, which only it can flush.
    ["src/coreutils/lib.rs", 3],
    ["src/react_compiler/pipeline.rs", 4],
    ["src/router/lib.rs", 4],
    // dbg! under cfg(test) and the ZLIB_DEBUG trace macros: neither is compiled into a release build.
    ["src/zlib_rs/src/inflate.rs", 3],
    ["src/zlib_rs/src/lib.rs", 2],
  ]);
  // Imported before this rule applied to them: a ratchet that only goes down. Convert to `bun_core::Output`.
  const pending = new Map<string, number>([
    ["src/browser/crates/dom/src/serialize.rs", 1],
    ["src/browser/crates/dom/src/tree.rs", 6],
    ["src/browser/crates/extract/src/extract.rs", 1],
    ["src/host/environment.rs", 1],
    ["src/migrate/bin/n2b.rs", 1],
    ["src/migrate/cli/analyze.rs", 6],
    ["src/migrate/cli/app_cmd.rs", 11],
    ["src/migrate/cli/bin_cmd.rs", 3],
    ["src/migrate/cli/bunpp_cmd.rs", 21],
    ["src/migrate/cli/commands/audit.rs", 2],
    ["src/migrate/cli/commands/migrate.rs", 1],
    ["src/migrate/cli/commands/prompt.rs", 1],
    ["src/migrate/cli/commands/rules.rs", 4],
    ["src/migrate/cli/commands/scan.rs", 3],
    ["src/migrate/cli/commands/wasm_spec/codegen.rs", 10],
    ["src/migrate/cli/commands/wasm_spec/mod.rs", 13],
    ["src/migrate/cli/commands/wasm_spec/validator.rs", 3],
    ["src/migrate/cli/commands/web.rs", 4],
    ["src/migrate/cli/linux_cmd.rs", 5],
    ["src/migrate/cli/mod.rs", 2],
    ["src/migrate/cli/patch.rs", 11],
    ["src/migrate/cli/rust_cmd.rs", 19],
    ["src/migrate/cli/scaffold_fs.rs", 1],
    ["src/migrate/cli/subprocess/bun.rs", 2],
    ["src/migrate/cli/wasm_cmd.rs", 8],
    ["src/migrate/cli/win32_cmd.rs", 2],
    ["src/migrate/cli/win32_cmd_com.rs", 8],
    ["src/migrate/engine/audit.rs", 2],
    ["src/migrate/engine/llmstxt/mod.rs", 10],
    ["src/migrate/engine/llmstxt/summarize.rs", 2],
    ["src/quality/format_cli/src/cli/init.rs", 1],
    ["src/quality/format_cli/src/cli/walk_runner.rs", 2],
    ["src/quality/linter/src/tester.rs", 3],
    ["src/runtime/cli/toolchain_command.rs", 1],
    ["src/runtime/cli/tools_command.rs", 2],
  ]);
  // Programs of their own; `tests/` and `examples/` hold Cargo targets built as separate binaries.
  const programs = ["src/sema/standalone/"];
  const isLinked = (file: string) =>
    !file.endsWith("/build.rs") &&
    !file.includes("/benches/") &&
    !file.includes("/examples/") &&
    !file.includes("/tests/") &&
    isInLinkedCrate(file) &&
    !programs.some(it => file.startsWith(it));

  const found = new Map<string, number>();
  let scanned = 0;
  for await (const rel of new Glob("**/*.rs").scan({ cwd: path.join(repoRoot, "src") })) {
    const file = path.join("src", rel).replaceAll("\\", "/");
    if (!isLinked(file)) continue;
    scanned++;
    const lines = readFileSync(path.join(repoRoot, file), "utf8").split("\n");
    const count = lines.filter(line => !/^\s*\/\//.test(line) && banned.test(line)).length;
    if (count > 0) found.set(file, count);
  }
  // Guard against repoRoot resolving wrong, which would make the ban pass vacuously.
  expect(scanned).toBeGreaterThan(1000);
  const pendingNow = new Map([...found].filter(([file, n]) => pending.has(file) && n <= pending.get(file)!));
  for (const file of pendingNow.keys()) found.delete(file);
  expect(Object.fromEntries([...found].sort())).toEqual(Object.fromEntries([...known].sort()));
  // Lower an entry when a conversion lands so the ratchet holds.
  expect([...pending].filter(([file, n]) => (pendingNow.get(file) ?? 0) < n).map(([file]) => file)).toEqual([]);
});
