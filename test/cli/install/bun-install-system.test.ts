import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { bunEnv, bunExe, isWindows, tempDir } from "harness";
import { deflateRawSync } from "node:zlib";
import { join } from "path";

// A fake winget source v2: source2.msix (zip) -> Public/index.db (SQLite),
// packages/<id>/<hash8>/versionData.mszyml (MSZIP YAML), manifests (YAML), installers.

const sha256 = (data: string | Uint8Array) => new Bun.CryptoHasher("sha256").update(data).digest("hex");

function storedZip(files: Record<string, Uint8Array>): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const nameBytes = new TextEncoder().encode(name);
    const crc = Bun.hash.crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(12, 0x21, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(14, 0x21, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    locals.push(local, data);
    centrals.push(central);
    offset += local.length + data.length;
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centrals.length, true);
  ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  return Buffer.concat([...locals, ...centrals, end]);
}

// 32 KiB blocks; each block after the first is deflated against the previous
// 32 KiB of output, as winget's MSZIP writer does.
function mszip(text: string): Uint8Array {
  const data = Buffer.from(text);
  const BLOCK = 32 * 1024;
  const header = Buffer.alloc(24);
  header.write("MSZIPYML", 0, "latin1");
  header.writeBigUInt64LE(BigInt(data.length), 8);
  header.writeBigUInt64LE(BigInt(BLOCK), 16);
  const parts: Buffer[] = [header];
  for (let at = 0; at < data.length; at += BLOCK) {
    const chunk = data.subarray(at, at + BLOCK);
    const dictionary = at === 0 ? undefined : data.subarray(Math.max(0, at - BLOCK), at);
    const deflated = deflateRawSync(chunk, dictionary ? { dictionary } : {});
    const len = Buffer.alloc(4);
    len.writeUInt32LE(deflated.length + 2);
    parts.push(len, Buffer.from("CK"), deflated);
  }
  return Buffer.concat(parts);
}

const INSTALLER = Buffer.from("MZ fake portable tool\n");

type FakePackage = { id: string; name: string; versions: string[]; badHash?: boolean };

const PACKAGES: FakePackage[] = [
  { id: "Test.Tool", name: "Test Tool", versions: ["1.0.0", "1.2.0"] },
  { id: "Bad.Tool", name: "Bad Tool", versions: ["2.0.0"], badHash: true },
];

let server: ReturnType<typeof Bun.serve>;
let routes = new Map<string, Uint8Array | string>();
let manifestSha = new Map<string, string>();
const fixture = tempDir("winget-index", {});

function hash8(id: string) {
  return sha256(id).slice(0, 8);
}

