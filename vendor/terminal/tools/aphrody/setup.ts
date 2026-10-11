// bun run setup : Visual Studio (composants de .vsconfig), Windows SDK, .NET, vcpkg, restauration NuGet.
// Idempotent : chaque étape vérifie l'état avant d'agir.
import { $ } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  OUT,
  ROOT,
  VS_INSTALLER_DIR,
  elevator,
  ensureDir,
  isAdmin,
  log,
  msbuildExe,
  runLogged,
  vsDevEnv,
  vsInstance,
  windowsTargetPlatformVersion,
  type VsInstance,
} from "./lib.ts";

// Composants IDE de .vsconfig et leurs équivalents dans le produit Build Tools.
const BUILD_TOOLS_EQUIVALENTS: Record<string, string[]> = {
  "Microsoft.VisualStudio.Workload.NativeDesktop": ["Microsoft.VisualStudio.Workload.VCTools"],
  "Microsoft.VisualStudio.Workload.ManagedDesktop": ["Microsoft.VisualStudio.Workload.ManagedDesktopBuildTools"],
  "Microsoft.VisualStudio.Workload.Universal": ["Microsoft.VisualStudio.Workload.UniversalBuildTools"],
  "Microsoft.VisualStudio.ComponentGroup.UWP.Support": ["Microsoft.VisualStudio.ComponentGroup.UWP.BuildTools"],
  "Microsoft.VisualStudio.ComponentGroup.UWP.VC": ["Microsoft.VisualStudio.ComponentGroup.UWP.VC.BuildTools"],
  "Microsoft.VisualStudio.ComponentGroup.WindowsAppDevelopment.VC": [
    "Microsoft.VisualStudio.ComponentGroup.WindowsAppDevelopment.VC.BuildTools",
  ],
  "Microsoft.VisualStudio.Component.NuGet": ["Microsoft.VisualStudio.Component.NuGet.BuildTools"],
  "Microsoft.Component.ClickOnce": ["Microsoft.Component.ClickOnce.MSBuild"],
};

const COMPONENT_ID =
  /^Microsoft\.(VisualStudio\.(Component|ComponentGroup|Workload)|Component|ComponentGroup|Net|NetCore)\./;

/** Ids selectable in this product (closure of the product package over the channel catalog). */
async function productComponents(vs: VsInstance): Promise<Set<string> | undefined> {
  const catalog = `C:\\ProgramData\\Microsoft\\VisualStudio\\Packages\\_Instances\\${vs.instanceId}\\catalog.json`;
  if (!existsSync(catalog)) return undefined;
  const { packages } = (await Bun.file(catalog).json()) as {
    packages: { id: string; dependencies?: Record<string, unknown> }[];
  };
  const byId = new Map<string, (typeof packages)[number]>();
  for (const p of packages) if (!byId.has(p.id)) byId.set(p.id, p);
  const seen = new Set<string>();
  const queue = [vs.productId];
  while (queue.length) {
    const p = byId.get(queue.pop()!);
    for (const dep of Object.keys(p?.dependencies ?? {})) {
      if (seen.has(dep) || !COMPONENT_ID.test(dep)) continue;
      seen.add(dep);
      queue.push(dep);
    }
  }
  return seen;
}

async function requiredComponents(vs: VsInstance): Promise<string[]> {
  const wanted = ((await Bun.file(join(ROOT, ".vsconfig")).json()) as { components: string[] }).components;
  if (!vs.productId.endsWith(".BuildTools")) return wanted;
  const available = await productComponents(vs);
  const out = new Set<string>();
  for (const id of wanted) {
    for (const candidate of BUILD_TOOLS_EQUIVALENTS[id] ?? [id]) {
      if (!available || available.has(candidate)) out.add(candidate);
    }
  }
  return [...out].sort();
}

async function msbuildRunning(): Promise<boolean> {
  return (await $`tasklist /FI ${"IMAGENAME eq MSBuild.exe"} /NH`.quiet().nothrow().text()).includes("MSBuild.exe");
}

