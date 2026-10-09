import { spawn } from "bun";
import { upgrade_test_helpers } from "bun:internal-for-testing";
import { describe, expect, it } from "bun:test";
import { bunExe, bunEnv as env, isMusl, isWindows, tempDir, tls, tmpdirSync } from "harness";
import { existsSync, statSync } from "node:fs";
import { copyFile, writeFile } from "node:fs/promises";
import { basename, join } from "path";
const { openTempDirWithoutSharingDelete, closeTempDirHandle } = upgrade_test_helpers;

// Cover every platform/arch/abi/cpu combination so the asset list matches
// whichever target this test runs on. Non-matching names are ignored.
function allAssetNames(profile = false) {
  const names: string[] = [];
  for (const os of ["windows", "linux", "darwin"]) {
    for (const arch of ["x64", "aarch64"]) {
      for (const abi of ["", "-musl"]) {
        for (const cpu of ["", "-baseline"]) {
          names.push(`bun-${os}-${arch}${abi}${cpu}${profile ? "-profile" : ""}.zip`);
        }
      }
    }
  }
  return names;
}

// Build a minimal ZIP archive with a single stored (uncompressed) entry.
// `unzip -o` on POSIX restores the mode from the Unix external-attrs field;
// Expand-Archive on Windows ignores it.
function makeZipStored(entryName: string, data: Buffer, unixMode: number): Buffer {
  const nameBytes = Buffer.from(entryName, "utf8");
  const crc = Bun.hash.crc32(data);
  const size = data.length;

  const lfhLen = 30 + nameBytes.length;
  const cdhLen = 46 + nameBytes.length;
  const cdOffset = lfhLen + size;

  const buf = Buffer.alloc(lfhLen + size + cdhLen + 22);
  let p = 0;
  const u16 = (v: number) => {
    buf.writeUInt16LE(v, p);
    p += 2;
  };
  const u32 = (v: number) => {
    buf.writeUInt32LE(v >>> 0, p);
    p += 4;
  };
  const raw = (b: Buffer) => {
    b.copy(buf, p);
    p += b.length;
  };

  // Local file header
  u32(0x04034b50);
  u16(20); // version needed
  u16(0); // flags
  u16(0); // method: stored
  u16(0); // mtime
  u16(0); // mdate
  u32(crc);
  u32(size);
  u32(size);
  u16(nameBytes.length);
  u16(0);
  raw(nameBytes);
  raw(data);

  // Central directory header
  u32(0x02014b50);
  u16((3 << 8) | 20); // made by: Unix, spec 2.0
  u16(20);
  u16(0);
  u16(0);
  u16(0);
  u16(0);
  u32(crc);
  u32(size);
  u32(size);
  u16(nameBytes.length);
  u16(0);
  u16(0);
  u16(0);
  u16(0);
  u32((0o100000 | unixMode) << 16);
  u32(0); // LFH offset
  raw(nameBytes);

  // End of central directory
  u32(0x06054b50);
  u16(0);
  u16(0);
  u16(1);
  u16(1);
  u32(cdhLen);
  u32(cdOffset);
  u16(0);

  return buf;
}

// Write a release zip for the current target that, once unpacked, yields an
// executable at the path `bun upgrade` verifies. On POSIX a shell script is
// enough because `unzip` preserves the mode bits; on Windows the verify step
// spawns `bun.exe` directly, so the archive has to carry a real PE image.
async function writeFakeReleaseZip(outPath: string, version: string): Promise<void> {
  const os = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "aarch64" : "x64";
  const abi = isMusl ? "-musl" : "";
  const folder = `bun-${os}-${arch}${abi}`;
  if (isWindows) {
    const exe = Buffer.from(await Bun.file(bunExe()).arrayBuffer());
    await writeFile(outPath, makeZipStored(`${folder}/bun.exe`, exe, 0o755));
  } else {
    const script = Buffer.from(`#!/bin/sh\nprintf '%s\\n' '${version}'\n`);
    await writeFile(outPath, makeZipStored(`${folder}/bun`, script, 0o755));
  }
}

type ReleaseServer = Bun.Server & { env: Record<string, string> };

