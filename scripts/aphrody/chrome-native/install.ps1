param(
    [ValidateSet('Plan', 'Install')][string]$Mode = 'Plan',
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId,
    [string]$Executable,
    [ValidatePattern('^[A-Fa-f0-9]{64}$')][string]$ExecutableSha256
)
$ErrorActionPreference = 'Stop'
$checkout = if ($env:APHRODY_BUN_CHECKOUT) { [IO.Path]::GetFullPath($env:APHRODY_BUN_CHECKOUT) } else { [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..')) }
if (!$Executable) { $Executable = Join-Path $checkout 'build\chromium\qualification\chrome-native\host.exe' }
$privateRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'BunChromium'))
$native = Join-Path $privateRoot 'NativeMessaging'
$exports = Join-Path $privateRoot 'Exports'
$manifest = Join-Path $native 'com.bun.aphrody.json'
$registryPath = 'Software\Google\Chrome\NativeMessagingHosts\com.bun.aphrody'
$registryPathChromium = 'Software\Chromium\NativeMessagingHosts\com.bun.aphrody'
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User

function Assert-Ordinary([string]$Path) {
    $current = [IO.Path]::GetFullPath($Path)
    while ($current -and $current -ne [IO.Path]::GetPathRoot($current)) {
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse paths are refused' }
        }
        $current = Split-Path $current -Parent
    }
}
function Protect-Private([string]$Path) {
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetOwner($sid)
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($principal in @($sid, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($principal, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
}
function Assert-Private([string]$Path) {
    Assert-Ordinary $Path
    if (!(Test-Path -LiteralPath $Path -PathType Container)) { throw 'Private storage must be a directory' }
    $acl = Get-Acl -LiteralPath $Path
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value -or !$acl.AreAccessRulesProtected) { throw 'Existing private directory ownership is not qualified' }
    foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
        if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin @($sid.Value, 'S-1-5-18')) { throw 'Existing directory permits other principals' }
    }
}
function Create-PrivateDirectory([string]$Path) {
    $temporary = Join-Path (Split-Path $Path -Parent) ('private-stage-' + [Guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory($temporary) | Out-Null
    Protect-Private $temporary
    Assert-Ordinary (Split-Path $Path -Parent)
    [IO.Directory]::Move($temporary, $Path)
}

Assert-Ordinary $privateRoot
if ($Mode -eq 'Plan') {
    [pscustomobject]@{ Host = 'com.bun.aphrody'; ExtensionId = $ExtensionId; AllowedOrigin = "chrome-extension://$ExtensionId/"; NativeDirectory = $native; ExportDirectory = $exports; Registry = @("HKCU:\$registryPath", "HKCU:\$registryPathChromium"); ExistingHost = (Test-Path -LiteralPath $native); Executable = $Executable } | ConvertTo-Json
    exit 0
}
if (!$ExecutableSha256) { throw 'Explicit qualified executable hash required' }
Assert-Ordinary $Executable
if (!(Test-Path -LiteralPath $Executable -PathType Leaf) -or (Get-FileHash -LiteralPath $Executable -Algorithm SHA256).Hash -ne $ExecutableSha256.ToUpperInvariant()) { throw 'Executable hash mismatch' }
if (Test-Path -LiteralPath $native) { throw 'Existing native host preserved; refusing replacement' }
if (Test-Path -LiteralPath $exports) { Assert-Private $exports }
$views = @([Microsoft.Win32.RegistryView]::Registry32, [Microsoft.Win32.RegistryView]::Registry64)
$before = @()
foreach ($view in $views) {
    $hive = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, $view)
    try {
        foreach ($path in @($registryPath, $registryPathChromium)) {
            $key = $hive.OpenSubKey($path)
            try {
                if ($key) { throw 'Existing native host registry key preserved' }
                $before += [pscustomobject]@{ View = $view.ToString(); Path = $path; Existed = $false; Value = $null }
            } finally { if ($key) { $key.Dispose() } }
        }
    } finally { $hive.Dispose() }
}
if (!(Test-Path -LiteralPath $privateRoot)) { Create-PrivateDirectory $privateRoot }
$stage = Join-Path $privateRoot ('native-stage-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($stage) | Out-Null
Protect-Private $stage
[IO.File]::Copy([IO.Path]::GetFullPath($Executable), (Join-Path $stage 'host.exe'), $false)
if ((Get-FileHash -LiteralPath (Join-Path $stage 'host.exe') -Algorithm SHA256).Hash -ne $ExecutableSha256.ToUpperInvariant()) { throw 'Copied executable hash mismatch' }
@{ schemaVersion = 1; extensionId = $ExtensionId } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stage 'host-config.json') -Encoding UTF8
@{ name = 'com.bun.aphrody'; description = 'Private Aphrody browser exports'; path = (Join-Path $native 'host.exe'); type = 'stdio'; allowed_origins = @("chrome-extension://$ExtensionId/") } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stage 'com.bun.aphrody.json') -Encoding UTF8
@{ time = [DateTime]::UtcNow.ToString('o'); executableSha256 = $ExecutableSha256; extensionId = $ExtensionId; registryBefore = $before } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $stage 'install-receipt.json') -Encoding UTF8
Assert-Ordinary $privateRoot
[IO.Directory]::Move($stage, $native)
if (!(Test-Path -LiteralPath $exports)) { Create-PrivateDirectory $exports }
Assert-Private $native
Assert-Private $exports
foreach ($entry in @($before | Where-Object { $_.View -eq 'Registry64' })) {
    $view = [Microsoft.Win32.RegistryView]::$($entry.View)
    $hive = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, $view)
    try {
        $current = $hive.OpenSubKey($entry.Path)
        if ($current) { $current.Dispose(); throw 'Registry changed since plan; refusing overwrite' }
        $key = $hive.CreateSubKey($entry.Path)
        try {
            if ($key.GetValueNames().Count -ne 0 -or $key.SubKeyCount -ne 0) { throw 'Registry changed before write; refusing overwrite' }
            $key.SetValue('', $manifest, [Microsoft.Win32.RegistryValueKind]::String)
            if ($key.GetValue('') -ne $manifest -or $key.GetValueKind('') -ne 'String') { throw 'Native host registry readback mismatch' }
        } finally { $key.Dispose() }
    } finally { $hive.Dispose() }
}
foreach ($entry in $before) {
    $view = [Microsoft.Win32.RegistryView]::$($entry.View)
    $hive = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, $view)
    try {
        $key = $hive.OpenSubKey($entry.Path)
        try {
            if (!$key -or $key.GetValue('') -ne $manifest -or $key.GetValueKind('') -ne 'String') { throw 'Native host cross-view registry readback mismatch' }
        } finally { if ($key) { $key.Dispose() } }
    } finally { $hive.Dispose() }
}
[pscustomobject]@{ Host = 'com.bun.aphrody'; ExtensionId = $ExtensionId; ExecutableSha256 = $ExecutableSha256; RegisteredCurrentUser = $true; ExtensionInstalled = $false } | ConvertTo-Json