async function setupVisualStudio(): Promise<VsInstance> {
  let vs = await vsInstance();
  if (!vs) {
    const cmd = `winget install --id Microsoft.VisualStudio.BuildTools --override "--passive --wait --config ${join(ROOT, ".vsconfig")}"`;
    throw new Error(`Visual Studio introuvable. Installer : ${cmd}`);
  }
  log("vs", `${vs.displayName} ${vs.installationVersion} (${vs.installationPath})`);

  const required = await requiredComponents(vs);
  const installed = new Set(vs.packages?.map(p => p.id));
  const missing = required.filter(id => !installed.has(id));
  if (missing.length === 0) {
    log("vs", `${required.length} composants requis déjà installés`);
    return vs;
  }

  log("vs", `composants manquants (${missing.length}) : ${missing.join(", ")}`);
  if (process.argv.includes("--no-vs-install")) {
    log("vs", "--no-vs-install : composants non installés, le build peut échouer");
    return vs;
  }
  const config = join(OUT, "vsconfig.json");
  await Bun.write(config, JSON.stringify({ version: "1.0", components: required, extensions: [] }, null, 2));
  // setup.exe is the blocking installer CLI behind vs_installer.exe; it refuses to run with its own directory as cwd.
  const installer = [
    join(VS_INSTALLER_DIR, "setup.exe"),
    "modify",
    "--installPath",
    vs.installationPath,
    "--config",
    config,
    "--quiet",
    "--norestart",
  ];
  let cmd = installer;
  if (!(await isAdmin())) {
    const elev = elevator();
    if (!elev) {
      const line = installer.map(a => (a.includes(" ") ? `"${a}"` : a)).join(" ");
      log("vs", `élévation requise, commande à lancer en administrateur :\n  ${line}`);
      return vs;
    }
    cmd = [...elev, ...installer];
  }
  // With --quiet the installer cancels itself (exit 0) while any MSBuild process is alive.
  if (await msbuildRunning()) throw new Error("MSBuild en cours d'exécution : relancer `bun run setup` après le build");
  const started = performance.now();
  const code = await runLogged(cmd, { cwd: ROOT, logFile: join(OUT, "vs-installer.log") });
  log("vs", `installeur terminé (code ${code}) en ${((performance.now() - started) / 60000).toFixed(1)} min`);
  // 3010 = succès, redémarrage requis.
  if (code !== 0 && code !== 3010)
    throw new Error(`setup.exe modify a échoué (code ${code}), voir ${join(OUT, "vs-installer.log")}`);

  vs = (await vsInstance())!;
  const after = new Set(vs.packages?.map(p => p.id));
  const stillMissing = required.filter(id => !after.has(id));
  if (stillMissing.length) {
    // The installer can also exit 0 after a package failure (e.g. MSI 1714 on a purged C:\Windows\Installer cache).
    const errors = [...new Bun.Glob("dd_setup_*_errors.log").scanSync({ cwd: process.env.TEMP ?? "", absolute: true })]
      .sort()
      .at(-1);
    throw new Error(`composants toujours absents : ${stillMissing.join(", ")}${errors ? `\nvoir ${errors}` : ""}`);
  }
  return vs;
}

async function checkWindowsSdk(): Promise<void> {
  const version = await windowsTargetPlatformVersion();
  const header = `C:\\Program Files (x86)\\Windows Kits\\10\\Include\\${version}\\um\\Windows.h`;
  if (!existsSync(header)) throw new Error(`Windows SDK ${version} absent (${header})`);
  log("sdk", `Windows SDK ${version} présent`);
}

async function checkDotnet(): Promise<void> {
  const r = await $`dotnet --list-sdks`.nothrow().quiet();
  const sdks = r.stdout.toString().trim().split(/\r?\n/).filter(Boolean);
  if (r.exitCode !== 0 || sdks.length === 0) throw new Error(".NET SDK absent (dotnet --list-sdks)");
  log("dotnet", sdks.map(s => s.split(" ")[0]).join(", "));
}

async function restore(vs: VsInstance): Promise<void> {
  const env = { ...(await vsDevEnv(vs)), NUGET_RESTORE_MSBUILD_ARGS: "/p:Platform=x64" };
  if (!env.VCPKG_ROOT) throw new Error("vcpkg absent (composant Microsoft.VisualStudio.Component.Vcpkg)");
  log("vcpkg", env.VCPKG_ROOT);
  const nuget = join(ROOT, "dep", "nuget", "nuget.exe");
  for (const config of [join("dep", "nuget", "packages.config"), join("build", "packages.config")]) {
    const code = await runLogged(
      [nuget, "restore", config, "-PackagesDirectory", "packages", "-NonInteractive", "-Verbosity", "quiet"],
      { env, logFile: join(OUT, `restore-${config.split(/[\\/]/)[0]}.log`) },
    );
    if (code !== 0) throw new Error(`nuget restore ${config} a échoué (code ${code})`);
  }
  const logFile = join(OUT, "restore.log");
  const code = await runLogged(
    [
      msbuildExe(vs),
      "OpenConsole.slnx",
      "/t:Restore",
      "/p:Configuration=Release",
      "/p:Platform=x64",
      "/m",
      "/nr:false",
      "/nologo",
      "/v:minimal",
    ],
    { env, logFile },
  );
  if (code !== 0) throw new Error(`msbuild /t:Restore a échoué (code ${code}), voir ${logFile}`);
  log("nuget", "restauration OK");
}

ensureDir(OUT);
const vs = await setupVisualStudio();
await checkWindowsSdk();
await checkDotnet();
await restore(vs);
log("setup", "terminé");
