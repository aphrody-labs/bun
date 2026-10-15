import { expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "../../test/harness";
import { computeSourceIdentity } from "../build/fetch-cli";
import { verifyZlibSDKSource } from "./native-sdk-factory";

const commit = "12731092979c6d07f42da27da673a9f6c7b13586";
const blob = (body: string) =>
  new Bun.CryptoHasher("sha1")
    .update(`blob ${Buffer.byteLength(body)}\0`)
    .update(body)
    .digest("hex");

async function fixture(base: string) {
  const pristine = { "LICENSE.md": "zlib notice\n", "arch/header.h": "#define OLD 1\n" };
  const patch = "--- a/arch/header.h\n+++ b/arch/header.h\n@@ -1 +1 @@\n-#define OLD 1\n+#define NEW 1\n";
  const source = join(base, "source"),
    archive = join(base, "source.tar.gz"),
    patchPath = join(base, "source.patch");
  await mkdir(join(source, "arch"), { recursive: true });
  await Bun.write(join(source, "LICENSE.md"), pristine["LICENSE.md"]);
  await Bun.write(join(source, "arch/header.h"), "#define NEW 1\n");
  await Bun.write(patchPath, patch);
  await Bun.write(join(source, ".ref"), computeSourceIdentity(commit, [patch]) + "\n");
  await Bun.write(
    archive,
    await new Bun.Archive(
      Object.fromEntries(Object.entries(pristine).map(([path, body]) => [`zlib-ng-${commit}/${path}`, body])),
      { compress: "gzip", mtime: 0 },
    ).blob(),
  );
  const tree = {
    sha: commit,
    truncated: false,
    tree: [
      {
        path: ".gitattributes",
        mode: "100644",
        type: "blob",
        sha: "38fd673cc9e488e364d27a71102599fcc237bbc4",
        size: 288,
      },
      ...Object.entries(pristine).map(([path, body]) => ({
        path,
        mode: "100644",
        type: "blob",
        sha: blob(body),
        size: Buffer.byteLength(body),
      })),
    ],
  };
  return {
    input: {
      source,
      archive,
      repository: "zlib-ng/zlib-ng",
      commit,
      patches: [patchPath],
      fixture: join(base, "patch-fixture"),
    },
    tree,
  };
}

test("zlib provenance authenticates cached Git blobs and only materializes the patch targets", async () => {
  using directory = tempDir("zlib-sdk-authenticated-source", {});
  const value = await fixture(String(directory));
  let calls = 0;
  const receipt = await verifyZlibSDKSource(value.input, {
    tree: async url => {
      expect(url).toBe(`https://api.github.com/repos/zlib-ng/zlib-ng/git/trees/${commit}?recursive=1`);
      return value.tree;
    },
    patch: (path, file, body) => {
      calls++;
      expect(file).toBe(value.input.patches[0]!);
      expect(body).toContain("+#define NEW 1");
      expect(Bun.file(join(path, "LICENSE.md")).size).toBe(0);
      writeFileSync(join(path, "arch/header.h"), "#define NEW 1\n");
    },
  });
  expect(calls).toBe(1);
  expect(receipt.sourceClean).toBe(true);
  expect(receipt.archiveSHA256).toMatch(/^[a-f0-9]{64}$/);
  expect(receipt.sourceTreeSHA256).toMatch(/^[a-f0-9]{64}$/);
  expect(receipt.patches).toHaveLength(1);
  expect(receipt.exportPolicy.excludedMembers).toEqual([".gitattributes"]);
  expect(await Bun.file(join(value.input.source, "arch/header.h")).text()).toBe("#define NEW 1\n");
});

test("zlib archive membership honors only the authenticated pinned export policy", async () => {
  for (const mutation of ["policy", "omitted-source", "exported-metadata", "valid"] as const) {
    using directory = tempDir("zlib-sdk-export-policy", {});
    const value = await fixture(String(directory));
    for (const path of [".github/workflows/build.yml", ".gitignore", "arch/.gitignore"])
      value.tree.tree.push({ path, mode: "100644", type: "blob", sha: blob("metadata\n"), size: 9 });
    if (mutation === "policy") value.tree.tree[0]!.sha = "b".repeat(40);
    if (mutation === "omitted-source")
      value.tree.tree.push({ path: "missing.c", mode: "100644", type: "blob", sha: blob("source\n"), size: 7 });
    if (mutation === "exported-metadata")
      await Bun.write(
        value.input.archive,
        await new Bun.Archive({
          [`zlib-ng-${commit}/LICENSE.md`]: "zlib notice\n",
          [`zlib-ng-${commit}/arch/header.h`]: "#define OLD 1\n",
          [`zlib-ng-${commit}/.gitignore`]: "metadata\n",
        }).blob(),
      );
    const result = verifyZlibSDKSource(value.input, {
      tree: async () => value.tree,
      patch: path => writeFileSync(join(path, "arch/header.h"), "#define NEW 1\n"),
    });
    if (mutation === "valid") {
      const receipt = await result;
      expect(receipt.exportPolicy).toEqual({
        attributesGitBlob: "38fd673cc9e488e364d27a71102599fcc237bbc4",
        excludedMembers: [".gitattributes", ".github/workflows/build.yml", ".gitignore", "arch/.gitignore"],
      });
    } else
      await expect(result).rejects.toThrow(
        mutation === "policy" ? "export policy differs" : "missing or unexpected members",
      );
  }
});

test("a correct source stamp cannot conceal modified bytes, extra files or a forged cache archive", async () => {
  for (const mutation of ["source", "extra", "archive", "inventory", "commit"] as const) {
    using directory = tempDir("zlib-sdk-reject-mutation", {});
    const value = await fixture(String(directory));
    if (mutation === "source") await writeFile(join(value.input.source, "LICENSE.md"), "changed notice\n");
    if (mutation === "extra") await writeFile(join(value.input.source, "extra.c"), "unreviewed\n");
    if (mutation === "archive")
      await Bun.write(
        value.input.archive,
        await new Bun.Archive({
          [`zlib-ng-${commit}/LICENSE.md`]: "evil notice\n",
          [`zlib-ng-${commit}/arch/header.h`]: "#define OLD 1\n",
        }).blob(),
      );
    if (mutation === "inventory") value.tree.truncated = true;
    if (mutation === "commit") value.tree.sha = "b".repeat(40);
    const errors = {
      source: "changes outside its pinned patches",
      extra: "missing or unexpected files",
      archive: "authenticated Git blob",
      inventory: "inventory is incomplete",
      commit: "inventory is incomplete",
    };
    await expect(
      verifyZlibSDKSource(value.input, {
        tree: async () => value.tree,
        patch: path => writeFileSync(join(path, "arch/header.h"), "#define NEW 1\n"),
      }),
    ).rejects.toThrow(errors[mutation]);
  }
});

test("Windows zlib consumer compiles and executes through the canonical MSVC environment", async () => {
  const { zlibConsumerCommands } = await import("./native-sdk-factory");
  for (const arch of ["x64", "aarch64"] as const) {
    const commands = zlibConsumerCommands({
      windows: true,
      arch,
      cc: "clang-cl",
      flags: ["/O2"],
      includes: ["C:/SDK/include"],
      libraries: ["C:/SDK/zlib.lib"],
      consumer: "C:/job/consumer.c",
      executable: "C:/job/consumer.exe",
    });
    const owner = [process.execPath, "msvc", "exec", "--arch", arch === "aarch64" ? "arm64" : "x64", "--"];
    expect(commands.compile.slice(0, owner.length)).toEqual(owner);
    expect(commands.compile).toContain("/IC:/SDK/include");
    expect(commands.compile).toContain("C:/SDK/zlib.lib");
    expect(commands.compile).toContain("/Fe:C:/job/consumer.exe");
    expect(commands.execute).toEqual([...owner, "C:/job/consumer.exe"]);
    expect(commands.compile).not.toContain("-fuse-ld=lld");
  }
});
