import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { bunEnv, bunExe, tempDir } from "harness";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { join } from "path";

// A fake Alpine mirror: signed APKINDEX.tar.gz and v2 .apk files (gzip members:
// signature, control, data), served by Bun.serve. `bun pm apk` installs into a
// root of its own without the apk binary.

const KEY_NAME = "test@bun.sh-0001.rsa.pub";
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

function octal(n: number, width: number): string {
  return n.toString(8).padStart(width - 1, "0") + "\0";
}

function tarHeader(name: string, type: string, size: number, mode: number, link = ""): Buffer {
  const h = Buffer.alloc(512);
  h.write(name, 0, 100);
  h.write(octal(mode, 8), 100);
  h.write(octal(0, 8), 108);
  h.write(octal(0, 8), 116);
  h.write(octal(size, 12), 124);
  h.write(octal(1700000000, 12), 136);
  h.write("        ", 148);
  h.write(type, 156);
  h.write(link, 157, 100);
  h.write("ustar\0", 257);
  h.write("00", 263);
  h.write("root", 265);
  h.write("root", 297);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(octal(sum, 7) + " ", 148);
  return h;
}

function pad(data: Buffer): Buffer {
  const rem = data.length % 512;
  return rem === 0 ? data : Buffer.concat([data, Buffer.alloc(512 - rem)]);
}

type Entry = { name: string; data?: string | Buffer; dir?: boolean; mode?: number };

function tar(entries: Entry[], end: boolean, checksums = false): Buffer {
  const parts: Buffer[] = [];
  for (const e of entries) {
    if (e.dir) {
      parts.push(tarHeader(e.name, "5", 0, e.mode ?? 0o755));
      continue;
    }
    const data = Buffer.from(e.data ?? "");
    if (checksums) {
      const sha1 = createHash("sha1").update(data).digest("hex");
      let rec = ` APK-TOOLS.checksum.SHA1=${sha1}\n`;
      let len = rec.length;
      while (`${len}${rec}`.length !== len) len = `${len}${rec}`.length;
      const pax = Buffer.from(`${len}${rec}`);
      parts.push(tarHeader(`PaxHeader/${e.name}`.slice(0, 99), "x", pax.length, 0o644), pad(pax));
    }
    parts.push(tarHeader(e.name, "0", data.length, e.mode ?? 0o644), pad(data));
  }
  if (end) parts.push(Buffer.alloc(1024));
  return Buffer.concat(parts);
}

const gz = (b: Buffer) => Buffer.from(Bun.gzipSync(b));
const sha1 = (b: Buffer) => createHash("sha1").update(b).digest();

function signed(body: Buffer): Buffer {
  const sig = sign("sha1", body, privateKey);
  return gz(tar([{ name: `.SIGN.RSA.${KEY_NAME}`, data: sig }], false));
}

type Pkg = { name: string; version: string; depends?: string[]; provides?: string[]; files: Entry[] };

function buildApk(p: Pkg): { bytes: Buffer; identity: Buffer; size: number } {
  const data = gz(tar(p.files, true, true));
  const datahash = createHash("sha256").update(data).digest("hex");
  const pkginfo = [
    `pkgname = ${p.name}`,
    `pkgver = ${p.version}`,
    `pkgdesc = ${p.name} test package`,
    `url = https://example.invalid/${p.name}`,
    `builddate = 1700000000`,
    `size = 4096`,
    `arch = x86_64`,
    `origin = ${p.name}`,
    `license = MIT`,
    ...(p.depends ?? []).map(d => `depend = ${d}`),
    ...(p.provides ?? []).map(d => `provides = ${d}`),
    `datahash = ${datahash}`,
    "",
  ].join("\n");
  const control = gz(tar([{ name: ".PKGINFO", data: pkginfo }], false));
  const bytes = Buffer.concat([signed(control), control, data]);
  return { bytes, identity: sha1(control), size: bytes.length };
}

const packages: Pkg[] = [
  {
    name: "hello",
    version: "1.0-r0",
    depends: ["so:libhello.so.1"],
    files: [
      { name: "usr/", dir: true },
      { name: "usr/bin/", dir: true },
      { name: "usr/bin/hello", data: "#!/bin/sh\necho hello\n", mode: 0o755 },
      { name: "etc/", dir: true },
      { name: "etc/hello.conf", data: "greeting=hello\n" },
    ],
  },
  {
    name: "libhello",
    version: "1.0-r0",
    provides: ["so:libhello.so.1=1"],
    files: [
      { name: "usr/", dir: true },
      { name: "usr/lib/", dir: true },
      { name: "usr/lib/libhello.so.1", data: "not really an ELF\n" },
    ],
  },
];

const files = new Map<string, Buffer>();
let server: ReturnType<typeof Bun.serve>;
let repo = "";

