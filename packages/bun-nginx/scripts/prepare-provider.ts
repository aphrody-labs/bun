import { mkdir, realpath, rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { extractMediaSDKArchive, hashSDKFile } from "../../bun-video/src/sdk";

const version = "1.31.6";
// Official repository release tag, resolved independently from the signed binary release.
const sourceRevision = "0a5db852e18d1c22c62a5ede1412ac3f416111a0";
const sourceTagObject = "45a318d05a0fd23f57ffe9579f7f0969c0fe402a";
const keys = ["arut", "pluknet", "sb", "thresh"] as const;
const upstream = "https://nginx.org";
const maxArchiveBytes = 32 << 20;

async function download(url: string, path: string, limit: number) {
  const existing = Bun.file(path);
  if (await existing.exists()) {
    if (existing.size <= 0 || existing.size > limit) throw new Error("Cached NGINX asset exceeds its bound");
    return { url, bytes: existing.size, sha256: await hashSDKFile(path) };
  }
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) throw new Error(`NGINX upstream returned ${response.status}: ${url}`);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > limit) throw new Error("NGINX upstream asset exceeded its byte bound");
    chunks.push(chunk);
  }
  await Bun.write(path, Buffer.concat(chunks));
  return { url, bytes, sha256: await hashSDKFile(path) };
}
async function command(argv: string[], cwd: string) {
  await using child = Bun.spawn(argv, { cwd, stdout: "pipe", stderr: "pipe", stdin: "ignore", timeout: 15_000 });
  const [stdout, stderr, exitCode] = await Promise.all([
    Bun.readableStreamToText(child.stdout),
    Bun.readableStreamToText(child.stderr),
    child.exited,
  ]);
  if (exitCode) throw new Error(`NGINX provider tool failed (${exitCode}): ${stderr}`);
  return { stdout, stderr, exitCode };
}

