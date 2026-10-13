import { join, resolve } from "node:path";
import { hashSDKFile } from "../../bun-video/src/sdk";

const root = resolve(import.meta.dir, "../../..");
const pins = await Bun.file(join(root, "packages/bun-nginx/native/sources.json")).json();
async function git(path: string, args: string[]) {
  await using child = Bun.spawn(["git", "-C", path, ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    Bun.readableStreamToText(child.stdout),
    Bun.readableStreamToText(child.stderr),
    child.exited,
  ]);
  if (exitCode) throw new Error(stderr || "NGINX source owner Git probe failed");
  return stdout;
}
export async function verifySources(repositoryRoot = root) {
  const records = [];
  for (const pin of [pins.nginx, pins.ngxRust]) {
    const source = resolve(repositoryRoot, pin.path);
    if ((await git(source, ["rev-parse", "HEAD"])).trim() !== pin.revision)
      throw new Error(`NGINX source revision mismatch: ${pin.path}`);
    if ((await git(source, ["status", "--porcelain", "--untracked-files=no"])).trim())
      throw new Error(`NGINX source has tracked edits: ${pin.path}`);
    const tree = (await git(source, ["rev-parse", "HEAD^{tree}"])).trim();
    const names = (await git(source, ["ls-files", "-z"])).split("\0").filter(Boolean).sort();
    const files = [];
    for (const name of names) {
      // The disabled optional nginx-src submodule is a Git link, not another source owner.
      if (name === "nginx-src/nginx" && pin === pins.ngxRust) continue;
      const file = Bun.file(join(source, name));
      if (!(await file.exists())) throw new Error(`Canonical NGINX source file is missing: ${name}`);
      files.push({ name, bytes: file.size, sha256: await hashSDKFile(join(source, name)) });
    }
    const inventorySha256 = new Bun.CryptoHasher("sha256").update(JSON.stringify(files)).digest("hex");
    records.push({
      ...pin,
      path: source,
      tree,
      files,
      inventorySha256,
      licenseSha256: await hashSDKFile(join(repositoryRoot, pin.licensePath)),
    });
  }
  return { schema: 1, kind: "bun-nginx-source-inventory", records, nativeModuleQualified: false };
}
if (import.meta.main) {
  const output = process.argv[2];
  if (!output) throw new Error("Usage: bun verify-sources.ts <receipt.json>");
  const result = await verifySources();
  await Bun.write(output, JSON.stringify(result, null, 2) + "\n");
  console.log(
    JSON.stringify({
      receipt: resolve(output),
      sources: result.records.map(source => ({
        repository: source.repository,
        revision: source.revision,
        tree: source.tree,
        files: source.files.length,
        inventorySha256: source.inventorySha256,
        licenseSha256: source.licenseSha256,
      })),
      nativeModuleQualified: false,
    }),
  );
}
