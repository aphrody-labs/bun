import { spawn } from "bun";
import { upgrade_test_helpers } from "bun:internal-for-testing";
import { beforeAll, describe, expect, it } from "bun:test";
import {
  bunExe,
  bunEnv as env,
  isDebug,
  isMusl,
  isWindows,
  normalizeBunSnapshot,
  tempDir,
  tls,
  tmpdirSync,
} from "harness";
import { existsSync, readdirSync, statSync } from "node:fs";
import { copyFile, link, realpath, writeFile } from "node:fs/promises";
import { basename, join } from "path";
describe.skipIf(!isWindows)("Aphrody bootstrap integrity", () => {
  for (const mode of [
    "missing",
    "mismatch",
    "duplicate",
    "wrong-name",
    "invalid-runtime",
    "wrong-version",
    "alias-failure",
    "valid",
    "private-valid",
    "private-missing",
    "private-duplicate",
    "private-url",
  ]) {
    it(
      mode,
      async () => {
        const candidate = process.env.BUN_TEST_BOOTSTRAP_RELEASE_PATH ?? Bun.which("bun");
        if (!candidate) throw new Error("A qualified release runtime is required for installer fixtures");
        const versionProbe = Bun.spawnSync([candidate, "--version"], {
          env,
          stdout: "pipe",
          stderr: "pipe",
        });
        const candidateVersion = versionProbe.stdout.toString().trim();
        expect(versionProbe.exitCode).toBe(0);
        expect(candidateVersion).toMatch(/^\d+\.\d+\.\d+(?:-aphrody\.\d+)?$/);
        const selectedTag = `${candidateVersion.includes("-aphrody.") ? "aphrody-v" : "bun-v"}${candidateVersion}`;
        using directory = tempDir("fork-bootstrap", {
          "bin/bun.exe": "previous runtime",
          "bin/bunx.exe": "previous alias",
          "bootstrap.ps1": `param([string]$Installer, [string]$Root, [string]$Candidate, [string]$Mode, [string]$ReleaseTag)
$ErrorActionPreference = "Stop"
function Get-CimInstance { @{ OSArchitecture = "x64" } }
function Invoke-RestMethod {
  param($Headers, [string]$Uri)
  $Assets = @(
    @{ name = "bun-windows-x64.zip"; url = "https://api.github.com/repos/aphrody-labs/bun/releases/assets/1" },
    @{ name = "SHA256SUMS.txt"; url = "https://api.github.com/repos/aphrody-labs/bun/releases/assets/2" }
  )
  if ($Mode -eq "private-missing") { $Assets = @($Assets[1]) }
  if ($Mode -eq "private-duplicate") { $Assets += $Assets[0] }
  if ($Mode -eq "private-url") { $Assets[0].url = "https://foreign.invalid/releases/assets/1" }
  @{ assets = $Assets }
}
function Invoke-WebRequest {
  param([string]$Uri, [string]$OutFile, $Headers)
  if ($Mode.StartsWith("private-")) {
    if ($Headers.Accept -ne "application/octet-stream" -or $Headers.Authorization -ne "Bearer fixture-token") { throw "invalid authenticated asset headers" }
    if (-not $Uri.StartsWith("https://api.github.com/repos/aphrody-labs/bun/releases/assets/")) { throw "foreign asset request" }
    Set-Content -LiteralPath (Join-Path $Root "requested") -Value "yes"
  }
  if ($Uri.EndsWith("SHA256SUMS.txt") -or $Uri.EndsWith("/2")) {
    if ($Mode -eq "missing") { throw "missing fixture" }
    $Hash = (Get-FileHash -Algorithm SHA256 (Join-Path (Split-Path $OutFile) "bun-windows-x64.zip")).Hash
    if ($Mode -eq "mismatch") { $Hash = "0" * 64 }
    $Name = if ($Mode -eq "wrong-name") { "bun-windows-x64azip" } else { "bun-windows-x64.zip" }
    $Rows = "$Hash  $Name"
    if ($Mode -eq "duplicate") { $Rows += "\n$Rows" }
    Set-Content -LiteralPath $OutFile -Value $Rows
  } else { Set-Content -LiteralPath $OutFile -Value "fixture archive" }
}
function Expand-Archive {
  param([switch]$Force, [string]$Path, [string]$DestinationPath)
  Set-Content -LiteralPath (Join-Path $Root "expanded") -Value "yes"
  $Directory = Join-Path $DestinationPath "bun-windows-x64"
  Microsoft.PowerShell.Management\\New-Item -ItemType Directory -Path $Directory | Out-Null
  if ($Mode -eq "invalid-runtime") { Set-Content -LiteralPath (Join-Path $Directory "bun.exe") -Value "invalid executable" }
  else { Copy-Item -LiteralPath $Candidate -Destination (Join-Path $Directory "bun.exe") }
}
function New-Item {
  [CmdletBinding()] param([string]$ItemType, [string]$Path, [switch]$Force, [string]$Target)
  if ($ItemType -eq "HardLink" -and $Mode -eq "alias-failure") { throw "fixture alias failure" }
  Microsoft.PowerShell.Management\\New-Item @PSBoundParameters
}
$SelectedTag = if ($Mode -eq "wrong-version") { "bun-v1.4.5" } else { $ReleaseTag }
& $Installer -Version $SelectedTag -BinDir (Join-Path $Root "bin") -NoPathUpdate
`,
        });
        const root = String(directory);
        const shell =
          Bun.which("pwsh") ?? join(process.env.SystemRoot!, "System32/WindowsPowerShell/v1.0/powershell.exe");
        await using child = spawn({
          cmd: [
            shell,
            "-NoProfile",
            "-NonInteractive",
            "-File",
            join(root, "bootstrap.ps1"),
            "-Installer",
            join(import.meta.dir, "../../../scripts/aphrody/install.ps1"),
            "-Root",
            root,
            "-Candidate",
            candidate,
            "-Mode",
            mode,
            "-ReleaseTag",
            selectedTag,
          ],
          env: {
            ...env,
            APHRODY_BUN_REPO: "aphrody-labs/bun",
            GITHUB_TOKEN: mode.startsWith("private-") ? "fixture-token" : undefined,
            GH_TOKEN: undefined,
          },
          stdout: "pipe",
          stderr: "pipe",
        });
        const [stdout, stderr, exitCode] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
        if (mode === "valid" || mode === "private-valid") {
          expect({ stdout, stderr }).toEqual({
            stdout: expect.stringContaining(`Installed ${selectedTag}`),
            stderr: "",
          });
          expect(Bun.file(join(root, "bin/bun.exe")).size).toBe(Bun.file(candidate).size);
          expect(Bun.file(join(root, "bin/bunx.exe")).size).toBe(Bun.file(candidate).size);
          expect(exitCode).toBe(0);
        } else {
          expect(stderr).not.toBe("");
          if (mode === "wrong-version") expect(stderr).toContain("version does not match the selected release");
          expect(await Bun.file(join(root, "bin/bun.exe")).text()).toBe("previous runtime");
          expect(await Bun.file(join(root, "bin/bunx.exe")).text()).toBe("previous alias");
          if (["missing", "mismatch", "duplicate", "wrong-name"].includes(mode)) {
            expect(existsSync(join(root, "expanded"))).toBe(false);
            expect(stderr).toMatch(/checksums are required|checksum mismatch|exactly once/);
          }
          if (["private-missing", "private-duplicate", "private-url"].includes(mode)) {
            expect(existsSync(join(root, "expanded"))).toBe(false);
            expect(existsSync(join(root, "requested"))).toBe(false);
            expect(stderr).toMatch(/exactly one asset|selected repository/);
          }
          expect(exitCode).not.toBe(0);
        }
      },
      15000,
    );
  }
  it("authenticated bootstrap transport drops credentials on redirects", async () => {
    const authorization: (string | null)[] = [];
    const destination = Bun.serve({
      port: 0,
      fetch(request) {
        authorization.push(request.headers.get("authorization"));
        return new Response("asset");
      },
    });
    const origin = Bun.serve({
      port: 0,
      fetch(request) {
        authorization.push(request.headers.get("authorization"));
        return Response.redirect(destination.url.toString(), 302);
      },
    });
    try {
      const shell =
        Bun.which("pwsh") ?? join(process.env.SystemRoot!, "System32/WindowsPowerShell/v1.0/powershell.exe");
      await using child = spawn({
        cmd: [
          shell,
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `$ErrorActionPreference = "Stop"; $ProgressPreference = "SilentlyContinue"; Invoke-WebRequest -UseBasicParsing -Uri "${origin.url}" -Headers @{ Authorization = "Bearer fixture-token"; Accept = "application/octet-stream" } | Out-Null`,
        ],
        env,
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, exitCode] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
      expect(stdout).toBe("");
      expect(stderr).toBe("");
      expect(authorization).toEqual(["Bearer fixture-token", null]);
      expect(exitCode).toBe(0);
    } finally {
      await origin.stop(true);
      await destination.stop(true);
    }
  });
});

const { openTempDirWithoutSharingDelete, closeTempDirHandle } = upgrade_test_helpers;

// The asset `bun upgrade` picks for the build this test runs (target, ABI and
// feature flavor), and the folder inside it.
const releaseAsset = upgrade_test_helpers.zipFilename;
const releaseFolder = releaseAsset.slice(0, -".zip".length);

// Last line `bun upgrade` prints when the downloaded archive is not a zip. On
// POSIX `unzip` rejects it; on Windows Expand-Archive's failure is only noticed
// when the executable it should have produced is missing.
const unpackFailure = isWindows ? "error: Failed to verify Bun (code: ENOENT)\n" : "Unzip failed (exit code: 9)\n";

// `bun upgrade` swaps out the executable it runs as, so the release flows run a
// stand-in in a temp dir instead of bunExe() itself. A hard link is enough: the
// upgrade only renames directory entries (POSIX swaps the staged file in,
// Windows renames the old image to `<name>.outdated`), so bunExe() is never
// modified through the link. Unlike a copy, a link is not a new file, so
// Windows does not re-scan the 80+ MB image on first launch (about 2.4s per
// copy on the arm64 lane). A temp dir on another volume falls back to a copy.
async function installStandIn(dir: string): Promise<string> {
  const execPath = join(dir, basename(bunExe()));
  try {
    await link(await realpath(bunExe()), execPath);
  } catch {
    await copyFile(bunExe(), execPath);
  }
  return execPath;
}

// The flows that are expected to fail never reach the swap, so they all share
// one stand-in.
let standInDir: string;
let standInExe: string;
beforeAll(async () => {
  standInDir = tmpdirSync();
  standInExe = await installStandIn(standInDir);
});

// Every release flow prints one line naming the version bun decided to install.
// Canary builds (CI and `bun bd`) word it as a downgrade; release builds
// announce the new version. It is not necessarily the first line: when the
// version fetch takes longer than the progress bar's delay (a loaded machine
// running a debug build), a "Fetching version tags" line precedes it on POSIX.
function expectTargetsRelease(stderr: string, version: string) {
  expect(stderr.split("\n")).toContainAnyValues([
    `Downgrading from Bun ${Bun.version}-canary to Bun v${version}`,
    `Bun v${version} is out! You're on v${Bun.version}`,
  ]);
}

function fakeReleaseScript(version: string): string {
  return `#!/bin/sh\nprintf '%s\\n' '${version}'\n`;
}

// Cover every platform/arch/abi/cpu combination so the asset list matches
// whichever target this test runs on. Non-matching names are ignored.
function allAssetNames(profile = false) {
  const names: string[] = [];
  for (const os of ["windows", "linux", "darwin"]) {
    for (const arch of ["x64", "aarch64"]) {
      for (const abi of ["", "-musl"]) {
        for (const flavor of ["", "-full", "-baseline"]) {
          names.push(`bun-${os}-${arch}${abi}${flavor}${profile ? "-profile" : ""}.zip`);
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
  if (isWindows) {
    const exe = Buffer.from(await Bun.file(bunExe()).arrayBuffer());
    await writeFile(outPath, makeZipStored(`${releaseFolder}/bun.exe`, exe, 0o755));
  } else {
    const script = Buffer.from(fakeReleaseScript(version));
    await writeFile(outPath, makeZipStored(`${releaseFolder}/bun`, script, 0o755));
  }
}

type ReleaseServer = Bun.Server<undefined> & { env: Record<string, string> };

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
      stdout: "pipe",
      stdin: "pipe",
      stderr: "pipe",
      env,
    });

    const [out, err, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    expect(out).toBe("");
    expect(normalizeBunSnapshot(err)).toMatchInlineSnapshot(`
      "error: This command updates Bun itself, and does not take package names.
      note: Use \`bun update bun-types --dev\` instead."
    `);
    expect(exitCode).toBe(1);
  });

  it("two invalid arguments flipped, should display error message and suggest command", async () => {
    const cwd = tmpdirSync();
    await using proc = spawn({
      cmd: [bunExe(), "upgrade", "--dev", "bun-types"],
      cwd,
      stdout: "pipe",
      stdin: "pipe",
      stderr: "pipe",
      env,
    });

    const [out, err, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    expect(out).toBe("");
    expect(normalizeBunSnapshot(err)).toMatchInlineSnapshot(`
      "error: This command updates Bun itself, and does not take package names.
      note: Use \`bun update --dev bun-types\` instead."
    `);
    expect(exitCode).toBe(1);
  });

  it("one invalid argument, should display error message and suggest command", async () => {
    const cwd = tmpdirSync();
    await using proc = spawn({
      cmd: [bunExe(), "upgrade", "bun-types"],
      cwd,
      stdout: "pipe",
      stdin: "pipe",
      stderr: "pipe",
      env,
    });

    const [out, err, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    expect(out).toBe("");
    expect(normalizeBunSnapshot(err)).toMatchInlineSnapshot(`
      "error: This command updates Bun itself, and does not take package names.
      note: Use \`bun update bun-types\` instead."
    `);
    expect(exitCode).toBe(1);
  });

  it("one valid argument, should succeed", async () => {
    const cwd = tmpdirSync();
    await using proc = spawn({
      cmd: [bunExe(), "upgrade", "--help"],
      cwd,
      stdout: "pipe",
      stdin: "pipe",
      stderr: "pipe",
      env,
    });

    const [out, err, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    expect(out).toStartWith("Usage: bun upgrade [flags]\n");
    expect(err).toBe("");
    expect(exitCode).toBe(0);
  });

  it("takes the flags that choose the CA store", async () => {
    // With `--stable`, an upgrade that goes ahead asks the local server.
    using server = startReleaseServer({ tagName: "bun-v9.9.9" });
    using stagingRoot = tempDir("bun-upgrade-ca-store", {});
    await using proc = spawn({
      cmd: [standInExe, "upgrade", "--stable", "--use-openssl-ca", "--use-bundled-ca"],
      cwd: standInDir,
      stdout: "pipe",
      stdin: "pipe",
      stderr: "pipe",
      env: { ...server.env, BUN_TMPDIR: String(stagingRoot) },
    });

    const [out, err, exitCode] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);
    expect(out).toBe("");
    expect(err).toBe("error: choose exactly one of --use-system-ca, --use-openssl-ca, or --use-bundled-ca\n");
    expect(exitCode).toBe(1);
  });

  it("two valid arguments, should succeed", async () => {
    // `--stable --profile` are both recognised flags; argument validation must
    // let them through. Only profile assets are served, so reaching the version
    // announcement also proves `--profile` was honored. The archive is garbage,
    // so the upgrade fails later, after argument parsing has accepted the flags.
    using server = startReleaseServer({ tagName: "bun-v9.9.9", assetNames: allAssetNames(true) });
    using stagingRoot = tempDir("bun-upgrade-args", {});
    await using proc = spawn({
      cmd: [standInExe, "upgrade", "--stable", "--profile"],
      cwd: standInDir,
      stdout: null,
      stdin: "pipe",
      stderr: "pipe",
      env: { ...server.env, BUN_TMPDIR: String(stagingRoot) },
    });

    const [err, exitCode] = await Promise.all([proc.stderr.text(), proc.exited]);
    expect(err).not.toContain("does not take package names");
    expectTargetsRelease(err, "9.9.9");
    expect(err).toEndWith(unpackFailure);
    expect(exitCode).toBe(1);
  });
});

it.concurrent("completes against a locally-served release with the system temp dir held open without FILE_SHARE_DELETE", async () => {
  // `--stable` routes through the GitHub releases API (overridable via
  // GITHUB_API_DOMAIN) instead of the compiled-in canary URL, so the whole
  // download/unpack/verify/swap path runs against the local server. This flow
  // really swaps the executable, so it gets a stand-in of its own. The staging
  // directory must stay in the default temp dir: that is the directory held
  // open below.
  const version = Bun.version;
  const exeName = basename(bunExe());
  const installDir = tmpdirSync();
  const zipPath = join(tmpdirSync(), "release.zip");
  const [execPath] = await Promise.all([installStandIn(installDir), writeFakeReleaseZip(zipPath, version)]);

  using server = startReleaseServer({ tagName: `bun-v${version}`, zipPath });

  // On Windows, open the temporary directory without FILE_SHARE_DELETE before spawning
  // the upgrade process. This is to test for EBUSY errors.
  openTempDirWithoutSharingDelete();

  await using proc = Bun.spawn({
    cmd: [execPath, "upgrade", "--stable"],
    cwd: installDir,
    stdout: null,
    stdin: "pipe",
    stderr: "pipe",
    env: server.env,
  });

  const [stderr, exitCode] = await Promise.all([proc.stderr.text(), proc.exited]);
  closeTempDirHandle();

  if (stderr.includes("Congrats!")) {
    // A non-canary build is "already on" the version the server advertises
    // (its own) and stops before the download, so nothing may have changed.
    expect(stderr).toEndWith(`Congrats! You're already on the latest version of Bun (which is v${version})\n`);
    expect(readdirSync(installDir)).toEqual([exeName]);
  } else {
    expectTargetsRelease(stderr, version);
    expect(stderr).toEndWith(
      ` Upgraded.\n\nWelcome to Bun v${version}!\n\nWhat's new in Bun v${version}:\n\n    https://bun.com/blog/release-notes/bun-v${version}\n\nReport any bugs:\n\n    https://github.com/oven-sh/bun/issues\n\nCommit log:\n\n    https://github.com/oven-sh/bun/compare/bun-v${Bun.version}...bun-v${version}\n`,
    );
    if (isWindows) {
      // A running image cannot be deleted, so the old one is parked as
      // `.outdated`. The upgrade then ran `completions` with the installed
      // executable, which recreates the bunx hard link next to itself.
      expect(readdirSync(installDir).sort()).toEqual(
        [exeName, `${exeName}.outdated`, isDebug ? "bunx-debug.exe" : "bunx.exe"].sort(),
      );
    } else {
      expect(readdirSync(installDir)).toEqual([exeName]);
      expect(await Bun.file(execPath).text()).toBe(fakeReleaseScript(version));
    }
  }
  expect(exitCode).toBe(0);
});

it.concurrent("recreates the staging directory in the temp dir instead of reusing a pre-existing one", async () => {
  const tagName = "bun-v9.9.9";
  // Simulate a directory that already exists at the predictable staging path
  // ($TMPDIR/<version>) before the upgrade runs, with content planted inside it.
  using stagingRoot = tempDir("bun-upgrade-staging", {
    "9.9.9": {
      "planted-before-upgrade.txt": "planted",
      "planted-subdir": {
        bun: "#!/bin/sh\necho 9.9.9\n",
      },
    },
  });
  const stagingRootPath = String(stagingRoot);

  using server = startReleaseServer({ tagName });

  await using proc = Bun.spawn({
    // --stable forces the GitHub-release code path (with a predictable
    // version-named staging directory) even on canary/debug builds.
    cmd: [standInExe, "upgrade", "--stable"],
    cwd: standInDir,
    stdout: null,
    stdin: "pipe",
    stderr: "pipe",
    env: {
      ...server.env,
      BUN_TMPDIR: stagingRootPath,
    },
  });

  const [stderr, exitCode] = await Promise.all([proc.stderr.text(), proc.exited]);

  // The upgrade targeted v9.9.9 and got as far as unpacking into the staging
  // directory, where the bogus archive made it fail.
  expectTargetsRelease(stderr, "9.9.9");
  expect(stderr).toEndWith(unpackFailure);

  // Nothing that existed in the staging directory before the upgrade started
  // may survive into the directory the new binary is unpacked and verified in.
  // The failed unpack leaves nothing behind either: bun removes its own
  // download (bun.zip) again.
  expect(readdirSync(join(stagingRootPath, "9.9.9"))).toEqual([]);

  if (!isWindows) {
    // The staging directory must be freshly created with no group/other
    // access. The planted one was created with the default mode, so a reused
    // directory fails here.
    expect(statSync(join(stagingRootPath, "9.9.9")).mode & 0o077).toBe(0);
  }

  // The bogus archive must not be installed; the upgrade fails cleanly.
  expect(exitCode).toBe(1);
});

it.concurrent("verifies the downloaded release archive against the digest reported by the release asset", async () => {
  const archiveBody = "this is not a real zip archive";
  const correctDigest = `sha256:${new Bun.CryptoHasher("sha256").update(archiveBody).digest("hex")}`;
  const wrongDigest = `sha256:${Buffer.alloc(32, 0xab).toString("hex")}`;

  const runUpgrade = async (tagName: string, digest: string) => {
    using server = startReleaseServer({ tagName, digest, zipBody: archiveBody });
    using stagingRoot = tempDir("bun-upgrade-digest", {});

    await using proc = Bun.spawn({
      cmd: [standInExe, "upgrade", "--stable"],
      cwd: standInDir,
      stdout: null,
      stdin: "pipe",
      stderr: "pipe",
      env: { ...server.env, BUN_TMPDIR: String(stagingRoot) },
    });

    const [stderr, exitCode] = await Promise.all([proc.stderr.text(), proc.exited]);
    return {
      stderr,
      exitCode,
      // Returns whatever the upgrade staged before it gave up.
      staged: readdirSync(String(stagingRoot)),
      downloadUrl: `https://${server.hostname}:${server.port}/download/${releaseAsset}`,
    };
  };

  const [mismatched, matched] = await Promise.all([
    runUpgrade("bun-v9.9.7", wrongDigest),
    runUpgrade("bun-v9.9.8", correctDigest),
  ]);

  expectTargetsRelease(mismatched.stderr, "9.9.7");
  expect(mismatched.stderr).toEndWith(
    `error: The file downloaded from ${mismatched.downloadUrl} did not match the checksum reported by the GitHub API for this release.\n` +
      "note: run bun upgrade again to retry the download\n",
  );
  // Rejected before anything was written to disk.
  expect(mismatched.staged).toEqual([]);
  expect(mismatched.exitCode).toBe(1);

  expectTargetsRelease(matched.stderr, "9.9.8");
  // With a matching digest the archive is accepted and staged; this run only
  // fails afterwards because the body is not a zip.
  expect(matched.stderr).not.toContain("did not match the checksum");
  expect(matched.stderr).toEndWith(unpackFailure);
  expect(matched.staged).toEqual(["9.9.8"]);
  expect(matched.exitCode).toBe(1);
});

// Fork releases (aphrody-labs/bun): `GET /repos/<repo>/releases` lists every release of the
// repository, newest first, paged by `per_page`/`page`; only non-draft, non-prerelease `bun-v*` and
// `aphrody-v*` tags are runtime releases.
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
      requests.push({
        path: url.pathname + url.search,
        authorization: req.headers.get("authorization"),
      });
      const origin = `https://${server.hostname}:${server.port}`;
      if (url.pathname.endsWith("/SHA256SUMS.txt")) return new Response(opts.sums ?? "");
      if (url.pathname.startsWith("/download/")) return new Response(opts.zipBody ?? "not a zip");
      if (url.pathname.endsWith("/releases/tags/canary")) {
        return opts.canary ? Response.json(opts.canary(origin)) : new Response("Not Found", { status: 404 });
      }
      if (url.pathname.endsWith("/releases")) {
        const perPage = Number(url.searchParams.get("per_page") ?? 30);
        const page = Number(url.searchParams.get("page") ?? 1);
        return Response.json((opts.releases?.(origin) ?? []).slice((page - 1) * perPage, page * perPage));
      }
      return new Response("Not Found", { status: 404 });
    },
  });
  const {
    GITHUB_TOKEN: _githubToken,
    GH_TOKEN: _ghToken,
    GITHUB_ACCESS_TOKEN: _githubAccessToken,
    APHRODY_BUN_REPO: _bunRepo,
    ...rest
  } = env;
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
  return releaseAsset;
}