export async function prepareWindowsProvider(directory: string, gpg: string) {
  if (process.platform !== "win32")
    throw new Error("The official Windows provider must be qualified on native Windows");
  const root = resolve(directory);
  await mkdir(root, { recursive: true });
  const store = await realpath(root);
  const receipt = join(store, "provider.json");
  if (await Bun.file(receipt).exists()) {
    const previous = await Bun.file(receipt).json();
    if (previous.version !== version) throw new Error("Existing NGINX provider receipt belongs to another release");
  }
  const archive = join(store, `nginx-${version}.zip`);
  const signature = archive + ".asc";
  const keyHome = join(store, "public-keyring");
  await mkdir(keyHome, { recursive: true });
  const actualKeyHome = await realpath(keyHome);
  if (relative(store, actualKeyHome).startsWith("..") || isAbsolute(relative(store, actualKeyHome)))
    throw new Error("NGINX public keyring escaped its owned SDK store");
  const assets = await Promise.all([
    download(`${upstream}/download/nginx-${version}.zip`, archive, maxArchiveBytes),
    download(`${upstream}/download/nginx-${version}.zip.asc`, signature, 64 << 10),
    ...keys.map(key => download(`${upstream}/keys/${key}.key`, join(keyHome, `${key}.key`), 1 << 20)),
  ]);
  const base = [
    gpg,
    "--no-options",
    "--homedir",
    ".",
    "--batch",
    "--no-tty",
    "--no-default-keyring",
    "--keyring",
    "upstream-public.gpg",
    "--no-auto-key-retrieve",
    "--no-autostart",
    "--status-fd=1",
  ];
  await command([...base, "--import", ...keys.map(key => `${key}.key`)], keyHome);
  const verified = await command(
    [...base, "--verify", `../nginx-${version}.zip.asc`, `../nginx-${version}.zip`],
    keyHome,
  );
  const valid = verified.stdout.match(/^\[GNUPG:\] VALIDSIG ([A-F0-9]{40,64}) ([^\n]+)/m);
  if (!valid || /\b(?:BADSIG|ERRSIG|EXPSIG|EXPKEYSIG|REVKEYSIG)\b/.test(verified.stdout))
    throw new Error("NGINX release signature was not valid with the official public keys");
  await Bun.write(join(store, "signature-verification.log"), verified.stdout + verified.stderr);
  await rm(join(keyHome, "upstream-public.gpg~"), { force: true });
  const members = await new Bun.Archive(await Bun.file(archive).bytes()).files();
  if (members.size > 4096 || [...members.values()].reduce((sum, file) => sum + file.size, 0) > 128 << 20)
    throw new Error("NGINX ZIP expanded layout exceeds its bound");
  for (const name of members.keys()) {
    if (
      !name ||
      name.includes("\\") ||
      name.includes("\0") ||
      name.includes(":") ||
      name.startsWith("/") ||
      name.split("/").some(part => part === ".." || part === ".")
    )
      throw new Error("NGINX ZIP member has an unsafe relative path");
  }
  const prefix = join(store, "prefix");
  if (!(await Bun.file(join(prefix, `nginx-${version}`, "nginx.exe")).exists()))
    await extractMediaSDKArchive(archive, prefix);
  const actualPrefix = await realpath(prefix);
  if (relative(store, actualPrefix).startsWith("..") || isAbsolute(relative(store, actualPrefix)))
    throw new Error("NGINX prefix escaped its selected SDK store");
  for (const [name, source] of members) {
    const file = await realpath(join(prefix, name));
    const member = relative(actualPrefix, file);
    if (member.startsWith("..") || isAbsolute(member))
      throw new Error("NGINX provider member escaped its verified prefix");
    const expected = new Bun.CryptoHasher("sha256").update(await source.bytes()).digest("hex");
    if (expected !== (await hashSDKFile(file)))
      throw new Error(`NGINX provider member differs from its signed archive: ${name}`);
  }
  const executable = join(prefix, `nginx-${version}`, "nginx.exe");
  const header = await Bun.file(executable).bytes();
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  if (header[0] !== 77 || header[1] !== 90 || header.length < 64) throw new Error("NGINX Windows provider is not PE");
  const pe = view.getUint32(0x3c, true);
  if (pe + 6 > header.length || view.getUint32(pe, true) !== 0x4550)
    throw new Error("NGINX Windows PE header is invalid");
  const machine = view.getUint16(pe + 4, true);
  const architecture =
    machine === 0x14c ? "x86" : machine === 0x8664 ? "x64" : machine === 0xaa64 ? "arm64" : "unknown";
  if (architecture === "unknown") throw new Error("Unsupported NGINX PE architecture");
  const info = await command([executable, "-V"], prefix);
  if (!`${info.stdout}\n${info.stderr}`.includes(`nginx/${version}`))
    throw new Error("NGINX executable version differs from the signed release");
  const files = [];
  for (const name of members.keys()) {
    const file = Bun.file(join(prefix, name));
    if (file.size) files.push({ name, bytes: file.size, sha256: await hashSDKFile(join(prefix, name)) });
  }
  const result = {
    schema: 1,
    component: "nginx",
    version,
    sourceRepository: "https://github.com/nginx/nginx",
    sourceRelease: `release-${version}`,
    sourceRevision,
    sourceTagObject,
    sourceTagSigned: false,
    sourceTagReference: `https://api.github.com/repos/nginx/nginx/git/tags/${sourceTagObject}`,
    provenance:
      "official signed Windows release; repository release tag pinned independently; binary reproducibility and native Bun controller are separate gates",
    upstreamRelease: `${upstream}/en/download.html`,
    signature: { valid: true, fingerprint: valid[1], details: valid[2], publicKeys: `${upstream}/en/pgp_keys.html` },
    assets,
    executable: {
      path: executable,
      bytes: header.length,
      sha256: await hashSDKFile(executable),
      architecture,
      machine,
    },
    host: { platform: process.platform, arch: process.arch, bunVersion: Bun.version, bunRevision: Bun.revision },
    nativeVersion: info.stdout + info.stderr,
    files,
    qualified: { releaseSignature: true, nativeVersion: true, http: false, nativeBunController: false },
    createdAt: new Date().toISOString(),
  };
  await Bun.write(receipt, JSON.stringify(result, null, 2) + "\n");
  return result;
}

if (import.meta.main) {
  const [directory, gpg] = process.argv.slice(2);
  if (!directory || !gpg) throw new Error("Usage: bun prepare-provider.ts <owned-sdk-directory> <gpg-executable>");
  const provider = await prepareWindowsProvider(directory, gpg);
  console.log(
    JSON.stringify({
      receipt: join(resolve(directory), "provider.json"),
      version: provider.version,
      executable: provider.executable,
      signatureFingerprint: provider.signature.fingerprint,
    }),
  );
}