function manifest(base: string, pkg: FakePackage, version: string) {
  const installerSha = sha256(INSTALLER).toUpperCase();
  const installer = (arch: string) => `  - Architecture: ${arch}
    InstallerType: portable
    InstallerUrl: ${base}/files/testtool-${arch}.exe
    InstallerSha256: ${installerSha}
    Commands:
      - testtool`;
  return `PackageIdentifier: ${pkg.id}
PackageVersion: ${version}
PackageName: ${pkg.name}
Publisher: Test Publisher
License: MIT
ShortDescription: A fake portable tool
Installers:
${["x64", "arm64", "x86"].map(installer).join("\n")}
ManifestType: merged
ManifestVersion: 1.6.0
`;
}

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const body = routes.get(new URL(req.url).pathname);
      return body === undefined ? new Response("not found", { status: 404 }) : new Response(body);
    },
  });
  const base = server.url.href.replace(/\/$/, "");

  const dbPath = join(String(fixture), "index.db");
  const db = new Database(dbPath, { create: true });
  db.run(
    "CREATE TABLE [packages](rowid INTEGER PRIMARY KEY, [id] TEXT NOT NULL, [name] TEXT NOT NULL, [moniker] TEXT, [latest_version] TEXT NOT NULL, [arp_min_version] TEXT, [arp_max_version] TEXT, [hash] BLOB)",
  );
  const insert = db.prepare("INSERT INTO packages (id, name, moniker, latest_version, hash) VALUES (?, ?, ?, ?, ?)");
  // Enough filler rows to spread the table over interior pages, plus one row
  // whose name overflows a 4 KiB page.
  db.transaction(() => {
    for (let i = 0; i < 1500; i++)
      insert.run(`Filler.Package${i}`, `Filler ${i}`, null, "1.0", Buffer.alloc(20, i % 256));
    insert.run("Filler.Overflow", Buffer.alloc(10_000, "x").toString(), null, "1.0", Buffer.alloc(20, 1));
    for (const pkg of PACKAGES) {
      insert.run(pkg.id, pkg.name, pkg.id.toLowerCase(), pkg.versions.at(-1)!, Buffer.from(sha256(pkg.id), "hex"));
    }
  })();
  insert.finalize();
  db.close();
  routes.set("/source2.msix", storedZip({ "Public/index.db": readFileSync(dbPath) }));

  for (const pkg of PACKAGES) {
    const entries: string[] = [];
    // Padding versions push versionData past one 32 KiB MSZIP block.
    for (let i = 0; i < 400; i++) {
      entries.push(`- v: 0.0.${i}\n  rP: manifests/missing/${pkg.id}/0.0.${i}.yaml\n  s256H: ${"0".repeat(64)}`);
    }
    for (const version of pkg.versions) {
      const rel = `manifests/${pkg.id[0].toLowerCase()}/${pkg.id.replace(".", "/")}/${version}/${pkg.id}.yaml`;
      const text = manifest(base, pkg, version);
      routes.set(`/${rel}`, text);
      const sha = pkg.badHash ? sha256("something else") : sha256(text);
      manifestSha.set(`${pkg.id}@${version}`, sha);
      entries.push(`- v: ${version}\n  rP: ${rel}\n  s256H: ${sha.toUpperCase()}`);
    }
    routes.set(
      `/packages/${pkg.id}/${hash8(pkg.id)}/versionData.mszyml`,
      mszip(`sV: 1.0\nvD:\n${entries.join("\n")}\n`),
    );
  }
  for (const arch of ["x64", "arm64", "x86"]) routes.set(`/files/testtool-${arch}.exe`, INSTALLER);
});

afterAll(() => {
  server?.stop(true);
  fixture[Symbol.dispose]();
});

function env(cache: string) {
  return {
    ...bunEnv,
    BUN_WINGET_SOURCE: server.url.href,
    BUN_INSTALL_CACHE_DIR: cache,
  };
}