async function runForkUpgrade(args: string[], upgradeEnv: Record<string, string>) {
  const cwd = tmpdirSync();
  const execPath = await installStandIn(cwd);
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

  it("takes the newest bun-v stable release, skipping other packages, drafts and prereleases", async () => {
    using fork = startForkServer({
      zipBody,
      sums: `${"0".repeat(64)}  other.zip\n${zipSha}  ${currentZipName()}\n`,
      releases: origin => [
        { tag_name: "n2b-v0.7.1", draft: false, prerelease: false, assets: [] },
        forkRelease(origin, "bun-v9.9.9", { draft: true }),
        forkRelease(origin, "aphrody-v9.9.9-aphrody.0", { prerelease: true }),
        forkRelease(origin, "bun-v9.9.8"),
        forkRelease(origin, "aphrody-v9.9.8-aphrody.2"),
      ],
    });
    const { stderr, exitCode } = await runForkUpgrade(["--stable"], fork.env);
    const paths = fork.requests.map(r => r.path);
    expect(paths[0]).toBe("/repos/aphrody-labs/bun/releases?per_page=100&page=1");
    expect(paths).toContain(`/download/bun-v9.9.8/${currentZipName()}`);
    expect(paths).toContain("/download/bun-v9.9.8/SHA256SUMS.txt");
    expect(stderr).toContain("9.9.8");
    expect(stderr).not.toContain("SHA256SUMS");
    // The served archive is not a real zip: the upgrade gets past the checksum and fails to unpack.
    expect(exitCode).toBe(1);
  });

  it("pages past per-commit prereleases to the stable release", async () => {
    using fork = startForkServer({
      zipBody,
      sums: `${zipSha}  ${currentZipName()}\n`,
      releases: origin => [
        ...Array.from({ length: 105 }, (_, i) =>
          forkRelease(origin, `main-runtime-${i.toString(16).padStart(12, "0")}`, { prerelease: true }),
        ),
        forkRelease(origin, "bun-v9.9.8"),
      ],
    });
    const { stderr, exitCode } = await runForkUpgrade(["--stable"], fork.env);
    const paths = fork.requests.map(r => r.path);
    expect(paths.slice(0, 2)).toEqual([
      "/repos/aphrody-labs/bun/releases?per_page=100&page=1",
      "/repos/aphrody-labs/bun/releases?per_page=100&page=2",
    ]);
    expect(paths).toContain(`/download/bun-v9.9.8/${currentZipName()}`);
    expect(stderr).toContain("9.9.8");
    expect(exitCode).toBe(1);
  });

  it("reports a repository without a runtime release after its last page", async () => {
    using fork = startForkServer({
      releases: origin => [forkRelease(origin, "main-runtime-000000000000", { prerelease: true })],
    });
    const { stderr, exitCode } = await runForkUpgrade(["--stable"], fork.env);
    expect(fork.requests.map(r => r.path)).toEqual(["/repos/aphrody-labs/bun/releases?per_page=100&page=1"]);
    expect(stderr).toContain("has no published Bun release (tag bun-v* or aphrody-v*)");
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
      path: "/repos/someone/bun-fork/releases?per_page=100&page=1",
      authorization: `Bearer ${token}`,
    });
    expect(fork.requests.length).toBeGreaterThan(1);
    expect(fork.requests.slice(1).every(r => r.authorization === null)).toBe(true);
    expect(stdout + stderr).not.toContain(token);
    expect(exitCode).toBe(1);
  });

  it("rejects a malformed APHRODY_BUN_REPO", async () => {
    using fork = startForkServer({});
    const { stderr, exitCode } = await runForkUpgrade(["--stable"], {
      ...fork.env,
      APHRODY_BUN_REPO: "../etc",
    });
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
    using dir = tempDir("bun-upgrade-local", {
      "install/.keep": "",
      "checkout/build/release/.keep": "",
    });
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
      await using next = Bun.spawn({
        cmd: [installed, "--version"],
        env,
        stdout: "pipe",
        stderr: "pipe",
      });
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
