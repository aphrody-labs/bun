import { expect, test } from "bun:test";
import dotenv, { parse, populate } from "dotenv";
import { bunEnv, bunExe, tempDir } from "harness";
import { join } from "node:path";

test("dotenv resolves to the built-in module", () => {
  expect(require.resolve("dotenv")).toBe("dotenv");
  expect(require.resolve("dotenv/config")).toBe("dotenv/config");
  expect(typeof dotenv.config).toBe("function");
});

test("dotenv.parse matches the npm grammar", () => {
  expect(parse("A=1\nexport B = two \nC=\"multi\\nline\"\nD=val # c\nE='s q'")).toEqual({
    A: "1",
    B: "two",
    C: "multi\nline",
    D: "val",
    E: "s q",
  });
  expect(parse(Buffer.from("X=1\r\nY: colon\r\n#Z=no"))).toEqual({ X: "1", Y: "colon" });
});

test("dotenv.populate keeps existing keys unless override", () => {
  const env: Record<string, string> = { A: "keep" };
  expect(populate(env, { A: "x", B: "y" })).toEqual({ B: "y" });
  expect(env).toEqual({ A: "keep", B: "y" });
  expect(populate(env, { A: "x" }, { override: true })).toEqual({ A: "x" });
  expect(env.A).toBe("x");
});

test("dotenv.config reads several files, first file wins", () => {
  using dir = tempDir("dotenv-config", { "one.env": "X=1\nY=one", "two.env": "Y=two\nZ=3" });
  const processEnv: Record<string, string> = { Z: "pre" };
  const result = dotenv.config({ path: [join(String(dir), "one.env"), join(String(dir), "two.env")], processEnv });
  expect(result).toEqual({ parsed: { X: "1", Y: "one", Z: "3" } });
  expect(processEnv).toEqual({ X: "1", Y: "one", Z: "pre" });
  const missing = dotenv.config({ path: join(String(dir), "missing.env"), processEnv: {} });
  expect(missing.parsed).toEqual({});
  expect(missing.error).toBeInstanceOf(Error);
});

test("dotenv/config honours DOTENV_CONFIG_PATH", async () => {
  using dir = tempDir("dotenv-config-env", {
    "custom.env": "FROM_CUSTOM=yes",
    "index.js": `require("dotenv/config"); console.log(process.env.FROM_CUSTOM);`,
  });
  await using proc = Bun.spawn({
    cmd: [bunExe(), "index.js"],
    env: { ...bunEnv, DOTENV_CONFIG_PATH: join(String(dir), "custom.env") },
    cwd: String(dir),
    stdout: "pipe",
  });
  const [stdout, exitCode] = await Promise.all([proc.stdout.text(), proc.exited]);
  expect(stdout).toBe("yes\n");
  expect(exitCode).toBe(0);
});
