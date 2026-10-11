// bun run deploy : enregistre le paquet de dev (WindowsTerminalDev) depuis un layout décompressé,
// applique la config de profils canonique au LocalState du paquet et installe le fragment de profils.
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import {
  CANONICAL_SETTINGS,
  FRAGMENT_DIR,
  LAYOUT_DIR,
  LOCALAPPDATA,
  M3_SCHEMES,
  OUT,
  PACKAGE_NAME,
  ROOT,
  ensureDir,
  log,
  pwsh,
  windowsTargetPlatformVersion,
} from "./lib.ts";

interface AppxPackage {
  Name: string;
  Version: string;
  PackageFamilyName: string;
  InstallLocation: string;
}

async function installedPackage(): Promise<AppxPackage | undefined> {
  const r = await pwsh(
    `Get-AppxPackage -Name ${PACKAGE_NAME} | Select-Object Name,Version,PackageFamilyName,InstallLocation | ConvertTo-Json -Compress`,
  );
  const text = r.out.trim();
  return text ? (JSON.parse(text) as AppxPackage) : undefined;
}

function newestMsix(): string {
  const appPackages = join(ROOT, "src", "cascadia", "CascadiaPackage", "AppPackages");
  const found = [...new Bun.Glob("**/CascadiaPackage_*_x64*.msix").scanSync({ cwd: appPackages, absolute: true })]
    .map(path => ({ path, mtime: statSync(path).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!found.length) throw new Error(`aucun .msix dans ${appPackages} : lancer \`bun run build\``);
  return found[0].path;
}

async function makeappx(): Promise<string> {
  const sdk = await windowsTargetPlatformVersion();
  const exe = `C:\\Program Files (x86)\\Windows Kits\\10\\bin\\${sdk}\\x64\\makeappx.exe`;
  if (!existsSync(exe)) throw new Error(`makeappx introuvable (${exe})`);
  return exe;
}

async function register(): Promise<AppxPackage> {
  const msix = newestMsix();
  const st = statSync(msix);
  const id = `${Math.trunc(st.mtimeMs).toString(36)}-${st.size.toString(36)}`;
  const layout = join(LAYOUT_DIR, id);
  const current = await installedPackage();
  if (current && current.InstallLocation.toLowerCase() === layout.toLowerCase()) {
    log("deploy", `${basename(msix)} déjà enregistré (${layout})`);
    return current;
  }
  if (!existsSync(join(layout, "AppxManifest.xml"))) {
    ensureDir(LAYOUT_DIR);
    const proc = Bun.spawn([await makeappx(), "unpack", "/o", "/p", msix, "/d", layout], {
      stdout: "ignore",
      stderr: "inherit",
    });
    if ((await proc.exited) !== 0) throw new Error(`makeappx unpack ${msix} a échoué`);
  }
  log("deploy", `enregistrement de ${layout}`);
  const r = await pwsh(
    `Add-AppxPackage -Register '${join(layout, "AppxManifest.xml")}' -ForceUpdateFromAnyVersion -ForceApplicationShutdown -ErrorAction Stop`,
  );
  if (r.code !== 0) throw new Error(`Add-AppxPackage a échoué :\n${r.out}`);
  const pkg = await installedPackage();
  if (!pkg) throw new Error(`${PACKAGE_NAME} absent après Add-AppxPackage`);
  for (const old of readdirSync(LAYOUT_DIR)) {
    if (old !== id) rmSync(join(LAYOUT_DIR, old), { recursive: true, force: true });
  }
  return pkg;
}

/** Schemes declared by the other installed fragments. */
async function fragmentSchemes(exclude: string): Promise<Set<string>> {
  const names = new Set<string>();
  const fragments = join(LOCALAPPDATA, "Microsoft", "Windows Terminal", "Fragments");
  if (!existsSync(fragments)) return names;
  for (const file of new Bun.Glob("**/*.json").scanSync({ cwd: fragments, absolute: true })) {
    if (file.toLowerCase() === exclude.toLowerCase()) continue;
    try {
      const json = (await Bun.file(file).json()) as { schemes?: { name: string }[] };
      for (const s of json.schemes ?? []) names.add(s.name);
    } catch {}
  }
  return names;
}

async function applySettings(pkg: AppxPackage): Promise<string> {
  const localState = ensureDir(join(LOCALAPPDATA, "Packages", pkg.PackageFamilyName, "LocalState"));
  const target = join(localState, "settings.json");
  const canonical = await Bun.file(CANONICAL_SETTINGS).text();
  const overridesFile = join(import.meta.dir, "settings.overrides.json");
  let content = canonical;
  if (existsSync(overridesFile)) {
    const overrides = (await Bun.file(overridesFile).json()) as Record<string, unknown>;
    const merged = { ...(JSON.parse(canonical) as Record<string, unknown>), ...overrides };
    content = JSON.stringify(merged, null, 2) + "\n";
  }
  if (existsSync(target) && (await Bun.file(target).text()) === content) {
    log("settings", `${target} à jour`);
  } else {
    if (existsSync(target)) await Bun.write(`${target}.bak`, Bun.file(target));
    await Bun.write(target, content);
    log("settings", `${CANONICAL_SETTINGS} -> ${target}`);
  }
  return target;
}

async function installFragment(): Promise<void> {
  const source = (await Bun.file(join(import.meta.dir, "fragment.json")).json()) as {
    profiles: Record<string, unknown>[];
    schemes?: { name: string }[];
  };
  const target = join(ensureDir(FRAGMENT_DIR), "aphrody-terminal.json");
  const wanted = new Set(source.profiles.map(p => p.colorScheme).filter((s): s is string => typeof s === "string"));
  // Fragments are read by every installed Terminal edition, so the generated M3 schemes ship with the profiles.
  if (existsSync(M3_SCHEMES)) {
    source.schemes = ((await Bun.file(M3_SCHEMES).json()) as { name: string }[]).filter(s => wanted.has(s.name));
  }
  const known = await fragmentSchemes(target);
  for (const s of source.schemes ?? []) known.add(s.name);
  for (const name of wanted) {
    if (known.has(name)) continue;
    // An unknown colorScheme raises a settings warning at every Terminal startup.
    for (const p of source.profiles) if (p.colorScheme === name) delete p.colorScheme;
    log("fragment", `schéma « ${name} » absent de ${M3_SCHEMES} : référence omise`);
  }
  const content = JSON.stringify(source, null, 2) + "\n";
  if (existsSync(target) && (await Bun.file(target).text()) === content) {
    log("fragment", `${target} à jour`);
    return;
  }
  await Bun.write(target, content);
  log("fragment", target);
}

async function launchCheck(pkg: AppxPackage): Promise<void> {
  const alias = join(LOCALAPPDATA, "Microsoft", "WindowsApps", "wtd.exe");
  const where = pkg.InstallLocation.replaceAll("'", "''");
  const running = `Get-Process WindowsTerminal -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '${where}*' }`;
  const before = await pwsh(`@(${running}).Count`);
  if (Number(before.out.trim()) > 0) {
    log("launch", "Windows Terminal Dev déjà lancé");
    return;
  }
  Bun.spawn(
    [
      existsSync(alias) ? alias : "explorer.exe",
      ...(existsSync(alias) ? [] : [`shell:AppsFolder\\${pkg.PackageFamilyName}!App`]),
    ],
    {
      stdout: "ignore",
      stderr: "ignore",
    },
  );
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const r = await pwsh(`(${running} | Select-Object -First 1).Id`);
    const pid = r.out.trim();
    if (pid) {
      log("launch", `WindowsTerminal.exe (pid ${pid}) lancé depuis ${pkg.InstallLocation}`);
      return;
    }
    await Bun.sleep(250);
  }
  throw new Error("Windows Terminal Dev ne s'est pas lancé en 20 s");
}

ensureDir(OUT);
const pkg = await register();
log("deploy", `${pkg.Name} ${pkg.Version} (${pkg.PackageFamilyName})`);
await applySettings(pkg);
await installFragment();
if (!process.argv.includes("--no-launch")) await launchCheck(pkg);
