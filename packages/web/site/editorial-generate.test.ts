import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EDITORIAL_TOPICS, generateEditorial } from "./editorial-generate";

test("editorial generation rejects invalid output and provenance before loading protected references", async () => {
  await expect(generateEditorial(["--out", "relative"])).rejects.toThrow("new absolute");
  await expect(generateEditorial(["--out", tmpdir()])).rejects.toThrow("new absolute");
  const path = join(tmpdir(), "editorial-not-created-" + crypto.randomUUID());
  await expect(generateEditorial(["--out", path, "--source", "main", "--snapshot", "latest"])).rejects.toThrow(
    "immutable editorial",
  );
  expect(existsSync(path)).toBe(false);
  expect(EDITORIAL_TOPICS).toHaveLength(4);
  expect(new Set(EDITORIAL_TOPICS.map(topic => topic.slug)).size).toBe(4);
});
