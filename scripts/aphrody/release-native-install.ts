import { chmod, mkdir, stat } from "node:fs/promises";
import { delimiter, join, resolve } from "node:path";
import { hashSDKFile } from "../../packages/bun-video/src/sdk";
import { assertMediaRuntimeIdentity, mediaReleaseTarget } from "./media-release";

export type NativeGateRunner = (
  id: string,
  command: string[],
  options?: { cwd?: string; env?: Record<string, string | undefined> },
) => Promise<string>;

/** Exercise the shipped installers and native local updater using only candidate bytes. */
export async function qualifyNativeInstall(input: {
  root: string;
  scratch: string;
  target: string;
  source: string;
  version: string;
  runtime: string;
  archive: string;
  run: NativeGateRunner;
}) {
  const target = mediaReleaseTarget(input.target);
  const windows = target.os === "windows";
  const installedRoot = join(input.scratch, "install");
  await mkdir(installedRoot, { recursive: true });
  const installed = join(installedRoot, "bin", windows ? "bun.exe" : "bun");
  const candidateHash = await hashSDKFile(input.runtime);
  const archiveHash = await hashSDKFile(input.archive);
  const tag = `${input.version.includes("-aphrody.") ? "aphrody-v" : "bun-v"}${input.version}`;
  const archiveName = `${target.triplet}.zip`;
  const env = {
    ...process.env,
    HOME: installedRoot,
    USERPROFILE: installedRoot,
    BUN_INSTALL: installedRoot,
    GH_TOKEN: undefined,
    GITHUB_TOKEN: undefined,
    TYPESAFE_API_KEY: undefined,
    TYPESAFE_API_KEY_FILE: undefined,
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0",
  };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === `/${tag}/${archiveName}`) return new Response(Bun.file(input.archive));
      if (path === `/${tag}/SHA256SUMS.txt`) return new Response(`${archiveHash}  ${archiveName}\n`);
      return new Response("No fixture", { status: 404 });
    },
  });
  try {
    const installEnv = { ...env, APHRODY_BUN_DIST: server.url.origin };
    const command = windows
      ? [
          "pwsh",
          "-NoProfile",
          "-NonInteractive",
          "-File",
          join(input.root, "scripts/aphrody/install.ps1"),
          "-Version",
          tag,
          "-Flavor",
          "full",
          "-BinDir",
          join(installedRoot, "bin"),
          "-NoPathUpdate",
        ]
      : ["bash", join(input.root, "scripts/aphrody/install.sh"), tag, "full"];
    await input.run("native-install", command, { cwd: installedRoot, env: installEnv });
    if ((await hashSDKFile(installed)) !== candidateHash) throw new Error("Installer changed candidate bytes");
    if (!windows) await chmod(installed, 0o755);
    const probe =
      "console.log(JSON.stringify({version:Bun.version,revision:Bun.revision,platform:process.platform,arch:process.arch,path:process.execPath}))";
    const pathResult = JSON.parse(
      await input.run("native-path", ["bun", "--no-env-file", "-e", probe], {
        cwd: installedRoot,
        env: { ...env, PATH: `${join(installedRoot, "bin")}${delimiter}${process.env.PATH ?? ""}` },
      }),
    );
    assertMediaRuntimeIdentity(pathResult, input.source, input.target);
    if (
      (windows ? resolve(pathResult.path).toLowerCase() : resolve(pathResult.path)) !==
      (windows ? resolve(installed).toLowerCase() : resolve(installed))
    )
      throw new Error("Fresh PATH lookup did not execute the installed candidate");
    const before = await stat(installed);
    const update = await input.run("native-update", [installed, "upgrade", "--no-env-file", "--local", input.runtime], {
      cwd: installedRoot,
      env,
    });
    if (!update.includes("Installed") || (await hashSDKFile(installed)) !== candidateHash)
      throw new Error("Native local update did not install exact candidate bytes");
    const identity = JSON.parse(
      await input.run("native-update-identity", [installed, "--no-env-file", "-e", probe], { cwd: installedRoot, env }),
    );
    assertMediaRuntimeIdentity(identity, input.source, input.target);
    const after = await stat(installed);
    if (before.ino !== 0 && before.ino === after.ino)
      throw new Error("Native local updater retained the original installation file");
  } finally {
    server.stop(true);
  }
}

