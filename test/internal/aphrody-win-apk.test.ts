import { describe, expect, test } from "bun:test";
import { bunEnv, bunExe, tempDir } from "harness";
import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "../../scripts/aphrody/win/apk/apk";
import { DEFAULT_KEY_NAME, install, mergePath, removeFromPath } from "../../scripts/aphrody/win/install";
import {
  compareVersions,
  openApk,
  parseDep,
  parseIndexText,
  parseInstalledDb,
  parseTar,
  splitGzipMembers,
  versionMatches,
} from "../../scripts/aphrody/win/apk/lib";

const enc = new TextEncoder();

// --- Fabrication d'un mini dépôt (comme abuild + apk index + abuild-sign) ---------------------------------------

interface TarIn {
  name: string;
  data?: string | Uint8Array;
  type?: "0" | "2" | "5" | "x";
  linkname?: string;
  mode?: number;
}

function tarHeader(e: TarIn, size: number): Uint8Array {
  const h = new Uint8Array(512);
  const put = (s: string, off: number, len: number) => h.set(enc.encode(s).subarray(0, len), off);
  const oct = (n: number, off: number, len: number) => put(n.toString(8).padStart(len - 1, "0") + "\0", off, len);
  put(e.name, 0, 100);
  oct(e.mode ?? (e.type === "5" ? 0o755 : 0o644), 100, 8);
  oct(0, 108, 8);
  oct(0, 116, 8);
  oct(size, 124, 12);
  oct(1700000000, 136, 12);
  h.fill(0x20, 148, 156);
  h[156] = (e.type ?? "0").charCodeAt(0);
  put(e.linkname ?? "", 157, 100);
  put("ustar\0" + "00", 257, 8);
  let sum = 0;
  for (const b of h) sum += b;
  put(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8);
  return h;
}

function tar(entries: TarIn[], eof: boolean): Uint8Array {
  const parts: Uint8Array[] = [];
  const push = (e: TarIn) => {
    const data = typeof e.data === "string" ? enc.encode(e.data) : (e.data ?? new Uint8Array(0));
    parts.push(tarHeader(e, data.length), data, new Uint8Array((512 - (data.length % 512)) % 512));
  };
  for (const e of entries) {
    if ((e.type ?? "0") === "0" && e.data !== undefined && !e.name.startsWith(".")) {
      const data = typeof e.data === "string" ? enc.encode(e.data) : e.data;
      const body = `APK-TOOLS.checksum.SHA1=${createHash("sha1").update(data).digest("hex")}\n`;
      let len = body.length + 2;
      while (String(len).length + 1 + body.length !== len) len = String(len).length + 1 + body.length;
      push({ name: "PaxHeader", type: "x", data: `${len} ${body}` });
    }
    push(e);
  }
  if (eof) parts.push(new Uint8Array(1024));
  return Buffer.concat(parts);
}

function gz(b: Uint8Array): Uint8Array {
  return Bun.gzipSync(b);
}

interface PkgIn {
  name: string;
  version: string;
  depends?: string[];
  provides?: string[];
  files: TarIn[];
  scripts?: Record<string, string>;
}

function makeApk(p: PkgIn, key: KeyObject, keyName: string) {
  const data = gz(tar(p.files, true));
  const pkginfo = [
    `pkgname = ${p.name}`,
    `pkgver = ${p.version}`,
    "arch = x86_64",
    `size = 1024`,
    ...(p.depends ?? []).map(d => `depend = ${d}`),
    ...(p.provides ?? []).map(d => `provides = ${d}`),
    `datahash = ${createHash("sha256").update(data).digest("hex")}`,
    "",
  ].join("\n");
  const control = gz(
    tar(
      [
        { name: ".PKGINFO", data: pkginfo },
        ...Object.entries(p.scripts ?? {}).map(([n, s]) => ({ name: n, data: s, mode: 0o755 })),
      ],
      false,
    ),
  );
  const sig = gz(tar([{ name: `.SIGN.RSA.${keyName}`, data: sign("sha1", control, key) }], false));
  const apk = Buffer.concat([sig, control, data]);
  const index = [
    `C:Q1${createHash("sha1").update(control).digest("base64")}`,
    `P:${p.name}`,
    `V:${p.version}`,
    "A:x86_64",
    `S:${apk.length}`,
    "I:1024",
    `T:paquet de test ${p.name}`,
    "U:https://example.invalid",
    "L:MIT",
    ...(p.depends?.length ? [`D:${p.depends.join(" ")}`] : []),
    ...(p.provides?.length ? [`p:${p.provides.join(" ")}`] : []),
  ].join("\n");
  return { apk, index };
}

