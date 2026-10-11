#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, resolve } from "node:path";

export const CRUNCHYROLL_WATCH_URL =
  "https://www.crunchyroll.com/fr/watch/GE00389313JAJP/the-god-who-destroys";

export interface ActiveChromeProfile {
  pid: number;
  executable: string;
  userDataDir: string;
  profileDirectory: string;
}

export function planChromeSiteApp(profile: ActiveChromeProfile) {
  if (!isAbsolute(profile.executable) || !isAbsolute(profile.userDataDir))
    throw new Error("Chrome executable and user data directory must be absolute paths.");
  if (
    !profile.profileDirectory ||
    /[\\/:\x00-\x1f]/.test(profile.profileDirectory) ||
    [".", ".."].includes(profile.profileDirectory)
  )
    throw new Error("Chrome profile directory must be a single directory name.");
  return {
    mode: "chrome-site-app" as const,
    installedPwaValidated: false,
    offlinePlayback: false,
    watchURL: CRUNCHYROLL_WATCH_URL,
    command: [
      profile.executable,
      `--user-data-dir=${profile.userDataDir}`,
      `--profile-directory=${profile.profileDirectory}`,
      `--app=${CRUNCHYROLL_WATCH_URL}`,
    ],
  };
}

export async function probeForkBrowserCapabilities() {
  try {
    const [chromium, chrome, google] = await Promise.all([
      import("bun:chromium"),
      import("bun:chrome"),
      import("bun:google"),
    ]);
    chromium.protocol.validateURL(CRUNCHYROLL_WATCH_URL);
    return {
      available: true,
      chromeAliasMatches: chrome.default === chromium.default,
      googleChromiumMatches: google.chromium === chromium.default,
      executableDiscoveryAvailable: typeof chromium.findExecutable === "function",
      profileHelpersAvailable: typeof chromium.profiles.readBookmarks === "function",
      discoveredBrowserExecutable: chromium.findExecutable(),
    };
  } catch {
    return { available: false, reason: "Fork browser modules are unavailable in this runtime." };
  }
}

async function powershellJson(script: string, env: Record<string, string> = {}) {
  const child = Bun.spawn(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  });
  const [stdout, exitCode] = await Promise.all([child.stdout.text(), child.exited]);
  if (exitCode) throw new Error("Native Chrome profile/shortcut operation failed.");
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error("Native operation returned invalid metadata.");
  }
}

export async function detectActiveChromeProfile(): Promise<ActiveChromeProfile> {
  if (process.platform !== "win32")
    throw new Error("This Chrome site-app launcher requires Windows.");
  const processes = (await powershellJson(`
$chromeRoots = @(Get-CimInstance Win32_Process -Filter "name='chrome.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine -notmatch '--type=' } | ForEach-Object {
  $dirMatch = [regex]::Match($_.CommandLine, '--user-data-dir=(?:"([^"]+)"|([^\\s]+))')
  $profileMatch = [regex]::Match($_.CommandLine, '--profile-directory=(?:"([^"]+)"|([^\\s]+))')
  [pscustomobject]@{ pid=$_.ProcessId; executable=$_.ExecutablePath; userDataDir=($dirMatch.Groups[1].Value + $dirMatch.Groups[2].Value); profileDirectory=($profileMatch.Groups[1].Value + $profileMatch.Groups[2].Value) }
})
ConvertTo-Json -InputObject $chromeRoots -Compress
`)) as Array<Partial<ActiveChromeProfile>>;
  if (!Array.isArray(processes) || processes.length !== 1)
    throw new Error(
      "Exactly one running Chrome browser process is required to select the active profile safely.",
    );
  const active = processes[0]!;
  if (!active.executable || !active.pid)
    throw new Error("Running Chrome executable metadata is unavailable.");
  const userDataDir =
    active.userDataDir || resolve(process.env.LOCALAPPDATA ?? "", "Google/Chrome/User Data");
  const stateFile = Bun.file(resolve(userDataDir, "Local State"));
  if (!(await stateFile.exists()))
    throw new Error("The running Chrome profile has no readable Local State.");
  const state = await stateFile.json();
  const profileDirectory = active.profileDirectory || state?.profile?.last_used;
  if (typeof profileDirectory !== "string")
    throw new Error("Chrome last-used profile metadata is unavailable.");
  if (
    !active.profileDirectory &&
    Array.isArray(state?.profile?.last_active_profiles) &&
    state.profile.last_active_profiles.length > 1
  )
    throw new Error(
      "Several Chrome profiles are active; automatic profile selection is ambiguous.",
    );
  const profile = { pid: active.pid, executable: active.executable, userDataDir, profileDirectory };
  planChromeSiteApp(profile);
  return profile;
}

export async function installChromeSiteAppShortcut(profile: ActiveChromeProfile) {
  planChromeSiteApp(profile);
  const launcher = resolve(import.meta.dir, "crunchyroll-app.ts");
  if (/["\r\n]/.test(launcher)) throw new Error("Invalid launcher path.");
  const installedBun = resolve(process.env.WINDIR ?? "C:/Windows", "System32/bun.exe");
  if (!(await Bun.file(installedBun).exists()))
    throw new Error("Installed Aphrody Bun runtime is unavailable for the shortcut.");
  return await powershellJson(
    `
$shortcutDesktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $shortcutDesktop 'Crunchyroll - Bun Chrome.lnk'
$shortcutShell = New-Object -ComObject WScript.Shell
$shortcutLink = $shortcutShell.CreateShortcut($shortcutPath)
$shortcutLink.TargetPath = $env:BUN_SITE_APP_RUNTIME
$shortcutLink.Arguments = '"' + $env:BUN_SITE_APP_SCRIPT + '" --open'
$shortcutLink.WorkingDirectory = $env:BUN_SITE_APP_WORKDIR
$shortcutLink.Description = 'Official Crunchyroll watch page in the existing Chrome profile, launched by Bun'
$shortcutLink.IconLocation = $env:BUN_SITE_APP_CHROME + ',0'
$shortcutLink.Save()
[pscustomobject]@{ shortcut=$shortcutPath; mode='chrome-site-app'; installedPwaValidated=$false } | ConvertTo-Json -Compress
`,
    {
      BUN_SITE_APP_RUNTIME: installedBun,
      BUN_SITE_APP_SCRIPT: launcher,
      BUN_SITE_APP_WORKDIR: resolve(import.meta.dir, "../.."),
      BUN_SITE_APP_CHROME: profile.executable,
    },
  );
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "bun bd scripts/aphrody/crunchyroll-app.ts [--check] [--install] [--open]\nOpens the official watch page as a Chrome site app using the running browser profile. --install creates a desktop shortcut. Site PWA installation and offline playback are not implied.",
    );
  } else {
    const profile = await detectActiveChromeProfile();
    const plan = planChromeSiteApp(profile);
    const forkCapabilities = await probeForkBrowserCapabilities();
    console.log(
      JSON.stringify({
        ...plan,
        activeChromePid: profile.pid,
        profileDirectory: profile.profileDirectory,
        forkCapabilities,
      }),
    );
    if (!args.includes("--check")) {
      if (args.includes("--install"))
        console.log(JSON.stringify(await installChromeSiteAppShortcut(profile)));
      if (args.includes("--open"))
        Bun.spawn(plan.command, { stdout: "ignore", stderr: "ignore" }).unref();
    }
  }
}
