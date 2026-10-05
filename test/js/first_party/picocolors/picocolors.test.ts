import { expect, test } from "bun:test";
import pc, { createColors, red } from "picocolors";

test("picocolors resolves to the built-in module", () => {
  expect(require.resolve("picocolors")).toBe("picocolors");
  expect(typeof red).toBe("function");
  expect(typeof pc.isColorSupported).toBe("boolean");
});

test("picocolors nests closing sequences like the npm package", () => {
  const c = createColors(true);
  expect(c.red(c.bold("a") + "b")).toBe("\x1b[31m\x1b[1ma\x1b[22mb\x1b[39m");
  expect(c.bold("x" + c.dim("y") + "z")).toBe("\x1b[1mx\x1b[2my\x1b[22m\x1b[1mz\x1b[22m");
  expect(c.bgBlueBright(42)).toBe("\x1b[104m42\x1b[49m");
});

test("picocolors without colors returns plain strings", () => {
  const c = createColors(false);
  expect(c.isColorSupported).toBe(false);
  expect(c.red("a")).toBe("a");
  expect(c.bold(undefined)).toBe("undefined");
});