function startReleaseServer(opts: {
  tagName: string;
  assetNames?: string[];
  zipPath?: string;
  zipBody?: string;
  digest?: string;
}): ReleaseServer {
  const assetNames = opts.assetNames ?? allAssetNames();
  const server = Bun.serve({
    tls: tls,
    port: 0,
    async fetch(req) {
      const { pathname } = new URL(req.url);
      if (pathname.startsWith("/download/")) {
        if (opts.zipPath) return new Response(Bun.file(opts.zipPath));
        return new Response(opts.zipBody ?? "this is not a real zip archive");
      }
      return new Response(
        JSON.stringify({
          tag_name: opts.tagName,
          assets: assetNames.map(name => ({
            url: "foo",
            content_type: "application/zip",
            name,
            ...(opts.digest ? { digest: opts.digest } : {}),
            browser_download_url: `https://${server.hostname}:${server.port}/download/${name}`,
          })),
        }),
      );
    },
  }) as ReleaseServer;
  server.env = {
    ...env,
    NODE_TLS_REJECT_UNAUTHORIZED: "0",
    GITHUB_API_DOMAIN: `${server.hostname}:${server.port}`,
    // The upgrade-failure path exits via Global::exit(1) while the HTTP
    // thread and the intentionally-leaked progress/download buffers are
    // still live; LeakSanitizer reports those at exit and abort_on_error
    // turns the clean exit(1) into SIGABRT on the ASAN lane. Leak
    // detection is not what these tests assert.
    ASAN_OPTIONS: [env.ASAN_OPTIONS, "detect_leaks=0"].filter(Boolean).join(":"),
  };
  return server;
}

describe.concurrent(() => {
  it("two invalid arguments, should display error message and suggest command", async () => {
    const cwd = tmpdirSync();
    await using proc = spawn({
      cmd: [bunExe(), "upgrade", "bun-types", "--dev"],
      cwd,
      stdout: null,
      stdin: "pipe",
      stderr: "pipe",
      env,
    });

    const err = await proc.stderr.text();
    expect(err.split(/\r?\n/)).toContain("error: This command updates Bun itself, and does not take package names.");
    expect(err.split(/\r?\n/)).toContain("note: Use `bun update bun-types --dev` instead.");
  });

  it("two invalid arguments flipped, should display error message and suggest command", async () => {
    const cwd = tmpdirSync();
    await using proc = spawn({
      cmd: [bunExe(), "upgrade", "--dev", "bun-types"],
      cwd,
      stdout: null,
      stdin: "pipe",
      stderr: "pipe",
      env,
    });

    const err = await proc.stderr.text();
    expect(err.split(/\r?\n/)).toContain("error: This command updates Bun itself, and does not take package names.");
    expect(err.split(/\r?\n/)).toContain("note: Use `bun update --dev bun-types` instead.");
  });

  it("one invalid argument, should display error message and suggest command", async () => {
    const cwd = tmpdirSync();
    await using proc = spawn({
      cmd: [bunExe(), "upgrade", "bun-types"],
      cwd,
      stdout: null,
      stdin: "pipe",
      stderr: "pipe",
      env,
    });

    const err = await proc.stderr.text();
    expect(err.split(/\r?\n/)).toContain("error: This command updates Bun itself, and does not take package names.");
    expect(err.split(/\r?\n/)).toContain("note: Use `bun update bun-types` instead.");
  });

  it("one valid argument, should succeed", async () => {
    const cwd = tmpdirSync();
    await using proc = spawn({
      cmd: [bunExe(), "upgrade", "--help"],
      cwd,
      stdout: null,
      stdin: "pipe",
      stderr: "pipe",
      env,
    });

    const err = await proc.stderr.text();
    // Should not contain error message
    expect(err.split(/\r?\n/)).not.toContain(
      "error: This command updates bun itself, and does not take package names.",
    );
    expect(err.split(/\r?\n/)).not.toContain("note: Use `bun update --help` instead.");
  });

  it("two valid arguments, should succeed", async () => {
    // `--stable --profile` are both recognised flags; argument validation must
    // let them through. The release server returns a garbage archive so the
    // upgrade fails later, after argument parsing has already accepted them.
    using server = startReleaseServer({ tagName: "bun-v9.9.9", assetNames: allAssetNames(true) });
    const cwd = tmpdirSync();
    const execPath = join(cwd, basename(bunExe()));
    await copyFile(bunExe(), execPath);
    await using proc = spawn({
      cmd: [execPath, "upgrade", "--stable", "--profile"],
      cwd,
      stdout: null,
      stdin: "pipe",
      stderr: "pipe",
      env: server.env,
    });

    const err = await proc.stderr.text();
    // Should not contain error message
    expect(err.split(/\r?\n/)).not.toContain(
      "error: This command updates Bun itself, and does not take package names.",
    );
    expect(err.split(/\r?\n/)).not.toContain("note: Use `bun update --stable --profile` instead.");
    await proc.exited;
  });
});

