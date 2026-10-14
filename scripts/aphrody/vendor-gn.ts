import { chmod, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

export const GN_REVISION = "3f99f58c2568dd267952dcd80696406474f7e2ea";
export const GN_UPSTREAM_REVISION = "0035961837fbcfe875d855744b3eda4fd2eefb43";
const root = resolve(import.meta.dir, "../..");
const target = resolve(root, "vendor/gn");
const receiptPath = resolve(target, ".bun-vendor.json");
const sha256 = (bytes: Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
async function git(source: string, args: string[]) {
  const proc = Bun.spawn(["git", "-C", source, ...args], { stdout: "pipe", stderr: "pipe" });
  const [bytes, error, code] = await Promise.all([
    new Response(proc.stdout).bytes(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(error);
  return bytes;
}
export async function verifyGN() {
  const receipt = await Bun.file(receiptPath).json();
  if (receipt.schema !== 1 || receipt.revision !== GN_REVISION) throw new Error("GN receipt revision mismatch");
  for (const entry of receipt.files) {
    const parts = entry.path.split("/");
    if (
      isAbsolute(entry.path) ||
      /^[a-z]:/i.test(entry.path) ||
      parts.some((part: string) => !part || part === ".." || part === ".") ||
      entry.path.includes("\\")
    )
      throw new Error("Invalid GN receipt path");
    const bytes = await Bun.file(resolve(target, entry.path)).bytes();
    if (bytes.length !== entry.size || sha256(bytes) !== entry.sha256)
      throw new Error(`GN source drift: ${entry.path}`);
  }
  return { revision: receipt.revision, files: receipt.files.length, position: receipt.position };
}
if (import.meta.main) {
  const sourceArg = Bun.argv.find(arg => arg.startsWith("--source="));
  if (!sourceArg) {
    console.log(JSON.stringify(await verifyGN(), null, 2));
  } else {
    const source = resolve(sourceArg.slice("--source=".length));
    const tree = new TextDecoder().decode(await git(source, ["ls-tree", "-rz", GN_REVISION]));
    const entries = tree
      .split("\0")
      .filter(Boolean)
      .map(line => {
        const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(line);
        if (!match || match[3]!.split("/").some(part => part === ".." || part === ".git"))
          throw new Error(`Unsupported GN entry: ${line}`);
        return { mode: match[1]!, blob: match[2]!, path: match[3]! };
      });
    const archive = await git(source, ["archive", "--format=tar", GN_REVISION]);
    if (archive.length > 100 * 1024 * 1024) throw new Error("GN archive exceeds budget");
    const files = await new Bun.Archive(archive).files();
    const receiptFiles: { path: string; mode: string; blob: string; size: number; sha256: string }[] = [];
    for (const entry of entries) {
      const file = files.get(entry.path);
      if (!file) throw new Error(`Missing archive entry: ${entry.path}`);
      const bytes = await file.bytes();
      const blob = new Bun.CryptoHasher("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
      if (blob !== entry.blob) throw new Error(`GN blob mismatch: ${entry.path}`);
      const output = resolve(target, entry.path);
      if (await Bun.file(output).exists()) {
        if (sha256(await Bun.file(output).bytes()) !== sha256(bytes))
          throw new Error(`Refusing overwrite: ${entry.path}`);
      } else {
        await mkdir(dirname(output), { recursive: true });
        await Bun.write(output, bytes);
      }
      if (process.platform !== "win32") await chmod(output, entry.mode === "100755" ? 0o755 : 0o644);
      receiptFiles.push({ ...entry, size: bytes.length, sha256: sha256(bytes) });
    }
    await Bun.write(
      receiptPath,
      JSON.stringify(
        {
          schema: 1,
          upstream: "https://gn.googlesource.com/gn",
          fork: "https://github.com/aphrody-labs/gn",
          upstreamRevision: GN_UPSTREAM_REVISION,
          revision: GN_REVISION,
          position: "2599 (3f99f58c2568)",
          archiveSha256: sha256(archive),
          files: receiptFiles,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(JSON.stringify(await verifyGN(), null, 2));
  }
}
