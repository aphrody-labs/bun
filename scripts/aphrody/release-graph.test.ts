import { expect, test } from "bun:test";
import { BunPython } from "bun:graph";
import { tempDir } from "../../test/harness";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { indexDetachedRelease } from "./release-graph";

test("an exported release graph keeps its revision when the ancestor checkout advances", async () => {
  using parent = tempDir("release-graph-parent", { "source.ts": "export const value = 1;\n" });
  const root = String(parent);
  const git = async (...args: string[]) => {
    const child = Bun.spawn(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
    const [output, error, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0) throw new Error(error);
    return output.trim();
  };
  await git("init");
  await git("add", "source.ts");
  await git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture");
  const revision = await git("rev-parse", "HEAD");
  const snapshot = join(root, "build", "source");
  await Bun.write(join(snapshot, "src", "build", "owner.ts"), "export function answer() { return 42; }\n");
  await git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "--allow-empty",
    "-m",
    "advanced",
  );
  expect(await git("rev-parse", "HEAD")).not.toBe(revision);
  using registry = new BunPython(join(root, "registry.sqlite"));
  const ceiling = process.env.GIT_CEILING_DIRECTORIES;
  const result = await indexDetachedRelease(registry, snapshot, revision, root);
  expect(result.revision).toBe(revision);
  expect(result.domains.map(domain => domain.domain)).toEqual(["src/build"]);
  expect(result.domains[0].coverage.nativeFiles).toBe(1);
  expect(process.env.GIT_CEILING_DIRECTORIES).toBe(ceiling);
  mkdirSync(join(snapshot, ".git"));
  await expect(indexDetachedRelease(registry, snapshot, revision, root)).rejects.toThrow("detached");
  expect(process.env.GIT_CEILING_DIRECTORIES).toBe(ceiling);
});