function makeRepo(dir: string, pkgs: PkgIn[], key: KeyObject, keyName: string) {
  const arch = join(dir, "x86_64");
  mkdirSync(arch, { recursive: true });
  const blocks: string[] = [];
  for (const p of pkgs) {
    const { apk, index } = makeApk(p, key, keyName);
    writeFileSync(join(arch, `${p.name}-${p.version}.apk`), apk);
    blocks.push(index);
  }
  const body = gz(
    tar(
      [
        { name: "DESCRIPTION", data: "dépôt de test" },
        { name: "APKINDEX", data: blocks.join("\n\n") + "\n\n" },
      ],
      true,
    ),
  );
  const sig = gz(tar([{ name: `.SIGN.RSA256.${keyName}`, data: sign("sha256", body, key) }], false));
  writeFileSync(join(arch, "APKINDEX.tar.gz"), Buffer.concat([sig, body]));
}

function keypair(dir: string, name: string) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), publicKey.export({ type: "spki", format: "pem" }));
  return privateKey;
}

const PKGS: PkgIn[] = [
  {
    name: "libfoo",
    version: "1.0-r0",
    provides: ["so:libfoo.dll=1"],
    files: [
      { name: "usr", type: "5" },
      { name: "usr/lib", type: "5" },
      { name: "usr/lib/libfoo.dll", data: "MZ libfoo" },
    ],
  },
  {
    name: "foo",
    version: "1.0-r0",
    depends: ["so:libfoo.dll"],
    files: [
      { name: "usr", type: "5" },
      { name: "usr/bin", type: "5" },
      { name: "usr/bin/foo.txt", data: "foo 1.0\n" },
      { name: "usr/bin/foo-link", type: "2", linkname: "foo.txt" },
    ],
    scripts: {
      ".post-install": `#!/usr/bin/bun\nrequire("node:fs").writeFileSync(process.env.APK_ROOT + "/post-install.txt", process.argv[2]);\n`,
    },
  },
  { name: "foo", version: "0.9-r3", files: [{ name: "usr/bin/foo.txt", data: "old" }] },
  { name: "bar", version: "2.0_rc1-r0", files: [{ name: "bar.txt", data: "bar" }] },
];

async function apk(...argv: string[]) {
  const lines: string[] = [];
  const code = await run(argv, s => lines.push(s));
  return { code, out: lines.join("\n") };
}

// --- Tests ------------------------------------------------------------------------------------------------------

