import { expect, test } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { withoutMissingRustWrappers } from "../../../scripts/build/rust/environment.ts";

test("native build children omit a missing wrapper without changing the owner environment", () => {
  const missing = join(tmpdir(), `missing-rust-wrapper-${crypto.randomUUID()}.exe`);
  const owner = { ...process.env, RUSTC_WRAPPER: missing, CARGO_BUILD_RUSTC_WRAPPER: missing };
  const child = Bun.spawnSync([process.execPath, "-e", "console.log(process.env.RUSTC_WRAPPER ?? 'absent')"], {
    env: withoutMissingRustWrappers(owner),
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(new TextDecoder().decode(child.stdout).trim()).toBe("absent");
  expect(child.exitCode).toBe(0);
  expect(withoutMissingRustWrappers(owner).CARGO_BUILD_RUSTC_WRAPPER).toBeUndefined();
  expect(owner.RUSTC_WRAPPER).toBe(missing);
});

test("existing wrapper executables and unrelated variables remain available", () => {
  const env = withoutMissingRustWrappers({ RUSTC_WRAPPER: process.execPath, CUSTOM_BUILD_VALUE: "retained" });
  expect(env.RUSTC_WRAPPER).toBe(process.execPath);
  expect(env.CUSTOM_BUILD_VALUE).toBe("retained");
});
