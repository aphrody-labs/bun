import { expect, test } from "bun:test";
import { bunEnv, bunExe } from "harness";
import invariant from "tiny-invariant";

test("tiny-invariant resolves to the built-in module", () => {
  expect(require.resolve("tiny-invariant")).toBe("tiny-invariant");
  expect(require("tiny-invariant")).toBe(invariant);
});

test("tiny-invariant messages", () => {
  expect(() => invariant(true, "never")).not.toThrow();
  expect(() => invariant(false)).toThrow(new Error("Invariant failed"));
  expect(() => invariant(0, "boom")).toThrow(new Error("Invariant failed: boom"));
  expect(() => invariant(null, () => "lazy")).toThrow(new Error("Invariant failed: lazy"));
});

test("tiny-invariant hides messages in production", async () => {
  await using proc = Bun.spawn({
    cmd: [bunExe(), "-e", `try { require("tiny-invariant")(false, "secret") } catch (e) { console.log(e.message) }`],
    env: { ...bunEnv, NODE_ENV: "production" },
    stdout: "pipe",
  });
  const [stdout, exitCode] = await Promise.all([proc.stdout.text(), proc.exited]);
  expect(stdout).toBe("Invariant failed\n");
  expect(exitCode).toBe(0);
});
