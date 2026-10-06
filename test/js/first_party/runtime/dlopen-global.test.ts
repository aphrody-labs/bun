// Aphrody fork: bun:ffi dlopen(path, symbols, { global: true }) opens with RTLD_NOW | RTLD_GLOBAL, so a library
// opened later resolves its undefined symbols against it (one shared libpython for Bun and PyO3 extensions).
import { dlopen } from "bun:ffi";
import { describe, expect, test } from "bun:test";
import { tempDir } from "harness";
import { join } from "node:path";

const cc = Bun.which("cc") ?? Bun.which("gcc") ?? Bun.which("clang");

describe.skipIf(process.platform !== "linux" || !cc)("bun:ffi dlopen global option", () => {
  function build() {
    const dir = tempDir("ffi-global", {
      "a.c": "int aphrody_shared_value(void) { return 42; }\n",
      "b.c": "extern int aphrody_shared_value(void);\nint aphrody_via_global(void) { return aphrody_shared_value() + 1; }\n",
    });
    const a = join(String(dir), "liba.so");
    const b = join(String(dir), "libb.so");
    const run = (args: string[]) => {
      const r = Bun.spawnSync([cc!, ...args]);
      if (r.exitCode !== 0) throw new Error(r.stderr.toString());
    };
    run(["-shared", "-fPIC", "-o", a, join(String(dir), "a.c")]);
    // BIND_NOW: an unresolved symbol makes dlopen fail instead of failing at the first call.
    run(["-shared", "-fPIC", "-Wl,-z,now", "-o", b, join(String(dir), "b.c")]);
    return { dir, a, b };
  }

  test("a library opened without the option is not visible to the next one", () => {
    const { dir, a, b } = build();
    using _dir = dir;
    const lib = dlopen(a, { aphrody_shared_value: { args: [], returns: "i32" } });
    try {
      expect(lib.symbols.aphrody_shared_value()).toBe(42);
      expect(() => dlopen(b, { aphrody_via_global: { args: [], returns: "i32" } })).toThrow(/undefined symbol|Failed to open/);
    } finally {
      lib.close();
    }
  });

  test("{ global: true } makes its symbols resolvable by a library opened afterwards", () => {
    const { dir, a, b } = build();
    using _dir = dir;
    const lib = dlopen(a, { aphrody_shared_value: { args: [], returns: "i32" } }, { global: true });
    const dependent = dlopen(b, { aphrody_via_global: { args: [], returns: "i32" } });
    try {
      expect(dependent.symbols.aphrody_via_global()).toBe(43);
    } finally {
      dependent.close();
      lib.close();
    }
  });
});
