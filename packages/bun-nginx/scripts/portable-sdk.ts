import { mkdir, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { hashSDKFile } from "../../bun-video/src/sdk";

const repository = resolve(import.meta.dir, "../../..");
const packageVersion = "10.34-7ubuntu0.1";
const archive = "https://archive.ubuntu.com/ubuntu/";
export interface PortableSDK {
  schema: 1;
  kind: "bun-nginx-portable-sdk";
  target: "linux-x64-gnu";
  requiredGlibcMaximum: "2.17";
  sysroot: string;
  compiler: string;
  gccDirectory: string;
  dependencyPrefix: string;
  zlibPrefix: string;
  compatibilityObject: string;
  cryptArchive: string;
  wrapSymbols: string[];
  files: { path: string; bytes: number; sha256: string }[];
  provenance: unknown;
}
function ownedOutput(output: string) {
  const path = resolve(output),
    scoped = relative(repository, path);
  if (!isAbsolute(output) || !scoped || scoped.startsWith("..") || isAbsolute(scoped))
    throw Error("Portable NGINX output must remain in this checkout's artifact store");
  return path;
}
async function record(path: string) {
  return { path, bytes: Bun.file(path).size, sha256: await hashSDKFile(path) };
}
async function run(executable: string, args: string[], stdout?: string) {
  await using child = Bun.spawn([executable, ...args], {
    stdin: "ignore",
    stdout: stdout ? Bun.file(stdout) : "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  const [text, stderr, code] = await Promise.all([
    stdout ? Promise.resolve("") : Bun.readableStreamToText(child.stdout as ReadableStream),
    Bun.readableStreamToText(child.stderr),
    child.exited,
  ]);
  if (code) throw Error(`${executable}: ${stderr}`);
  return { text, stderr };
}
async function download(url: string, path: string, maximum: number, expected?: { bytes: number; sha256: string }) {
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) throw Error(`Official SDK download failed: ${response.status}`);
  const declared = Number(response.headers.get("content-length"));
  if (declared > maximum) throw Error("Official SDK response exceeds its bound");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const value = await reader.read();
      if (value.done) break;
      bytes += value.value.byteLength;
      if (bytes > maximum) throw Error("Official SDK response exceeds its bound");
      chunks.push(value.value);
    }
  } finally {
    await reader.cancel();
  }
  const value = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    value.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const sha256 = new Bun.CryptoHasher("sha256").update(value).digest("hex");
  if (expected && (bytes !== expected.bytes || sha256 !== expected.sha256)) throw Error("Signed SDK digest mismatch");
  await Bun.write(path, value);
  return { url, path, bytes, sha256 };
}
export async function preparePCRE(output: string) {
  if (process.platform !== "linux" || process.arch !== "x64")
    throw Error("This SDK recipe requires native GNU x64 Linux");
  const destination = ownedOutput(output),
    metadata = join(destination, "provenance"),
    prefix = join(destination, "prefix");
  await mkdir(metadata, { recursive: true });
  const inRelease = await download(archive + "dists/focal-updates/InRelease", join(metadata, "InRelease"), 2 << 20);
  const releasePath = join(metadata, "Release");
  const signature = await run("gpgv", [
    "--status-fd=1",
    "--keyring",
    "/usr/share/keyrings/ubuntu-archive-keyring.gpg",
    "--output",
    releasePath,
    inRelease.path,
  ]);
  const fingerprint = signature.text.match(/\[GNUPG:\] VALIDSIG ([A-F0-9]{40}) /)?.[1];
  if (!fingerprint) throw Error("Ubuntu metadata lacks a valid archive signature");
  const release = await Bun.file(releasePath).text();
  if (!/^Suite: focal-updates$/m.test(release) || !/^Codename: focal$/m.test(release))
    throw Error("Unexpected Ubuntu archive suite");
  const validUntil = release.match(/^Valid-Until: (.+)$/m)?.[1];
  if (validUntil && (!Number.isFinite(Date.parse(validUntil)) || Date.parse(validUntil) < Date.now()))
    throw Error("Ubuntu archive metadata expired");
  const shaSection = release.match(/^SHA256:\n([\s\S]*?)(?=^\S|$(?![\s\S]))/m)?.[1];
  const entry = shaSection?.match(/^ ([a-f0-9]{64})\s+(\d+) main\/binary-amd64\/Packages\.xz$/m);
  if (!entry) throw Error("Signed Ubuntu Packages digest missing");
  const packages = await download(
    archive + "dists/focal-updates/main/binary-amd64/Packages.xz",
    join(metadata, "Packages.xz"),
    16 << 20,
    { sha256: entry[1], bytes: Number(entry[2]) },
  );
  const packagesPath = join(metadata, "Packages");
  await run("xz", ["--decompress", "--stdout", packages.path], packagesPath);
  if (Bun.file(packagesPath).size > 64 << 20) throw Error("Ubuntu package inventory exceeds its bound");
  const stanza = (await Bun.file(packagesPath).text())
    .split("\n\n")
    .find(
      value =>
        /^Package: libpcre2-dev$/m.test(value) &&
        new RegExp(`^Version: ${packageVersion.replaceAll(".", "\\.")}$`, "m").test(value),
    );
  if (!stanza) throw Error("The exact focal PCRE2 SDK is absent from signed metadata");
  const fields = Object.fromEntries(
    stanza
      .split("\n")
      .filter(line => /^[A-Z][A-Za-z0-9-]*: /.test(line))
      .map(line => {
        const at = line.indexOf(": ");
        return [line.slice(0, at), line.slice(at + 2)];
      }),
  );
  const filename = `pool/main/p/pcre2/libpcre2-dev_${packageVersion}_amd64.deb`;
  if (
    fields.Filename !== filename ||
    fields.Architecture !== "amd64" ||
    !/^[a-f0-9]{64}$/.test(fields.SHA256) ||
    !/^pcre2(?: \(.*\))?$/.test(fields.Source)
  )
    throw Error("Unexpected PCRE2 package identity");
  const deb = await download(archive + filename, join(metadata, filename.split("/").at(-1)!), 2 << 20, {
    sha256: fields.SHA256,
    bytes: Number(fields.Size),
  });
  await mkdir(prefix, { recursive: true });
  await run("dpkg-deb", ["--extract", deb.path, prefix]);
  for (const name of [
    "usr/include/pcre2.h",
    "usr/lib/x86_64-linux-gnu/libpcre2-8.a",
    "usr/share/doc/libpcre2-dev/copyright",
  ])
    if (!(await Bun.file(join(prefix, name)).exists()))
      throw Error("The signed SDK lacks its static archive, headers or licence");
  const receipt = {
    schema: 1,
    kind: "ubuntu-signed-pcre2-sdk",
    package: fields,
    suite: "focal-updates",
    signature: {
      fingerprint,
      status: signature.text,
      keyring: await record("/usr/share/keyrings/ubuntu-archive-keyring.gpg"),
    },
    metadata: { inRelease, release: await record(releasePath), packages },
    archive: deb,
    prefix,
  };
  await Bun.write(join(destination, "pcre2-receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  return receipt;
}
async function treeFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result.push(...(await treeFiles(path)));
    else if (entry.isFile()) result.push(path);
    else if (entry.isSymbolicLink()) throw Error("Portable SDK inventory requires explicit regular files");
  }
  return result.sort();
}
export async function finalizeSDK(output: string, zlibPrefix: string) {
  const destination = ownedOutput(output),
    prefix = join(destination, "prefix");
  const pcre = await Bun.file(join(destination, "pcre2-receipt.json")).json();
  const boringssl = join(repository, "vendor/boringssl");
  const recipe = await Bun.file(join(repository, "scripts/build/deps/boringssl.ts")).text();
  const revision = recipe.match(/const BORINGSSL_COMMIT = "([a-f0-9]{40})"/)?.[1];
  if (revision !== "41bf9b59c2ebf277a7aa427e1ecad5cc80dd4d4f")
    throw Error("BoringSSL source recipe changed; review the pin before rebuilding");
  const files = await Promise.all(
    [
      ...(await treeFiles(join(prefix, "include"))),
      ...(await treeFiles(join(prefix, "lib"))),
      join(prefix, "share/licenses/boringssl/LICENSE"),
      join(prefix, "usr/include/pcre2.h"),
      join(prefix, "usr/lib/x86_64-linux-gnu/libpcre2-8.a"),
      join(prefix, "usr/share/doc/libpcre2-dev/copyright"),
      join(zlibPrefix, "include/zlib.h"),
      join(zlibPrefix, "include/zconf.h"),
      join(zlibPrefix, "lib/libz.a"),
      join(zlibPrefix, "share/licenses/zlib-ng/LICENSE.md"),
    ].map(record),
  );
  const compatibilityObject = join(prefix, "lib/bun-glibc-compat.o");
  const symbols = await run("nm", ["--defined-only", "--extern-only", compatibilityObject]);
  const wrapSymbols = [...symbols.text.matchAll(/\b__wrap_([A-Za-z_][A-Za-z0-9_]*)$/gm)].map(match => match[1]).sort();
  if (!wrapSymbols.includes("getrandom") || !wrapSymbols.includes("statx") || !wrapSymbols.includes("fcntl64"))
    throw Error("Canonical Bun compatibility object lacks the required wrappers");
  const cryptArchive = "/opt/linux-sysroot-glibc/usr/lib/x86_64-linux-gnu/libcrypt.a";
  files.push(await record(cryptArchive));
  const receipt: PortableSDK = {
    schema: 1,
    kind: "bun-nginx-portable-sdk",
    target: "linux-x64-gnu",
    requiredGlibcMaximum: "2.17",
    sysroot: "/opt/linux-sysroot-glibc",
    compiler: "/usr/lib/llvm-23/bin/clang",
    gccDirectory: "/opt/linux-sysroot-glibc/usr/lib/gcc/x86_64-linux-gnu/13",
    dependencyPrefix: prefix,
    zlibPrefix,
    compatibilityObject,
    cryptArchive,
    wrapSymbols,
    files,
    provenance: {
      pcre2: pcre,
      boringssl: {
        repository: "oven-sh/boringssl",
        revision,
        source: boringssl,
        cacheStamp: (await Bun.file(join(boringssl, ".ref")).text()).trim(),
        cmake: await record(join(boringssl, "CMakeLists.txt")),
        hooksRequired: false,
      },
      zlib: {
        source: join(repository, "vendor/zlib"),
        revision: "12731092979c6d07f42da27da673a9f6c7b13586",
        cmake: await record(join(repository, "vendor/zlib/CMakeLists.txt")),
      },
      compatibility: {
        source: await record(join(repository, "src/jsc/bindings/workaround-missing-symbols.cpp")),
        behaviouralQualified: false,
      },
      sharedLibraryBaselineQualified: false,
    },
  };
  await Bun.write(join(destination, "sdk-receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  return receipt;
}
export async function readPortableSDK(path: string): Promise<PortableSDK> {
  if (process.platform !== "linux" || process.arch !== "x64" || !isAbsolute(path))
    throw Error("Portable NGINX SDK requires GNU x64 Linux and an absolute receipt");
  const receipt: PortableSDK = await Bun.file(ownedOutput(path)).json();
  if (
    receipt.schema !== 1 ||
    receipt.kind !== "bun-nginx-portable-sdk" ||
    receipt.target !== "linux-x64-gnu" ||
    receipt.requiredGlibcMaximum !== "2.17" ||
    receipt.sysroot !== "/opt/linux-sysroot-glibc" ||
    receipt.compiler !== "/usr/lib/llvm-23/bin/clang" ||
    receipt.gccDirectory !== receipt.sysroot + "/usr/lib/gcc/x86_64-linux-gnu/13" ||
    !Array.isArray(receipt.files) ||
    receipt.files.length > 1000 ||
    !Array.isArray(receipt.wrapSymbols) ||
    receipt.wrapSymbols.length > 64 ||
    receipt.wrapSymbols.some(symbol => !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(symbol))
  )
    throw Error("Unsupported portable NGINX SDK identity");
  const prefix = await realpath(receipt.dependencyPrefix),
    zlib = await realpath(receipt.zlibPrefix);
  for (const input of receipt.files) {
    const path = await realpath(input.path);
    if (
      path !== "/opt/linux-sysroot-glibc/usr/lib/x86_64-linux-gnu/libcrypt.a" &&
      ![prefix, zlib].some(root => !relative(root, path).startsWith("..") && !isAbsolute(relative(root, path)))
    )
      throw Error("SDK input escaped its selected prefixes");
    if (Bun.file(path).size !== input.bytes || (await hashSDKFile(path)) !== input.sha256)
      throw Error("Portable NGINX SDK input drift");
  }
  for (const required of [
    join(prefix, "lib/libssl.a"),
    join(prefix, "lib/libcrypto.a"),
    join(prefix, "usr/lib/x86_64-linux-gnu/libpcre2-8.a"),
    join(zlib, "lib/libz.a"),
    receipt.compatibilityObject,
    receipt.cryptArchive,
  ])
    if (!receipt.files.some(file => file.path === required))
      throw Error("Portable SDK omits a required static dependency");
  return receipt;
}
if (import.meta.main) {
  const [action, output, zlib] = process.argv.slice(2);
  if (!output) throw Error("Usage: portable-sdk.ts <prepare-pcre|finalize> <absolute-output> [absolute-zlib-prefix]");
  if (action === "prepare-pcre") {
    const receipt = await preparePCRE(output);
    console.log(
      JSON.stringify({
        output,
        package: receipt.package.Package,
        version: receipt.package.Version,
        sha256: receipt.archive.sha256,
        signer: receipt.signature.fingerprint,
      }),
    );
  } else if (action === "finalize" && zlib && isAbsolute(zlib)) {
    const receipt = await finalizeSDK(output, zlib);
    console.log(
      JSON.stringify({
        output,
        target: receipt.target,
        inputFiles: receipt.files.length,
        wrapSymbols: receipt.wrapSymbols,
      }),
    );
  } else throw Error("Unsupported portable SDK action");
}