/** This changes only a unique candidate package on an ephemeral hosted Windows runner. */
export async function qualifyNativeWinget(input: {
  root: string;
  scratch: string;
  target: string;
  source: string;
  version: string;
  runtime: string;
  archive: string;
  run: NativeGateRunner;
}) {
  const target = mediaReleaseTarget(input.target);
  if (process.platform !== "win32" || target.os !== "windows" || process.arch !== target.runtimeArch)
    throw new Error("Winget qualification requires matching native Windows execution");
  if (process.env.GITHUB_ACTIONS !== "true" || process.env.RUNNER_ENVIRONMENT !== "github-hosted")
    throw new Error("Winget install fixture belongs to an ephemeral GitHub-hosted runner");
  if (!Bun.which("winget")) throw new Error("Native Winget client is missing from the hosted runner");
  const id = `Aphrody.NativeQualification${input.source.slice(0, 12)}`;
  const location = join(input.scratch, "winget");
  const archiveHash = await hashSDKFile(input.archive);
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(Bun.file(input.archive)) });
  const manifest = {
    PackageIdentifier: id,
    PackageVersion: input.version,
    PackageLocale: "en-US",
    Publisher: "Aphrody",
    PackageName: "Bun native candidate qualification",
    License: "MIT",
    ShortDescription: "Exact source candidate fixture",
    Installers: [
      {
        Architecture: target.runtimeArch,
        InstallerType: "zip",
        NestedInstallerType: "portable",
        NestedInstallerFiles: [
          { RelativeFilePath: `${target.triplet}/bun.exe`, PortableCommandAlias: "bun-native-qualification" },
        ],
        Scope: "user",
        InstallerUrl: `${server.url.origin}/${target.triplet}.zip`,
        InstallerSha256: archiveHash,
      },
    ],
    ManifestType: "singleton",
    ManifestVersion: "1.10.0",
  };
  const path = join(input.scratch, "winget.yaml");
  await Bun.write(path, Bun.YAML.stringify(manifest));
  let attempted = false;
  try {
    await input.run("winget-manifest", ["winget", "validate", "--manifest", path, "--disable-interactivity"]);
    await input.run("winget-local-manifest-enable", [
      "winget",
      "settings",
      "--enable",
      "LocalManifestFiles",
      "--disable-interactivity",
    ]);
    attempted = true;
    await input.run("winget-install", [
      "winget",
      "install",
      "--manifest",
      path,
      "--scope",
      "user",
      "--location",
      location,
      "--silent",
      "--disable-interactivity",
      "--accept-package-agreements",
    ]);
    const files = [...new Bun.Glob("**/bun.exe").scanSync({ cwd: location, onlyFiles: true })];
    if (files.length !== 1 || (await hashSDKFile(join(location, files[0]!))) !== (await hashSDKFile(input.runtime)))
      throw new Error("Winget did not install the exact candidate executable");
    const identity = JSON.parse(
      await input.run("winget-identity", [
        join(location, files[0]!),
        "-e",
        "console.log(JSON.stringify({version:Bun.version,revision:Bun.revision,platform:process.platform,arch:process.arch}))",
      ]),
    );
    assertMediaRuntimeIdentity(identity, input.source, input.target);
  } finally {
    try {
      if (attempted)
        await input.run("winget-uninstall", [
          "winget",
          "uninstall",
          "--id",
          id,
          "--exact",
          "--silent",
          "--disable-interactivity",
        ]);
    } finally {
      server.stop(true);
      await input.run("winget-local-manifest-disable", [
        "winget",
        "settings",
        "--disable",
        "LocalManifestFiles",
        "--disable-interactivity",
      ]);
    }
  }
}
