param([ValidateSet('Plan', 'Apply', 'Verify')][string]$Mode = 'Plan')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$bun = Join-Path $env:SystemRoot 'System32\bun.exe'
$state = 'C:\bun\build\chromium\omar-factory'
if ($env:COMPUTERNAME -ne 'OMAR') { throw 'This setup is scoped to the catalog host OMAR' }
if (!(Test-Path -LiteralPath 'C:\bun\.git') -or !(Test-Path -LiteralPath $bun)) { throw 'Existing Bun checkout and native runtime required' }
function Checked([string]$Executable, [string[]]$Arguments) {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Executable failed with exit $LASTEXITCODE" }
}
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$elevated = ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($Mode -eq 'Plan') {
    [pscustomobject]@{
        Host = $env:COMPUTERNAME; User = $identity.Name; Elevated = $elevated
        Checkout = 'C:\bun'; State = $state
        Actions = @('Complete existing VS2026 through bun msvc setup: ATL/MFC and SDK28000', 'Install missing Mozilla.sccache 0.18.0 through winget', 'Back up and deduplicate machine/user PATH through bun:windows with compare-before-write', 'Keep System32 first; scope INCLUDE/LIB to bun msvc exec', 'Verify existing SSH configuration and automatic sshd service')
        SourceTransfer = 'Public native helpers only; no browser profile or credential transfer'
        Chromium = 'Keep existing owner PC build/cache; no Chromium download or duplicate build on this host'
    } | ConvertTo-Json -Depth 4
    Checked $bun @('msvc', 'setup', '--dry-run', '--add', 'Microsoft.VisualStudio.Component.VC.ATLMFC', '--add', 'Microsoft.VisualStudio.Component.Windows11SDK.28000')
    exit 0
}
if ($Mode -eq 'Apply') {
    if (!$elevated) { throw 'Apply requires an existing elevated SSH token; no interactive UAC flow is started' }
    $origin = & git -C C:\bun remote get-url origin
    if ($LASTEXITCODE -ne 0 -or $origin -ne 'https://github.com/aphrody-labs/bun.git') { throw 'Existing authorized Bun origin required' }
    foreach ($setting in @(@('core.longpaths', 'true'), @('core.preloadindex', 'true'), @('core.fscache', 'true'), @('fetch.prune', 'true'), @('pull.ff', 'only'), @('push.default', 'simple'))) {
        Checked 'git.exe' @('-C', 'C:\bun', 'config', '--local', $setting[0], $setting[1])
    }
    [IO.Directory]::CreateDirectory($state) | Out-Null
    Checked $bun @('msvc', 'setup', '--add', 'Microsoft.VisualStudio.Component.VC.ATLMFC', '--add', 'Microsoft.VisualStudio.Component.Windows11SDK.28000')
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
    if (!(Get-Command sccache -ErrorAction SilentlyContinue)) {
        Checked 'winget.exe' @('install', '--id', 'Mozilla.sccache', '--version', '0.18.0', '--exact', '--source', 'winget', '--silent', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity')
    }
    $pathScript = @'
import windows from "bun:windows";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { dlopen, ptr } from "bun:ffi";
const root = "C:\\bun\\build\\chromium\\omar-factory";
const machineKey = "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment";
const userKey = "HKCU\\Environment";
const before = { machine: windows.registry.get(machineKey, "Path"), user: windows.registry.get(userKey, "Path") };
if (!before.machine || !before.user || ![before.machine, before.user].every(x => typeof x.value === "string" && ["REG_SZ", "REG_EXPAND_SZ"].includes(x.type))) throw new Error("Unsupported PATH registry value");
const toolchain = windows.toolchain();
const normalize = path => path.trim().replace(/^"|"$/g, "").replace(/[\\/]+$/, "").replace(/%([^%]+)%/g, (_, key) => process.env[key] ?? process.env[Object.keys(process.env).find(x => x.toLowerCase() === key.toLowerCase())] ?? `%${key}%`).toLowerCase();
function unique(paths, seen = new Set()) {
  const result = [];
  for (const path of paths) { if (!path.trim()) continue; const key = normalize(path); if (seen.has(key)) continue; seen.add(key); result.push(path.trim()); }
  return result;
}
const system = process.env.SystemRoot ?? "C:\\Windows";
const machine = unique([join(system, "System32"), system, join(system, "System32", "Wbem"), join(system, "System32", "WindowsPowerShell", "v1.0"), join(system, "System32", "OpenSSH"), ...before.machine.value.split(";"), ...(toolchain.paths?.pathAppend ?? []).filter(existsSync), toolchain.sdk?.bin].filter(x => typeof x === "string" && x));
const user = unique([...before.user.value.split(";"), join(process.env.USERPROFILE, ".cargo", "bin"), join(process.env.USERPROFILE, "AppData", "Local", "Microsoft", "WinGet", "Links")].filter(x => existsSync(x) || before.user.value.split(";").includes(x)), new Set(machine.map(normalize)));
const after = { machine: { ...before.machine, value: machine.join(";") }, user: { ...before.user, value: user.join(";") } };
mkdirSync(root, { recursive: true });
const backup = join(root, `path-backup-${Date.now()}.json`);
await Bun.write(backup, JSON.stringify({ date: new Date().toISOString(), before, after }, null, 2) + "\n");
for (const [key, scope] of [[machineKey, "machine"], [userKey, "user"]]) if (JSON.stringify(windows.registry.get(key, "Path")) !== JSON.stringify(before[scope])) throw new Error("Concurrent PATH update; plan preserved without overwriting");
windows.registry.set(machineKey, "Path", after.machine.value, before.machine.type);
if (JSON.stringify(windows.registry.get(userKey, "Path")) !== JSON.stringify(before.user)) throw new Error("Concurrent user PATH update; machine update backed up, user preserved");
windows.registry.set(userKey, "Path", after.user.value, before.user.type);
for (const [key, scope] of [[machineKey, "machine"], [userKey, "user"]]) if (JSON.stringify(windows.registry.get(key, "Path")) !== JSON.stringify(after[scope])) throw new Error("PATH registry readback mismatch");
const user32 = dlopen(join(system, "System32", "user32.dll"), { SendMessageTimeoutW: { args: ["ptr", "u32", "usize", "ptr", "u32", "u32", "ptr"], returns: "usize" } });
const message = Buffer.from("Environment\0", "utf16le"), result = new BigUint64Array(1);
let broadcast;
try { broadcast = user32.symbols.SendMessageTimeoutW(0xffff, 0x1a, 0n, ptr(message), 2, 5000, ptr(result)) !== 0n; } finally { user32.close(); }
console.log(JSON.stringify({ backup, machineEntries: machine.length, userEntries: user.length, system32First: normalize(machine[0]) === normalize(join(system, "System32")), broadcast }));
'@
    $pathFile = Join-Path $state 'path-apply.mjs'
    [IO.File]::WriteAllText($pathFile, $pathScript, [Text.UTF8Encoding]::new($false))
    Checked $bun @('run', $pathFile)
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
    Checked $bun @('msvc', 'sync')
}
Checked $bun @('msvc', 'doctor')
Checked $bun @('msvc', 'sync', '--check')
Checked (Join-Path $env:SystemRoot 'System32\OpenSSH\sshd.exe') @('-t')
$sshd = Get-CimInstance Win32_Service -Filter "Name='sshd'"
if ($sshd.State -ne 'Running' -or $sshd.StartMode -ne 'Auto') { throw 'Existing SSH service is not running with automatic startup; configuration preserved' }
$inventory = @(& $bun msvc info) | Out-String | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Toolchain inventory failed' }
$receipt = [pscustomobject]@{
    DateUtc = [DateTime]::UtcNow.ToString('o'); Host = $env:COMPUTERNAME
    BunRevision = (& $bun --revision); SourceRevision = (& git -C C:\bun rev-parse HEAD)
    MSVC = $inventory.msvc.version; SDK = $inventory.sdk.version
    ATL = !!(@($inventory.instance.components) | Where-Object { $_ -eq 'Microsoft.VisualStudio.Component.VC.ATLMFC' })
    SDK28000 = !!(@($inventory.sdks) | Where-Object { $_.version -eq '10.0.28000.0' -and $_.complete })
    SSH = [pscustomobject]@{ State = $sshd.State; Startup = $sshd.StartMode; Configuration = 'sshd -t passed; keys and authentication preserved' }
    Tools = @('bun', 'aphrody', 'git', 'gh', 'cmake', 'ninja', 'clang-cl', 'sccache') | ForEach-Object { $command = Get-Command $_ -ErrorAction SilentlyContinue; [pscustomobject]@{ Name = $_; Path = if ($command) { $command.Source } else { $null } } }
    Chromium = 'No source/build qualified on Omar; owner PC incremental build remains authoritative'
}
if (!$receipt.ATL -or !$receipt.SDK28000 -or ($receipt.Tools | Where-Object { !$_.Path })) { throw 'Required factory toolchain components missing' }
if ($Mode -eq 'Apply') { $receipt | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $state 'receipt.json') -Encoding UTF8 }
$receipt | ConvertTo-Json -Depth 6
