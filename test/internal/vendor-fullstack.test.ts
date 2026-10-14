import { expect, test } from "bun:test";
import { tempDir } from "harness";
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { FULLSTACK_SOURCES, gitBlob, validateSourcePath, verifySource } from "../../scripts/aphrody/vendor-fullstack";

test("source paths reject traversal and platform-specific escapes", () => {
  for (const path of [".GIT/config", "src/CON.rs", "src/nul", "src/file.rs.", "src/file.rs ", "src/LPT1.rs"])
    expect(() => validateSourcePath(path)).toThrow();
  for (const path of ["../x", "/x", "C:/x", "a/x:stream", "a\\x", "a/../x", ".git/config", "a//x", "a/./x", "a\0x"])
    expect(() => validateSourcePath(path)).toThrow();
  expect(() => validateSourcePath("axum/src/lib.rs")).not.toThrow();
});

test("source verification rejects changed, missing and additional blobs", async () => {
  const source = FULLSTACK_SOURCES[0];
  const bytes = new TextEncoder().encode("original\n");
  using dir = tempDir("fullstack-source", {
    "vendor/axum/src/lib.rs": bytes,
    "docs/project/axum-source.json": JSON.stringify({
      schema: "bun.fullstack-source/1",
      fork: source.fork,
      revision: source.revision,
      files: [
        {
          path: "src/lib.rs",
          mode: "100644",
          blob: gitBlob(bytes),
          size: bytes.length,
          sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
        },
      ],
    }),
  });
  expect(await verifySource(source, String(dir))).toEqual({ name: "axum", revision: source.revision, files: 1 });
  using linked = tempDir("fullstack-parent-link", {
    "outside/src/lib.rs": bytes,
    "docs/project/axum-source.json": await Bun.file(join(String(dir), "docs/project/axum-source.json")).text(),
    "vendor/marker": "",
  });
  symlinkSync(join(String(linked), "outside"), join(String(linked), "vendor/axum"), "junction");
  await expect(verifySource(source, String(linked))).rejects.toThrow("Unsafe source ancestor");
  await Bun.write(join(String(dir), "vendor/axum/src/lib.rs"), "tampered\n");
  await expect(verifySource(source, String(dir))).rejects.toThrow("source drift");
  await Bun.write(join(String(dir), "vendor/axum/src/lib.rs"), bytes);
  await Bun.write(join(String(dir), "vendor/axum/extra.rs"), "");
  await expect(verifySource(source, String(dir))).rejects.toThrow("Untracked source file");
  await Bun.file(join(String(dir), "vendor/axum/extra.rs")).delete();
  await Bun.file(join(String(dir), "vendor/axum/src/lib.rs")).delete();
  await expect(verifySource(source, String(dir))).rejects.toThrow();
});