describe("lib", () => {
  test("compareVersions suit apk-tools", () => {
    const lt: [string, string][] = [
      ["1.0", "1.0.1"],
      ["1.0_rc1", "1.0"],
      ["1.0_alpha", "1.0_beta"],
      ["1.0", "1.0_p1"],
      ["1.0-r0", "1.0-r1"],
      ["1.0", "1.0a"],
      ["1.9", "1.10"],
      ["2.0_rc1-r0", "2.0-r0"],
      ["1.0", "1.0~abc"],
      ["1.0-r1", "1.0~abc"],
    ];
    for (const [a, b] of lt) {
      expect([a, b, compareVersions(a, b)]).toEqual([a, b, -1]);
      expect(compareVersions(b, a)).toBe(1);
    }
    expect(compareVersions("1.0-r0", "1.0-r0")).toBe(0);
  });

  test("parseDep / versionMatches", () => {
    expect(parseDep("!foo")).toMatchObject({ name: "foo", conflict: true });
    expect(parseDep("so:libc.dll")).toMatchObject({ name: "so:libc.dll", op: 0 });
    expect(versionMatches("1.2.3-r0", parseDep("x>=1.2"))).toBe(true);
    expect(versionMatches("1.1", parseDep("x>=1.2"))).toBe(false);
    expect(versionMatches("1.2.9", parseDep("x~1.2"))).toBe(true);
    expect(versionMatches("1.3", parseDep("x~1.2"))).toBe(false);
    expect(versionMatches("1.0", parseDep("x<1.0"))).toBe(false);
    expect(versionMatches("1.0", parseDep("x=1.0"))).toBe(true);
  });

  test("splitGzipMembers découpe et vérifie chaque membre", () => {
    const a = gz(enc.encode("premier ".repeat(50)));
    const b = gz(enc.encode("second"));
    const m = splitGzipMembers(Buffer.concat([a, b]));
    expect(m.map(x => [x.raw.length, new TextDecoder().decode(x.data).slice(0, 8)])).toEqual([
      [a.length, "premier "],
      [b.length, "second"],
    ]);
    const bad = Buffer.concat([a, b]);
    bad[bad.length - 6] ^= 0xff;
    expect(() => splitGzipMembers(bad)).toThrow(/CRC32|ISIZE/);
  });

  test("parseTar lit pax, liens et segments sans fin", () => {
    const t = tar(
      [
        { name: "d", type: "5" },
        { name: "d/f", data: "x" },
        { name: "d/l", type: "2", linkname: "f" },
      ],
      false,
    );
    const e = parseTar(t);
    expect(e.map(x => [x.name, x.type, x.linkname])).toEqual([
      ["d", "dir", ""],
      ["d/f", "file", ""],
      ["d/l", "symlink", "f"],
    ]);
    expect(e[1].pax["APK-TOOLS.checksum.SHA1"]).toBe(createHash("sha1").update("x").digest("hex"));
  });

  test("parseIndexText", () => {
    const p = parseIndexText("C:Q1x\nP:a\nV:1-r0\nD:b so:c.dll\np:cmd:a=1-r0\nk:10\n\nP:b\nV:2\n");
    expect(p.map(x => [x.name, x.version, x.depends, x.provides, x.providerPriority])).toEqual([
      ["a", "1-r0", ["b", "so:c.dll"], ["cmd:a=1-r0"], 10],
      ["b", "2", [], [], 0],
    ]);
  });
});

