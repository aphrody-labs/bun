import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { distributeLlmText, readDistributedLlmText } from "./release-knowledge";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "bun-release-llm-"));
  mkdirSync(join(root, "site"));
  writeFileSync(join(root, "site/llms-full.txt"), "Original\n");
  return {
    root,
    [Symbol.dispose]: () => {
      const target = resolve(root),
        child = relative(resolve(tmpdir()), target);
      if (
        child.startsWith("..") ||
        child.includes("/") ||
        child.includes("\\") ||
        !basename(target).startsWith("bun-release-llm-")
      )
        throw new Error("Unexpected fixture cleanup path");
      rmSync(target, { recursive: true, force: true });
    },
  };
}

test("ordered bounded LLM assets reconstruct every UTF-8 byte and source hash", () => {
  using directory = fixture();
  const text = "\ufeffBun 🐇 日本語 é\r\n".repeat(17);
  const result = distributeLlmText(directory.root, "immutable-source", text, "https://bun.aphrody.app", 31);
  expect(result.manifest!.parts.length).toBeGreaterThan(2);
  expect(result.manifest!.trainingQualified).toBe(false);
  const payload = Buffer.concat(
    result.manifest!.parts.map(part => {
      const bytes = readFileSync(join(directory.root, "site", part.path));
      expect(bytes.length).toBeLessThanOrEqual(31);
      expect(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)).toBeTruthy();
      return bytes;
    }),
  );
  expect(payload).toEqual(Buffer.from(text));
  expect(new Bun.CryptoHasher("sha256").update(payload).digest("hex")).toBe(result.sha256);
  expect(readDistributedLlmText(directory.root, "immutable-source")).toBe(text);
  expect(readFileSync(join(directory.root, "site/llms-full.txt"), "utf8")).toContain(
    "not a complete source or training dataset",
  );
  const again = distributeLlmText(directory.root, "immutable-source", text, "https://bun.aphrody.app", 31);
  expect(again.manifest).toEqual(result.manifest);
});

test("small LLM text remains inline and a verified shrink removes former managed parts", () => {
  using directory = fixture();
  const large = distributeLlmText(directory.root, "fixture", "🐇".repeat(100), "https://bun.aphrody.app", 41);
  const result = distributeLlmText(directory.root, "fixture", "Small\n", "https://bun.aphrody.app", 41);
  expect(result.manifest).toBeNull();
  expect(readDistributedLlmText(directory.root, "fixture")).toBe("Small\n");
  expect(() => readFileSync(join(directory.root, "site", large.manifest!.parts[0]!.path))).toThrow();
  expect(() => readFileSync(join(directory.root, "site/knowledge/llms/manifest.json"))).toThrow();
});

test("manifest path, source and payload corruption are rejected before replacing text", () => {
  using directory = fixture();
  const result = distributeLlmText(
    directory.root,
    "fixture",
    "Source bytes\n".repeat(12),
    "https://bun.aphrody.app",
    40,
  );
  const index = readFileSync(join(directory.root, "site/llms-full.txt"));
  expect(() => distributeLlmText(directory.root, "another-source", "replacement")).toThrow("manifest");
  const manifestPath = join(directory.root, "site/knowledge/llms/manifest.json");
  const manifest = result.manifest!;
  writeFileSync(
    manifestPath,
    JSON.stringify({
      ...manifest,
      parts: [{ ...manifest.parts[0], path: "../../outside.txt" }, ...manifest.parts.slice(1)],
    }),
  );
  expect(() => distributeLlmText(directory.root, "fixture", "replacement")).toThrow("part");
  expect(readFileSync(join(directory.root, "site/llms-full.txt"))).toEqual(index);
  writeFileSync(manifestPath, JSON.stringify(manifest));
  writeFileSync(join(directory.root, "site", manifest.parts[0]!.path), "Corrupted");
  expect(() => readDistributedLlmText(directory.root, "fixture")).toThrow("differs");
  expect(() => distributeLlmText(directory.root, "fixture", "replacement")).toThrow("differs");
  expect(readFileSync(join(directory.root, "site/llms-full.txt"))).toEqual(index);
});

test("part count and invalid UTF-16 fail without overwriting the inline output", () => {
  using directory = fixture();
  expect(() => distributeLlmText(directory.root, "fixture", "a".repeat(1025), "https://bun.aphrody.app", 4)).toThrow(
    "too many",
  );
  expect(() => distributeLlmText(directory.root, "fixture", "\ud800")).toThrow("losslessly");
  expect(readDistributedLlmText(directory.root, "fixture")).toBe("Original\n");
});