async function bun(args: string[], cwd: string) {
  await using proc = Bun.spawn({
    cmd: [bunExe(), ...args],
    cwd,
    env: env(join(cwd, ".cache")),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

function systemBlock(lock: string) {
  const at = lock.indexOf('"system": {');
  if (at === -1) return undefined;
  return lock.slice(at, lock.indexOf("\n  },", at) + 5);
}

describe.concurrent("systemDependencies (winget)", () => {
  test("bun add, frozen install and bun remove round-trip through bun.lock", async () => {
    using dir = tempDir("winget-add", { "package.json": JSON.stringify({ name: "app" }) });
    const cwd = String(dir);

    const add = await bun(["add", "winget:Test.Tool"], cwd);
    expect(add.stderr).toContain("winget:Test.Tool");
    const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
    expect(pkg.systemDependencies).toEqual({ "winget:Test.Tool": "*" });

    const lock = readFileSync(join(cwd, "bun.lock"), "utf8");
    const block = systemBlock(lock)!;
    expect(block).toContain('"winget:Test.Tool": { "version": "1.2.0"');
    expect(block).toContain(`"hash": "sha256:${manifestSha.get("Test.Tool@1.2.0")}"`);

    const shim = join(cwd, "node_modules", ".bin", "testtool.exe");
    if (isWindows) {
      expect(existsSync(shim)).toBe(true);
      expect(existsSync(join(cwd, "node_modules", ".bin", "testtool.bunx"))).toBe(true);
      const installed = join(cwd, "node_modules", ".system", "winget", "Test.Tool", "testtool.exe");
      expect(readFileSync(installed)).toEqual(INSTALLER);
    } else {
      expect(add.stderr).toContain("skipped winget:Test.Tool: winget packages cannot be installed on this platform");
      expect(existsSync(shim)).toBe(false);
    }
    expect(add.exitCode).toBe(0);

    const frozen = await bun(["install", "--frozen-lockfile"], cwd);
    expect(frozen.exitCode).toBe(0);
    expect(readFileSync(join(cwd, "bun.lock"), "utf8")).toBe(lock);

    pkg.systemDependencies["winget:Test.Tool"] = "1.0.0";
    await Bun.write(join(cwd, "package.json"), JSON.stringify(pkg));
    const changed = await bun(["install", "--frozen-lockfile"], cwd);
    expect(changed.stderr).toContain("lockfile had changes, but lockfile is frozen");
    expect(changed.exitCode).toBe(1);

    const removed = await bun(["remove", "winget:Test.Tool"], cwd);
    expect(JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")).systemDependencies).toBeUndefined();
    // Like removing the last npm dependency, removing the last system one deletes the now-empty lockfile.
    expect(existsSync(join(cwd, "bun.lock"))).toBe(false);
    if (isWindows) {
      expect(removed.stderr).toContain("- winget:Test.Tool");
      expect(existsSync(shim)).toBe(false);
    }
    expect(removed.exitCode).toBe(0);
  });

  test("a range pins an older version and survives bun.lockb", async () => {
    using dir = tempDir("winget-range", {
      "package.json": JSON.stringify({ name: "app" }),
      "bunfig.toml": `[install]\nsaveTextLockfile = false\n`,
    });
    const cwd = String(dir);
    const add = await bun(["add", "winget:test.tool@1.0.0", "--lockfile-only"], cwd);
    expect(add.stderr).not.toContain("error:");
    expect(JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")).systemDependencies).toEqual({
      "winget:test.tool": "1.0.0",
    });
    expect(existsSync(join(cwd, "bun.lockb"))).toBe(true);
    expect(add.exitCode).toBe(0);

    const frozen = await bun(["install", "--frozen-lockfile", "--lockfile-only"], cwd);
    expect(frozen.stderr).not.toContain("lockfile had changes");
    expect(frozen.exitCode).toBe(0);

    const text = await bun(["install", "--save-text-lockfile", "--lockfile-only"], cwd);
    expect(text.exitCode).toBe(0);
    const block = systemBlock(readFileSync(join(cwd, "bun.lock"), "utf8"))!;
    expect(block).toContain('"winget:test.tool": { "version": "1.0.0", "specifier": "1.0.0"');
  });

  test("a manifest whose sha256 does not match versionData is rejected", async () => {
    using dir = tempDir("winget-bad", { "package.json": JSON.stringify({ name: "app" }) });
    const cwd = String(dir);
    const add = await bun(["add", "winget:Bad.Tool"], cwd);
    expect(add.stderr).toContain("integrity check failed for winget manifest Bad.Tool@2.0.0");
    expect(existsSync(join(cwd, "bun.lock"))).toBe(false);
    expect(add.exitCode).not.toBe(0);
  });

  test("unknown packages and malformed specifiers fail cleanly", async () => {
    using dir = tempDir("winget-missing", { "package.json": JSON.stringify({ name: "app" }) });
    const cwd = String(dir);
    const missing = await bun(["add", "winget:No.Such.Package"], cwd);
    expect(missing.stderr).toContain('winget package "No.Such.Package" was not found');
    expect(missing.exitCode).not.toBe(0);

    const bad = await bun(["add", "winget:bad id"], cwd);
    expect(bad.stderr).toContain('invalid system package "winget:bad id"');
    expect(bad.exitCode).not.toBe(0);
  });
});
