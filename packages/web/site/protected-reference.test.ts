import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { protectedReference } from "./protected-reference";

test("protected references reject unsafe shapes without returning contents in errors", async () => {
  const directory = mkdtempSync(join(tmpdir(), "bun-editorial-reference-"));
  try {
    const path = join(directory, "reference");
    await Bun.write(path, "fixture-value\n");
    expect(await protectedReference(path)).toBe("fixture-value");
    await expect(protectedReference("relative")).rejects.toThrow("explicit protected file reference");
    await expect(protectedReference(directory)).rejects.toThrow("Invalid protected file reference");
    for (const invalid of ["", " ", "fixture-value\nsecond-line", "fixture-value\0", "x".repeat(4097)]) {
      await Bun.write(path, invalid);
      await expect(protectedReference(path)).rejects.toThrow("Invalid protected file reference");
    }
  } finally {
    rmSync(directory, { recursive: true });
  }
});