beforeAll(() => {
  const records: string[] = [];
  for (const p of packages) {
    const apk = buildApk(p);
    files.set(`/main/x86_64/${p.name}-${p.version}.apk`, apk.bytes);
    records.push(
      [
        `C:Q1${apk.identity.toString("base64")}`,
        `P:${p.name}`,
        `V:${p.version}`,
        `A:x86_64`,
        `S:${apk.size}`,
        `I:4096`,
        `T:${p.name} test package`,
        `U:https://example.invalid/${p.name}`,
        `L:MIT`,
        `o:${p.name}`,
        ...(p.depends?.length ? [`D:${p.depends.join(" ")}`] : []),
        ...(p.provides?.length ? [`p:${p.provides.join(" ")}`] : []),
        "",
      ].join("\n"),
    );
  }
  const body = gz(
    tar(
      [
        { name: "DESCRIPTION", data: "bun-test-repo" },
        { name: "APKINDEX", data: records.join("\n") + "\n" },
      ],
      true,
    ),
  );
  files.set("/main/x86_64/APKINDEX.tar.gz", Buffer.concat([signed(body), body]));
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const body = files.get(new URL(req.url).pathname);
      return body ? new Response(body) : new Response("not found", { status: 404 });
    },
  });
  repo = `http://127.0.0.1:${server.port}/main`;
});

afterAll(() => server?.stop(true));

async function apk(dir: string, args: string[], keys = true) {
  const cmd = [
    bunExe(),
    "pm",
    "apk",
    "--root",
    join(dir, "root"),
    "--arch",
    "x86_64",
    "-X",
    repo,
    ...(keys ? ["--keys-dir", join(dir, "keys")] : []),
    "--no-scripts",
    ...args,
  ];
  await using proc = Bun.spawn({
    cmd,
    env: { ...bunEnv, BUN_INSTALL_CACHE_DIR: join(dir, "cache") },
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

describe("bun pm apk", () => {
  test("add --initdb resolves so: provides, verifies signatures and writes the apk database", async () => {
    using dir = tempDir("pm-apk", { [`keys/${KEY_NAME}`]: publicKey.export({ type: "spki", format: "pem" }) });
    const root = join(String(dir), "root");

    const add = await apk(String(dir), ["--initdb", "add", "hello"]);
    expect(add.stderr).toContain("Installing libhello (1.0-r0)");
    expect(add.stderr).toContain("Installing hello (1.0-r0)");
    expect(add.exitCode).toBe(0);

    expect(readFileSync(join(root, "usr/bin/hello"), "utf8")).toBe("#!/bin/sh\necho hello\n");
    expect(readFileSync(join(root, "usr/lib/libhello.so.1"), "utf8")).toBe("not really an ELF\n");
    expect(readFileSync(join(root, "etc/apk/world"), "utf8")).toBe("hello\n");
    expect(readFileSync(join(root, "etc/apk/arch"), "utf8")).toBe("x86_64\n");
    const installed = readFileSync(join(root, "lib/apk/db/installed"), "utf8");
    expect(installed).toContain("P:hello\nV:1.0-r0\n");
    expect(installed).toContain("P:libhello\nV:1.0-r0\n");
    expect(installed).toContain("R:hello\n");
    expect(installed).toContain("R:hello.conf\n");

    const info = await apk(String(dir), ["info", "-L", "hello"]);
    expect(info.stdout).toBe("hello-1.0-r0 contains:\nusr/bin/hello\netc/hello.conf\n\n");
    expect(info.exitCode).toBe(0);

    const audit = await apk(String(dir), ["audit"]);
    expect(audit.stdout).toBe("");
    expect(audit.exitCode).toBe(0);

    await Bun.write(join(root, "usr/bin/hello"), "tampered\n");
    const audit2 = await apk(String(dir), ["audit"]);
    expect(audit2.stdout).toBe("U usr/bin/hello\n");

    const fix = await apk(String(dir), ["fix", "hello"]);
    expect(fix.exitCode).toBe(0);
    expect(readFileSync(join(root, "usr/bin/hello"), "utf8")).toBe("#!/bin/sh\necho hello\n");

    const del = await apk(String(dir), ["del", "hello"]);
    expect(del.stderr).toContain("Purging hello (1.0-r0)");
    expect(del.exitCode).toBe(0);
    expect(existsSync(join(root, "usr/bin/hello"))).toBe(false);
    expect(existsSync(join(root, "usr/lib/libhello.so.1"))).toBe(false);
    expect(readFileSync(join(root, "etc/apk/world"), "utf8")).toBe("\n");
  });

  test("an index signed by an unknown key is refused", async () => {
    using dir = tempDir("pm-apk-untrusted", { "keys/.keep": "" });
    const add = await apk(String(dir), ["--initdb", "add", "hello"]);
    expect(add.stderr).toContain("UNTRUSTED signature");
    expect(add.exitCode).toBe(1);
    expect(existsSync(join(String(dir), "root/usr/bin/hello"))).toBe(false);
  });

  test("search and info read the repository index", async () => {
    using dir = tempDir("pm-apk-search", { [`keys/${KEY_NAME}`]: publicKey.export({ type: "spki", format: "pem" }) });
    expect((await apk(String(dir), ["--initdb", "update"])).exitCode).toBe(0);
    const search = await apk(String(dir), ["search", "hello"]);
    expect(search.stdout).toBe("hello-1.0-r0\nlibhello-1.0-r0\n");
    expect(search.exitCode).toBe(0);
  });
});