it("completes against a locally-served release with the system temp dir held open without FILE_SHARE_DELETE", async () => {
  // `--stable` routes through the GitHub releases API (overridable via
  // GITHUB_API_DOMAIN) instead of the compiled-in canary URL, so the whole
  // download/unpack/verify path runs against the local server. On non-canary
  // builds the current-version check short-circuits before the download,
  // which still produces no `error:` and is fine: canary covers the temp-dir
  // path on Windows.
  const version = Bun.version;
  const cwd = tmpdirSync();
  const execPath = join(cwd, basename(bunExe()));
  const zipPath = join(cwd, "release.zip");
  await Promise.all([copyFile(bunExe(), execPath), writeFakeReleaseZip(zipPath, version)]);

  using server = startReleaseServer({ tagName: `bun-v${version}`, zipPath });

  // On Windows, open the temporary directory without FILE_SHARE_DELETE before spawning
  // the upgrade process. This is to test for EBUSY errors.
  openTempDirWithoutSharingDelete();

  await using proc = Bun.spawn({
    cmd: [execPath, "upgrade", "--stable"],
    cwd,
    stdout: null,
    stdin: "pipe",
    stderr: "pipe",
    env: server.env,
  });

  const [stderr, exitCode] = await Promise.all([proc.stderr.text(), proc.exited]);
  closeTempDirHandle();

  expect(stderr).not.toContain("error:");
  // Canary builds always download (the current-version short-circuit is gated
  // on !IS_CANARY); a non-canary build whose version matches the served tag
  // takes the "already on the latest" exit instead.
  expect(stderr).toMatch(/Upgraded\.|already on the latest/);
  expect(exitCode).toBe(0);
});

it("recreates the staging directory in the temp dir instead of reusing a pre-existing one", async () => {
  const tagName = "bun-v9.9.9";
  // Simulate a directory that already exists at the predictable staging path
  // ($TMPDIR/<version>) before the upgrade runs, with content planted inside it.
  using stagingRoot = tempDir("bun-upgrade-staging", {
    "9.9.9": {
      "planted-before-upgrade.txt": "planted",
      "planted-subdir": {
        "bun": "#!/bin/sh\necho 9.9.9\n",
      },
    },
  });
  const stagingRootPath = String(stagingRoot);

  using server = startReleaseServer({ tagName });

  const cwd = tmpdirSync();
  const execPath = join(cwd, basename(bunExe()));
  await copyFile(bunExe(), execPath);

  await using proc = Bun.spawn({
    // --stable forces the GitHub-release code path (with a predictable
    // version-named staging directory) even on canary/debug builds.
    cmd: [execPath, "upgrade", "--stable"],
    cwd,
    stdout: null,
    stdin: "pipe",
    stderr: "pipe",
    env: {
      ...server.env,
      BUN_TMPDIR: stagingRootPath,
    },
  });

  const [stderr, exitCode] = await Promise.all([proc.stderr.text(), proc.exited]);

  // Sanity check: the upgrade got past the version fetch and targeted v9.9.9.
  expect(stderr).toContain("9.9.9");

  // Nothing that existed in the staging directory before the upgrade started
  // may survive into the directory the new binary is unpacked and verified in.
  expect(existsSync(join(stagingRootPath, "9.9.9", "planted-before-upgrade.txt"))).toBe(false);
  expect(existsSync(join(stagingRootPath, "9.9.9", "planted-subdir", "bun"))).toBe(false);

  if (process.platform !== "win32" && existsSync(join(stagingRootPath, "9.9.9"))) {
    // The staging directory must be freshly created with no group/other access.
    expect(statSync(join(stagingRootPath, "9.9.9")).mode & 0o077).toBe(0);
  }

  // The bogus archive must not be installed; the upgrade fails cleanly.
  expect(exitCode).toBe(1);
});