describe("apk (dépôt signé fabriqué)", () => {
  test("update, search, add, list, info, del", async () => {
    using dir = tempDir("aphrody-win-apk", {});
    const root = join(String(dir), "root");
    const keys = join(String(dir), "keys");
    const repo = join(String(dir), "repo");
    makeRepo(repo, PKGS, keypair(keys, "test.rsa.pub"), "test.rsa.pub");
    const base = ["--root", root, "--repo", repo, "--keys-dir", keys, "--arch", "x86_64"];

    expect(await apk(...base, "update")).toEqual({
      code: 0,
      out: `[${repo}] 4 paquets\nOK: 3 paquets distincts disponibles`,
    });
    expect((await apk(...base, "search", "fo")).out).toBe("foo-1.0-r0\nlibfoo-1.0-r0");

    const add = await apk(...base, "add", "foo");
    expect(add.out.split("\n").filter(l => !l.startsWith("ATTENTION"))).toEqual([
      "(1/2) Installation libfoo (1.0-r0)",
      "(2/2) Installation foo (1.0-r0)",
      "OK: 0.0 MiB dans 2 paquets",
    ]);
    expect(add.code).toBe(0);
    expect(readFileSync(join(root, "usr/lib/libfoo.dll"), "utf8")).toBe("MZ libfoo");
    expect(readFileSync(join(root, "usr/bin/foo.txt"), "utf8")).toBe("foo 1.0\n");
    expect(readFileSync(join(root, "usr/bin/foo-link"), "utf8")).toBe("foo 1.0\n");
    expect(readFileSync(join(root, "post-install.txt"), "utf8")).toBe("1.0-r0");
    expect(readFileSync(join(root, "etc/apk/world"), "utf8")).toBe("foo\n");
    const db = parseInstalledDb(readFileSync(join(root, "lib/apk/db/installed"), "utf8"));
    expect(db.map(p => [p.name, p.version, p.files.map(f => f.path).sort()])).toEqual([
      ["foo", "1.0-r0", ["usr/bin/foo-link", "usr/bin/foo.txt"]],
      ["libfoo", "1.0-r0", ["usr/lib/libfoo.dll"]],
    ]);

    expect((await apk(...base, "list", "--installed")).out).toBe(
      "foo-1.0-r0 x86_64 {foo} (MIT) [installed]\nlibfoo-1.0-r0 x86_64 {libfoo} (MIT) [installed]",
    );
    expect((await apk(...base, "info", "foo")).out).toContain("foo-1.0-r0 depends on:\nso:libfoo.dll");

    const busy = await apk(...base, "del", "libfoo");
    expect(busy).toEqual({ code: 1, out: "ERROR: libfoo est encore requis par foo" });

    const del = await apk(...base, "del", "foo");
    expect(del.out).toBe(
      "(1/2) Suppression foo (1.0-r0)\n(2/2) Suppression libfoo (1.0-r0)\nOK: 0.0 MiB dans 0 paquets",
    );
    expect(existsSync(join(root, "usr"))).toBe(false);
    expect(readFileSync(join(root, "lib/apk/db/installed"), "utf8")).toBe("");
    expect(del.code).toBe(0);
  });

  test("version imposée, puis mise à jour par upgrade", async () => {
    using dir = tempDir("aphrody-win-apk-up", {});
    const root = join(String(dir), "root");
    const keys = join(String(dir), "keys");
    const repo = join(String(dir), "repo");
    makeRepo(repo, PKGS, keypair(keys, "k.rsa.pub"), "k.rsa.pub");
    const base = ["--root", root, "--repo", repo, "--keys-dir", keys, "--arch", "x86_64", "-q"];
    expect(await apk(...base, "add", "foo<1.0")).toEqual({ code: 0, out: "" });
    expect(readFileSync(join(root, "usr/bin/foo.txt"), "utf8")).toBe("old");
    expect(await apk(...base, "add", "foo")).toEqual({ code: 0, out: "" });
    expect(readFileSync(join(root, "usr/bin/foo.txt"), "utf8")).toBe("old");
    expect((await apk(...base, "upgrade")).code).toBe(0);
    expect(readFileSync(join(root, "usr/bin/foo.txt"), "utf8")).toBe("foo 1.0\n");
  });

  test("refuse un paquet altéré et un index signé par une clé inconnue", async () => {
    using dir = tempDir("aphrody-win-apk-bad", {});
    const root = join(String(dir), "root");
    const keys = join(String(dir), "keys");
    const repo = join(String(dir), "repo");
    makeRepo(repo, PKGS, keypair(keys, "good.rsa.pub"), "good.rsa.pub");
    const base = ["--root", root, "--repo", repo, "--keys-dir", keys, "--arch", "x86_64", "-q"];

    const f = join(repo, "x86_64", "bar-2.0_rc1-r0.apk");
    const b = readFileSync(f);
    const members = splitGzipMembers(b);
    const dataStart = b.length - members[2].raw.length;
    const tampered = Buffer.concat([b.subarray(0, dataStart), gz(tar([{ name: "bar.txt", data: "evil" }], true))]);
    expect(() => openApk(tampered, keys)).toThrow(/datahash sha256/);
    writeFileSync(f, tampered);
    const r = await apk(...base, "add", "bar");
    expect(r.out).toMatch(/^ERROR: bar-2\.0_rc1-r0 : (taille|datahash)/);
    expect(r.code).toBe(1);
    expect(existsSync(join(root, "bar.txt"))).toBe(false);

    const other = join(String(dir), "other");
    makeRepo(other, PKGS, keypair(join(String(dir), "otherkeys"), "evil.rsa.pub"), "evil.rsa.pub");
    const u = await apk("--root", root, "--repo", other, "--keys-dir", keys, "--arch", "x86_64", "update");
    expect(u.out).toMatch(/^ERROR: index .* clé de signature inconnue \(evil\.rsa\.pub\)/);
    expect(u.code).toBe(1);

    // Même nom de clé, autre clé privée : signature invalide.
    const forged = join(String(dir), "forged");
    makeRepo(forged, PKGS, generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey, "good.rsa.pub");
    const v = await apk("--root", root, "--repo", forged, "--keys-dir", keys, "--arch", "x86_64", "update");
    expect(v.out).toMatch(/signature RSA256 invalide pour la clé good\.rsa\.pub/);
    expect(v.code).toBe(1);
  });

  test("le point d'entrée CLI fonctionne en sous-processus", async () => {
    await using proc = Bun.spawn({
      cmd: [bunExe(), join(import.meta.dir, "../../scripts/aphrody/win/apk/apk.ts"), "--root", ".", "frobnicate"],
      env: bunEnv,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    expect(stdout + stderr).toContain("ERROR: commande inconnue : frobnicate");
    expect(exitCode).toBe(1);
  });
});

describe("install.ts", () => {
  test("mergePath / removeFromPath", () => {
    expect(mergePath("C:\\a;C:\\Root\\usr\\bin\\;C:\\b", ["C:\\root\\usr\\bin"])).toBe(
      "C:\\root\\usr\\bin;C:\\a;C:\\b",
    );
    expect(removeFromPath("C:\\a;c:\\root\\usr\\bin;;C:\\b", ["C:\\root\\usr\\bin"])).toBe("C:\\a;C:\\b");
  });

  test("amorce la racine, installe, crée bunsh et le profil Windows Terminal", async () => {
    using dir = tempDir("aphrody-win-setup", {});
    const root = join(String(dir), "root");
    const keys = join(String(dir), "keys");
    const repo = join(String(dir), "repo");
    const terminalDir = join(String(dir), "wt");
    makeRepo(repo, PKGS, keypair(keys, "setup.rsa.pub"), "setup.rsa.pub");
    const lines: string[] = [];
    const code = await install({
      root,
      repos: [repo],
      keys: [join(keys, "setup.rsa.pub")],
      arch: "x86_64",
      packages: ["foo"],
      update: false,
      path: false,
      terminalProfile: true,
      terminalDir,
      allowUntrusted: false,
      quiet: true,
      bun: process.execPath,
      out: s => lines.push(s),
    });
    expect(lines.filter(l => !l.startsWith("ATTENTION"))).toEqual([]);
    expect(code).toBe(0);
    expect(readFileSync(join(root, "etc/apk/keys", DEFAULT_KEY_NAME), "utf8")).toContain("BEGIN PUBLIC KEY");
    expect(readFileSync(join(root, "etc/apk/repositories"), "utf8")).toBe(repo + "\n");
    expect(readFileSync(join(root, "etc/apk/arch"), "utf8")).toBe("x86_64\n");
    expect(readFileSync(join(root, "etc/apk/world"), "utf8")).toBe("foo\n");
    expect(readFileSync(join(root, "usr/lib/libfoo.dll"), "utf8")).toBe("MZ libfoo");
    const bunsh = join(root, "usr/bin", process.platform === "win32" ? "bunsh.exe" : "bunsh");
    expect(statSync(bunsh).size).toBe(statSync(process.execPath).size);
    const frag = JSON.parse(readFileSync(join(terminalDir, "aphrody-win.json"), "utf8"));
    expect(frag.profiles[0]).toMatchObject({
      name: "Aphrody (bunsh)",
      commandline: `"${bunsh.replace(/\//g, "\\")}" -l`,
    });
    expect(frag.profiles[0].guid).toMatch(/^\{[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\}$/);
  });
});
