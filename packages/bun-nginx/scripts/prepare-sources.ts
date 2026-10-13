import { isAbsolute, resolve } from "node:path";
import { stat } from "node:fs/promises";
import { verifySources } from "./verify-sources";

const repository = resolve(import.meta.dir, "../../..");
/** Explicit source acquisition contract; existing revisions/edits are never reset. */
export async function prepareSources(root = repository) {
  const pins = await Bun.file(resolve(root, "packages/bun-nginx/native/sources.json")).json();
  async function git(args: string[]) {
    await using child = Bun.spawn(["git", ...args], {
      cwd: root,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: 5 * 60_000,
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      Bun.readableStreamToText(child.stdout),
      Bun.readableStreamToText(child.stderr),
      child.exited,
    ]);
    if (exitCode) throw new Error(stderr || "Canonical NGINX source acquisition failed");
    return stdout.trim();
  }
  for (const pin of [pins.nginx, pins.ngxRust]) {
    if (isAbsolute(pin.path) || pin.path.includes(".."))
      throw new Error("The source pin must select a canonical relative vendor path");
    const path = resolve(root, pin.path);
    const exists = await stat(path).then(
      () => true,
      () => false,
    );
    if (exists) {
      if ((await git(["-C", path, "rev-parse", "HEAD"])) !== pin.revision)
        throw new Error(`Existing ${pin.path} differs from its expected owner revision`);
      continue;
    }
    await git(["-c", "core.autocrlf=false", "clone", "--depth", "1", "--no-checkout", pin.repository, path]);
    await git(["-C", path, "config", "core.autocrlf", "false"]);
    if ((await git(["-C", path, "rev-parse", "HEAD"])) !== pin.revision)
      await git(["-C", path, "fetch", "--depth", "1", "origin", pin.revision]);
    await git(["-C", path, "checkout", "--detach", pin.revision]);
  }
  return verifySources(root);
}
if (import.meta.main) {
  const result = await prepareSources();
  console.log(
    JSON.stringify({
      sources: result.records.map(source => ({
        repository: source.repository,
        revision: source.revision,
        tree: source.tree,
        files: source.files.length,
        licenseSha256: source.licenseSha256,
      })),
      nativeModuleQualified: false,
    }),
  );
}