it("verifies the downloaded release archive against the digest reported by the release asset", async () => {
  const archiveBody = "this is not a real zip archive";
  const correctDigest = `sha256:${new Bun.CryptoHasher("sha256").update(archiveBody).digest("hex")}`;
  const wrongDigest = `sha256:${Buffer.alloc(32, 0xab).toString("hex")}`;

  const runUpgrade = async (tagName: string, digest: string) => {
    using server = startReleaseServer({ tagName, digest, zipBody: archiveBody });

    const cwd = tmpdirSync();
    const execPath = join(cwd, basename(bunExe()));
    await copyFile(bunExe(), execPath);

    await using proc = Bun.spawn({
      cmd: [execPath, "upgrade", "--stable"],
      cwd,
      stdout: null,
      stdin: "pipe",
      stderr: "pipe",
      env: server.env,
    });

    const [stderr, exitCode] = await Promise.all([proc.stderr.text(), proc.exited]);
    return { stderr, exitCode };
  };

  const mismatched = await runUpgrade("bun-v9.9.7", wrongDigest);
  expect(mismatched.stderr).toContain("did not match the checksum reported by the GitHub API for this release");
  expect(mismatched.exitCode).toBe(1);

  const matched = await runUpgrade("bun-v9.9.8", correctDigest);
  expect(matched.stderr).toContain("9.9.8");
  expect(matched.stderr).not.toContain("did not match the checksum reported by the GitHub API for this release");
  expect(matched.exitCode).toBe(1);
});

// Fork releases (aphrody-labs/bun): `GET /repos/<repo>/releases` lists every release of the
// repository, newest first; only non-draft, non-prerelease `aphrody-v*` tags are runtime releases.
function startForkServer(opts: {
  releases?: (origin: string) => unknown[];
  canary?: (origin: string) => unknown;
  sums?: string;
  zipBody?: string;
}) {
  const requests: { path: string; authorization: string | null }[] = [];
  const server = Bun.serve({
    tls,
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      requests.push({ path: url.pathname + url.search, authorization: req.headers.get("authorization") });
      const origin = `https://${server.hostname}:${server.port}`;
      if (url.pathname.endsWith("/SHA256SUMS.txt")) return new Response(opts.sums ?? "");
      if (url.pathname.startsWith("/download/")) return new Response(opts.zipBody ?? "not a zip");
      if (url.pathname.endsWith("/releases/tags/canary")) {
        return opts.canary ? Response.json(opts.canary(origin)) : new Response("Not Found", { status: 404 });
      }
      if (url.pathname.endsWith("/releases")) return Response.json(opts.releases?.(origin) ?? []);
      return new Response("Not Found", { status: 404 });
    },
  });
  const { GITHUB_TOKEN, GH_TOKEN, GITHUB_ACCESS_TOKEN, APHRODY_BUN_REPO, ...rest } = env;
  return {
    requests,
    env: {
      ...rest,
      NODE_TLS_REJECT_UNAUTHORIZED: "0",
      GITHUB_API_DOMAIN: `${server.hostname}:${server.port}`,
      ASAN_OPTIONS: [env.ASAN_OPTIONS, "detect_leaks=0"].filter(Boolean).join(":"),
    } as Record<string, string>,
    [Symbol.dispose]() {
      server.stop(true);
    },
  };
}

function forkRelease(origin: string, tag: string, extra: Record<string, unknown> = {}) {
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    assets: [
      ...allAssetNames().map(name => ({
        name,
        content_type: "application/zip",
        browser_download_url: `${origin}/download/${tag}/${name}`,
      })),
      {
        name: "SHA256SUMS.txt",
        content_type: "text/plain",
        browser_download_url: `${origin}/download/${tag}/SHA256SUMS.txt`,
      },
    ],
    ...extra,
  };
}

function currentZipName() {
  const os = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "aarch64" : "x64";
  return `bun-${os}-${arch}${isMusl ? "-musl" : ""}.zip`;
}

async function runForkUpgrade(args: string[], upgradeEnv: Record<string, string>) {
  const cwd = tmpdirSync();
  const execPath = join(cwd, basename(bunExe()));
  await copyFile(bunExe(), execPath);
  await using proc = Bun.spawn({
    cmd: [execPath, "upgrade", ...args],
    cwd,
    stdout: "pipe",
    stdin: "ignore",
    stderr: "pipe",
    env: upgradeEnv,
  });
  const [stdout, stderr, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

describe.concurrent("aphrody-labs/bun releases", () => {
  const zipBody = "not a zip";
  const zipSha = new Bun.CryptoHasher("sha256").update(zipBody).digest("hex");

  it("takes the newest aphrody-v release, skipping other packages, drafts and prereleases", async () => {
    using fork = startForkServer({
      zipBody,
      sums: `${"0".repeat(64)}  other.zip\n${zipSha}  ${currentZipName()}\n`,
      releases: origin => [
        { tag_name: "n2b-v0.7.1", draft: false, prerelease: false, assets: [] },
        forkRelease(origin, "aphrody-v9.9.9-aphrody.1", { draft: true }),
        forkRelease(origin, "aphrody-v9.9.9-aphrody.0", { prerelease: true }),
        forkRelease(origin, "aphrody-v9.9.8-aphrody.3"),
        forkRelease(origin, "aphrody-v9.9.8-aphrody.2"),
      ],
    });
    const { stderr, exitCode } = await runForkUpgrade(["--stable"], fork.env);
    const paths = fork.requests.map(r => r.path);
    expect(paths[0]).toBe("/repos/aphrody-labs/bun/releases?per_page=20");
    expect(paths).toContain(`/download/aphrody-v9.9.8-aphrody.3/${currentZipName()}`);
    expect(paths).toContain("/download/aphrody-v9.9.8-aphrody.3/SHA256SUMS.txt");
    expect(stderr).toContain("9.9.8-aphrody.3");
    expect(stderr).not.toContain("SHA256SUMS");
    // The served archive is not a real zip: the upgrade gets past the checksum and fails to unpack.
    expect(exitCode).toBe(1);
  });

  it("rejects an archive that does not match SHA256SUMS.txt", async () => {
    using fork = startForkServer({
      zipBody,
      sums: `${"ab".repeat(32)}  ${currentZipName()}\n`,
      releases: origin => [forkRelease(origin, "aphrody-v9.9.8-aphrody.3")],
    });
    const { stderr, exitCode } = await runForkUpgrade(["--stable"], fork.env);
    expect(stderr).toContain("does not match its SHA256SUMS.txt entry");
    expect(exitCode).toBe(1);
  });

  it("rejects a release whose SHA256SUMS.txt has no entry for the archive", async () => {
    using fork = startForkServer({
      zipBody,
      sums: `${zipSha}  bun-other-target.zip\n`,
      releases: origin => [forkRelease(origin, "aphrody-v9.9.8-aphrody.3")],
    });
    const { stderr, exitCode } = await runForkUpgrade(["--stable"], fork.env);
    expect(stderr).toContain(`SHA256SUMS.txt of release aphrody-v9.9.8-aphrody.3 has no entry for ${currentZipName()}`);
    expect(exitCode).toBe(1);
  });

  it("uses APHRODY_BUN_REPO and sends GH_TOKEN to the API only, without printing it", async () => {
    const token = "ghp_secret_token_for_upgrade_test";
    using fork = startForkServer({
      zipBody,
      sums: `${zipSha}  ${currentZipName()}\n`,
      releases: origin => [forkRelease(origin, "aphrody-v9.9.8-aphrody.3")],
    });
    const { stdout, stderr, exitCode } = await runForkUpgrade(["--stable"], {
      ...fork.env,
      APHRODY_BUN_REPO: "someone/bun-fork",
      GH_TOKEN: token,
    });
    expect(fork.requests[0]).toEqual({
      path: "/repos/someone/bun-fork/releases?per_page=20",
      authorization: `Bearer ${token}`,
    });
    expect(fork.requests.length).toBeGreaterThan(1);
    expect(fork.requests.slice(1).every(r => r.authorization === null)).toBe(true);
    expect(stdout + stderr).not.toContain(token);
    expect(exitCode).toBe(1);
  });

  it("rejects a malformed APHRODY_BUN_REPO", async () => {
    using fork = startForkServer({});
    const { stderr, exitCode } = await runForkUpgrade(["--stable"], { ...fork.env, APHRODY_BUN_REPO: "../etc" });
    expect(stderr).toContain("APHRODY_BUN_REPO must look like owner/name");
    expect(fork.requests).toEqual([]);
    expect(exitCode).toBe(1);
  });

  it("--canary explains that the repository has no canary build", async () => {
    using fork = startForkServer({});
    const { stderr, exitCode } = await runForkUpgrade(["--canary"], fork.env);
    expect(fork.requests.map(r => r.path)).toEqual(["/repos/aphrody-labs/bun/releases/tags/canary"]);
    expect(stderr).toContain("aphrody-labs/bun has no canary build of Bun");
    expect(stderr).toContain("bun upgrade --stable");
    expect(exitCode).toBe(1);
  });

  it("--canary downloads the canary release of main when it exists", async () => {
    using fork = startForkServer({
      zipBody,
      sums: `${zipSha}  ${currentZipName()}\n`,
      canary: origin => forkRelease(origin, "canary"),
    });
    const { exitCode } = await runForkUpgrade(["--canary"], fork.env);
    expect(fork.requests.map(r => r.path)).toEqual([
      "/repos/aphrody-labs/bun/releases/tags/canary",
      `/download/canary/${currentZipName()}`,
      "/download/canary/SHA256SUMS.txt",
    ]);
    expect(exitCode).toBe(1);
  });
});

describe("bun upgrade --local", () => {
  const marker = Buffer.from("\n-- bun upgrade --local test build --\n");

  // POSIX: a script stands in for the build. Windows: the verify step spawns a real PE image, so the
  // build is this bun followed by bytes the loader ignores, which identify the copy.
  async function writeLocalBuild(path: string) {
    if (isWindows) {
      await writeFile(path, Buffer.concat([Buffer.from(await Bun.file(bunExe()).arrayBuffer()), marker]));
    } else {
      await writeFile(path, `#!/bin/sh\nprintf '%s\\n' 9.9.9-local\n`, { mode: 0o755 });
    }
    return Buffer.from(await Bun.file(path).arrayBuffer());
  }

  async function upgradeLocal(installed: string, args: string[], cwd: string) {
    await using proc = Bun.spawn({
      cmd: [installed, "upgrade", "--local", ...args],
      cwd,
      env,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stderr, exitCode] = await Promise.all([proc.stderr.text(), proc.exited]);
    return { stderr, exitCode };
  }

  it("installs build/release/bun of the current directory over the running bun", async () => {
    using dir = tempDir("bun-upgrade-local", { "install/.keep": "", "checkout/build/release/.keep": "" });
    const installed = join(String(dir), "install", basename(bunExe()));
    await copyFile(bunExe(), installed);
    const build = await writeLocalBuild(
      join(String(dir), "checkout", "build", "release", isWindows ? "bun.exe" : "bun"),
    );

    const { stderr, exitCode } = await upgradeLocal(installed, [], join(String(dir), "checkout"));
    expect(stderr).toContain("Installed");
    expect(exitCode).toBe(0);
    expect(Buffer.from(await Bun.file(installed).arrayBuffer()).equals(build)).toBe(true);
    expect(existsSync(installed + ".new")).toBe(false);

    if (isWindows) {
      // The running executable was renamed aside; the next launch removes it.
      expect(existsSync(installed + ".old")).toBe(true);
      await using next = Bun.spawn({ cmd: [installed, "--version"], env, stdout: "pipe", stderr: "pipe" });
      expect(await next.exited).toBe(0);
      expect(existsSync(installed + ".old")).toBe(false);
    }
  });

  it("installs an explicit path", async () => {
    using dir = tempDir("bun-upgrade-local-path", { "install/.keep": "", "out/.keep": "" });
    const installed = join(String(dir), "install", basename(bunExe()));
    await copyFile(bunExe(), installed);
    const buildPath = join(String(dir), "out", isWindows ? "custom.exe" : "custom");
    const build = await writeLocalBuild(buildPath);

    const { stderr, exitCode } = await upgradeLocal(installed, [buildPath], String(dir));
    expect(stderr).not.toContain("does not take package names");
    expect(exitCode).toBe(0);
    expect(Buffer.from(await Bun.file(installed).arrayBuffer()).equals(build)).toBe(true);
  });

  it("fails without touching the running bun when there is no build", async () => {
    using dir = tempDir("bun-upgrade-local-missing", {});
    const installed = join(String(dir), basename(bunExe()));
    await copyFile(bunExe(), installed);
    const { stderr, exitCode } = await upgradeLocal(installed, [], String(dir));
    expect(stderr).toContain("No Bun build at");
    expect(exitCode).toBe(1);
    expect(existsSync(installed)).toBe(true);
    expect(existsSync(installed + ".old")).toBe(false);
  });
});
