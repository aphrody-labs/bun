param(
    [ValidateSet('Plan', 'Profile', 'Payload', 'Install')][string]$Mode = 'Plan',
    [string]$UserHome = $env:USERPROFILE,
    [string]$BuildDirectory,
    [string]$QualificationReceipt,
    [string]$RuntimeDependencies
)
$ErrorActionPreference = 'Stop'
$checkout = if ($env:APHRODY_BUN_CHECKOUT) { [IO.Path]::GetFullPath($env:APHRODY_BUN_CHECKOUT) } else { [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')) }
if (!$BuildDirectory) { $BuildDirectory = Join-Path $checkout 'vendor\chromium\src\out\bun' }
if (!$QualificationReceipt) { $QualificationReceipt = Join-Path $checkout 'build\chromium\qualification.json' }
if (!$RuntimeDependencies) { $RuntimeDependencies = Join-Path $checkout 'build\chromium\install\chrome.runtime_deps' }
$source = Join-Path $UserHome 'AppData\Local\Google\Chrome\User Data'
$destination = Join-Path $UserHome 'AppData\Local\Chromium\User Data'
$privateRoot = Join-Path $UserHome 'AppData\Local\BunChromium'
$application = 'C:\Program Files\BunChromium\Application'
$launcher = 'C:\Windows\System32\bun-chromium.exe'
$tools = Join-Path $checkout 'build\chromium\install'
$depotTools = Join-Path $checkout 'vendor\depot_tools'
$launcherSource = Join-Path $PSScriptRoot 'chromium-launcher.c'
$sevenZip = 'C:\Program Files\7-Zip\7z.exe'

function Invoke-Checked([string]$Executable, [string[]]$Arguments, [int]$MaximumExit = 0) {
    & $Executable @Arguments
    if ($LASTEXITCODE -lt 0 -or $LASTEXITCODE -gt $MaximumExit) { throw "$Executable failed with exit $LASTEXITCODE" }
}
function Protect-Private([string]$Path) {
    $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = New-Object System.Security.AccessControl.DirectorySecurity
    $acl.SetOwner($sid)
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($principal in @($sid, [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
        $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($principal, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $Path -AclObject $acl
}
function Assert-Inside([string]$Path, [string]$Root) {
    $full = [IO.Path]::GetFullPath($Path)
    $prefix = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
    if (!$full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Path outside authorized directory" }
}

if ($Mode -eq 'Plan') {
    [pscustomobject]@{ Source = $source; Profile = $destination; Backups = "$privateRoot\Backups"; Application = $application; Launcher = $launcher; QualificationReceipt = $QualificationReceipt } | ConvertTo-Json
    exit 0
}
if ($Mode -eq 'Payload') {
    $sourceRoot = [IO.Path]::GetFullPath((Join-Path $BuildDirectory '..\..'))
    $inventory = @(& 'C:\Windows\System32\bun.exe' msvc info) | Out-String | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'Native MSVC inventory failed' }
    $vs = @($inventory.instances | Where-Object { $_.year -eq 2026 -and $_.complete }) | Select-Object -First 1
    if (!$vs) { throw 'Chromium local Visual Studio 2026 instance missing' }
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = Join-Path $sourceRoot 'buildtools\win\gn.exe'
    $start.WorkingDirectory = $sourceRoot
    $start.Arguments = "desc `"$BuildDirectory`" //chrome:chrome runtime_deps"
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.EnvironmentVariables['DEPOT_TOOLS_WIN_TOOLCHAIN'] = '0'
    $start.EnvironmentVariables['DEPOT_TOOLS_UPDATE'] = '0'
    $start.EnvironmentVariables['vs2026_install'] = $vs.path
    $start.EnvironmentVariables['PATH'] = $depotTools + ';' + $start.EnvironmentVariables['PATH']
    if (!$start.EnvironmentVariables['PROCESSOR_ARCHITECTURE']) {
        $architecture = $start.EnvironmentVariables['PROCESSOR_ARCHITEW6432']
        if (!$architecture) {
            $nativeArch = & 'C:\Windows\System32\bun.exe' -p process.arch
            if ($LASTEXITCODE -ne 0) { throw 'Native architecture detection failed' }
            $architecture = switch ($nativeArch) { 'x64' { 'AMD64' }; 'arm64' { 'ARM64' }; 'ia32' { 'x86' }; default { throw 'Unsupported native Windows architecture' } }
        }
        $start.EnvironmentVariables['PROCESSOR_ARCHITECTURE'] = $architecture
    }
    $process = [Diagnostics.Process]::Start($start)
    try {
        $output = $process.StandardOutput.ReadToEndAsync()
        $diagnostics = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) { throw "Pinned GN runtime_deps failed: $($diagnostics.Result)" }
        if (!$output.Result.Trim()) { throw 'Pinned GN runtime_deps returned an empty list' }
        New-Item -ItemType Directory -Force -Path (Split-Path $RuntimeDependencies) | Out-Null
        $output.Result | Set-Content -LiteralPath $RuntimeDependencies -Encoding UTF8
    } finally { $process.Dispose() }
    $revision = @(& git -C $sourceRoot rev-parse HEAD)
    if ($LASTEXITCODE -ne 0 -or $revision.Count -ne 1) { throw 'Chromium source revision unavailable' }
    [pscustomobject]@{ CreatedUtc = [DateTime]::UtcNow.ToString('o'); Target = '//chrome:chrome'; ChromiumRevision = $revision[0]; ArgsSha256 = (Get-FileHash -LiteralPath (Join-Path $BuildDirectory 'args.gn') -Algorithm SHA256).Hash; DependenciesSha256 = (Get-FileHash -LiteralPath $RuntimeDependencies -Algorithm SHA256).Hash } | ConvertTo-Json | Set-Content -LiteralPath ($RuntimeDependencies + '.json') -Encoding UTF8
    Write-Output "Pinned GN runtime dependency list and provenance saved: $RuntimeDependencies"
    exit 0
}
if ($Mode -eq 'Profile') {
    if (Test-Path -LiteralPath $destination) { throw 'Existing Chromium profile preserved; refusing overwrite' }
    if (!(Test-Path -LiteralPath $source)) { throw 'Chrome User Data missing' }
    New-Item -ItemType Directory -Force -Path "$privateRoot\Backups" | Out-Null
    Protect-Private $privateRoot
    Protect-Private "$privateRoot\Backups"
    $stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + [Guid]::NewGuid().ToString('N')
    $stage = "$privateRoot\profile-$stamp"
    $archive = "$privateRoot\Backups\chrome-user-data-$stamp.7z"
    New-Item -ItemType Directory -Path $stage | Out-Null
    Protect-Private $stage
    $snapshot = @(& "$tools\snapshot.exe" create ($source.Substring(0, 3)))
    if ($LASTEXITCODE -ne 0 -or $snapshot.Count -ne 2 -or $snapshot[0] -notmatch '^\{[0-9A-Fa-f-]{36}\}$' -or $snapshot[1] -notmatch '^\\\\\?\\GLOBALROOT\\Device\\HarddiskVolumeShadowCopy\d+$') { throw 'Native VSS snapshot failed' }
    $snapshotLink = "$privateRoot\snapshot-$stamp"
    try {
        Invoke-Checked 'C:\Windows\System32\cmd.exe' @('/d', '/c', "mklink /d `"$snapshotLink`" `"$($snapshot[1])\`"")
        $frozen = $snapshotLink + $source.Substring(2)
        if (Get-ChildItem -LiteralPath $frozen -Recurse -Directory -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) { throw 'Profile contains directory reparse points; refusing an incomplete archive' }
        $frozenInventory = @(& "$tools\snapshot.exe" inventory $frozen) | Out-String | ConvertFrom-Json
        if ($LASTEXITCODE -ne 0) { throw 'Frozen profile stream inventory failed' }
        $log = "$privateRoot\Backups\copy-$stamp.log"
        Invoke-Checked 'C:\Windows\System32\robocopy.exe' @($frozen, $stage, '/E', '/COPY:DAT', '/DCOPY:DAT', '/R:0', '/W:0', '/XJ', '/MT:2', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', "/LOG:$log") 7
        $sourceFiles = @(Get-ChildItem -LiteralPath $frozen -Recurse -File -Force)
        $copiedFiles = @(Get-ChildItem -LiteralPath $stage -Recurse -File -Force)
        if ($sourceFiles.Count -ne $copiedFiles.Count) { throw 'Snapshot file count differs from copy' }
        $copyInventory = @(& "$tools\snapshot.exe" inventory $stage) | Out-String | ConvertFrom-Json
        if ($LASTEXITCODE -ne 0 -or $copyInventory.Files -ne $frozenInventory.Files -or $copyInventory.Bytes -ne $frozenInventory.Bytes -or $copyInventory.NamedStreams -ne $frozenInventory.NamedStreams -or $copyInventory.NamedStreamBytes -ne $frozenInventory.NamedStreamBytes) { throw 'Native snapshot and copied stream inventories differ' }
        foreach ($file in $sourceFiles) {
            $relative = $file.FullName.Substring($frozen.TrimEnd('\').Length + 1)
            $copy = Join-Path $stage $relative
            if ((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $copy -Algorithm SHA256).Hash) { throw 'Snapshot hash differs from copy' }
        }
        $archiveLog = "$privateRoot\Backups\archive-$stamp.log"
        $archiveInput = "$stage\*"
        $wim = "$privateRoot\profile-$stamp.wim"
        if ($copyInventory.NamedStreams -gt 0) {
            & $sevenZip a -twim -sns $wim "$stage\*" *> $archiveLog
            if ($LASTEXITCODE -ne 0) { throw 'Stream-preserving WIM creation failed' }
            & $sevenZip t $wim *>> $archiveLog
            if ($LASTEXITCODE -ne 0) { throw 'Stream-preserving WIM integrity failed' }
            $archiveInput = $wim
        }
        & $sevenZip a -t7z -mx3 -mmt2 $archive $archiveInput *>> $archiveLog
        if ($LASTEXITCODE -ne 0) { throw 'Archive creation failed' }
        & $sevenZip t $archive *>> $archiveLog
        if ($LASTEXITCODE -ne 0) { throw 'Archive integrity failed' }
        if (Test-Path -LiteralPath $wim) {
            Assert-Inside $wim $privateRoot
            Remove-Item -LiteralPath $wim
        }
        foreach ($name in @('SingletonLock', 'SingletonCookie', 'SingletonSocket')) {
            $lock = Join-Path $stage $name
            if (Test-Path -LiteralPath $lock) { Remove-Item -LiteralPath $lock -Force }
        }
        if (Test-Path -LiteralPath $destination) { throw 'Concurrent Chromium profile preserved; staged backup retained' }
        New-Item -ItemType Directory -Force -Path (Split-Path $destination) | Out-Null
        Assert-Inside $stage $privateRoot
        Assert-Inside $destination (Join-Path $UserHome 'AppData\Local\Chromium')
        [IO.Directory]::Move($stage, $destination)
        Protect-Private $destination
        $sourceVersion = Get-Content -LiteralPath (Join-Path $destination 'Last Version') -Raw
        if ($sourceVersion.Trim() -notmatch '^\d+\.\d+\.\d+\.\d+$') { throw 'Unexpected source browser version metadata' }
        $receipt = [pscustomobject]@{ CreatedUtc = [DateTime]::UtcNow.ToString('o'); SourceBrowserVersion = $sourceVersion.Trim(); SourceFiles = $sourceFiles.Count; SourceBytes = $frozenInventory.Bytes; CopiedBytes = $copyInventory.Bytes; NamedStreams = $copyInventory.NamedStreams; NamedStreamBytes = $copyInventory.NamedStreamBytes; Archive = $archive; ArchiveBytes = (Get-Item -LiteralPath $archive).Length; ArchiveSha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash; Destination = $destination; Consistency = 'VSS atomic crash-consistent snapshot; SQLite WAL files preserved'; Streams = 'Native stream inventory verified; profiles with named streams archived as WIM inside compressed 7z'; Authentication = 'Opaque encrypted data copied; cross-product app-bound credential decryption not qualified' }
        $receipt | ConvertTo-Json | Set-Content -LiteralPath "$privateRoot\Backups\receipt-$stamp.json" -Encoding UTF8
        $receipt | ConvertTo-Json
    } finally {
        try {
            if (Test-Path -LiteralPath $snapshotLink) {
                Assert-Inside $snapshotLink $privateRoot
                [IO.Directory]::Delete($snapshotLink)
            }
        } finally {
            Invoke-Checked "$tools\snapshot.exe" @('delete', $snapshot[0])
        }
    }
    exit 0
}
if (Test-Path -LiteralPath $application) { throw 'Existing installed browser preserved; refusing overwrite' }
if (Test-Path -LiteralPath $launcher) { throw 'Existing System32 launcher preserved; refusing overwrite' }
$qualified = Get-Content -LiteralPath $QualificationReceipt -Raw | ConvertFrom-Json
$browser = Join-Path $BuildDirectory 'chrome.exe'
$dependencyReceipt = Get-Content -LiteralPath ($RuntimeDependencies + '.json') -Raw | ConvertFrom-Json
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $BuildDirectory '..\..'))
$sourceRevision = @(& git -C $sourceRoot rev-parse HEAD)
if ($LASTEXITCODE -ne 0 -or $sourceRevision.Count -ne 1 -or $sourceRevision[0] -ne $dependencyReceipt.ChromiumRevision -or $dependencyReceipt.Target -ne '//chrome:chrome') { throw 'GN runtime dependency provenance does not match Chromium source' }
if ($dependencyReceipt.ArgsSha256 -ne (Get-FileHash -LiteralPath (Join-Path $BuildDirectory 'args.gn') -Algorithm SHA256).Hash -or $dependencyReceipt.DependenciesSha256 -ne (Get-FileHash -LiteralPath $RuntimeDependencies -Algorithm SHA256).Hash) { throw 'GN build configuration or runtime dependency list changed' }
if ([IO.Path]::GetFullPath($qualified.executable) -ne [IO.Path]::GetFullPath($browser) -or !$qualified.probe.canvas -or !$qualified.probe.wasm -or !$qualified.compute.available -or ($qualified.compute.values -join ',') -ne '10,11,12,13') { throw 'Chromium browser and WebGPU qualification receipt does not match install source' }
if (!$qualified.executableSha256 -or $qualified.executableSha256 -ne (Get-FileHash -LiteralPath $browser -Algorithm SHA256).Hash) { throw 'Browser binary does not match qualification hash' }
if ([DateTime]::Parse($qualified.date).ToUniversalTime() -lt (Get-Item -LiteralPath $browser).LastWriteTimeUtc) { throw 'Browser binary is newer than its qualification receipt' }
$dependencies = @(Get-Content -LiteralPath $RuntimeDependencies | Where-Object { $_.Trim() } | ForEach-Object { $_.Trim() } | Where-Object { [IO.Path]::GetExtension($_) -notin @('.pdb', '.stamp') } | Sort-Object -Unique)
if (!$dependencies.Count) { throw 'GN runtime dependency list is empty' }
$payloadBytes = 0L
foreach ($dependency in $dependencies) {
    if ([IO.Path]::IsPathRooted($dependency)) { throw 'GN runtime dependency must be relative' }
    $candidate = [IO.Path]::GetFullPath((Join-Path $BuildDirectory $dependency))
    Assert-Inside $candidate $BuildDirectory
    if (!(Test-Path -LiteralPath $candidate -PathType Leaf)) { throw 'GN runtime dependency is missing or not a file' }
    $payloadBytes += (Get-Item -LiteralPath $candidate -Force).Length
}
if ((Get-PSDrive C).Free -lt ($payloadBytes + 8GB)) { throw 'Insufficient space for complete browser payload and build reserve' }
$stage = 'C:\Program Files\BunChromium\staging-' + [Guid]::NewGuid().ToString('N')
New-Item -ItemType Directory -Path $stage | Out-Null
$manifest = @()
foreach ($dependency in $dependencies) {
    if ([IO.Path]::IsPathRooted($dependency)) { throw 'GN runtime dependency must be relative' }
    $from = [IO.Path]::GetFullPath((Join-Path $BuildDirectory $dependency))
    Assert-Inside $from $BuildDirectory
    if (!(Test-Path -LiteralPath $from -PathType Leaf)) { throw 'GN runtime dependency is missing or not a file' }
    $inspect = $from
    do {
        if ((Get-Item -LiteralPath $inspect -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'GN runtime dependency traverses a reparse point' }
        if ($inspect -eq [IO.Path]::GetFullPath($BuildDirectory)) { break }
        $inspect = Split-Path $inspect
    } while ($inspect)
    if ([IO.Path]::GetExtension($from) -in @('.obj', '.lib', '.pdb', '.ilk', '.ninja')) { throw 'Build intermediates cannot be installed as runtime payload' }
    $relative = $from.Substring([IO.Path]::GetFullPath($BuildDirectory).TrimEnd('\').Length + 1)
    $to = Join-Path $stage $relative
    Assert-Inside $to $stage
    New-Item -ItemType Directory -Force -Path (Split-Path $to) | Out-Null
    Copy-Item -LiteralPath $from -Destination $to
    $hash = (Get-FileHash -LiteralPath $from -Algorithm SHA256).Hash
    if ($hash -ne (Get-FileHash -LiteralPath $to -Algorithm SHA256).Hash) { throw 'Installed runtime dependency hash differs' }
    $manifest += [pscustomobject]@{ Path = $relative; Bytes = (Get-Item -LiteralPath $to).Length; Sha256 = $hash }
}
if (!(Test-Path -LiteralPath "$stage\chrome.exe")) { throw 'GN runtime payload lacks chrome.exe' }
if ((Get-FileHash -LiteralPath $browser -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath "$stage\chrome.exe" -Algorithm SHA256).Hash) { throw 'Browser binary changed during install' }
$license = Join-Path $sourceRoot 'LICENSE'
Copy-Item -LiteralPath $license -Destination "$stage\LICENSE.chromium"
$licenseHash = (Get-FileHash -LiteralPath $license -Algorithm SHA256).Hash
if ($licenseHash -ne (Get-FileHash -LiteralPath "$stage\LICENSE.chromium" -Algorithm SHA256).Hash) { throw 'Chromium license copy differs' }
$manifest += [pscustomobject]@{ Path = 'LICENSE.chromium'; Bytes = (Get-Item -LiteralPath "$stage\LICENSE.chromium").Length; Sha256 = $licenseHash }
Invoke-Checked 'C:\Windows\System32\bun.exe' @('msvc', 'exec', 'cl', '/nologo', '/W4', '/WX', '/O2', '/guard:cf', $launcherSource, "/Fo$tools\launcher.obj", "/Fe$tools\bun-chromium.exe", '/link', '/SUBSYSTEM:WINDOWS', '/DYNAMICBASE', '/NXCOMPAT', 'shell32.lib', 'ole32.lib', 'uuid.lib')
Invoke-Checked 'C:\Windows\System32\bun.exe' @('msvc', 'exec', 'cl', '/nologo', '/W4', '/WX', '/O2', '/DBUN_CHROMIUM_LAUNCHER_TEST', $launcherSource, "/Fo$tools\launcher-test.obj", "/Fe$tools\launcher-test.exe", '/link', 'shell32.lib')
Invoke-Checked "$tools\launcher-test.exe" @()
$installedReceipt = [pscustomobject]@{ InstalledUtc = [DateTime]::UtcNow.ToString('o'); Browser = "$application\chrome.exe"; Launcher = $launcher; Profile = $destination; Qualification = $qualified; Dependencies = $dependencyReceipt; Files = $manifest }
$installedReceipt | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath "$stage\bun-chromium-install.json" -Encoding UTF8
Assert-Inside $stage 'C:\Program Files\BunChromium'
Assert-Inside $application 'C:\Program Files\BunChromium'
[IO.Directory]::Move($stage, $application)
[IO.File]::Copy("$tools\bun-chromium.exe", $launcher, $false)
if ((Get-FileHash -LiteralPath $launcher -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath "$tools\bun-chromium.exe" -Algorithm SHA256).Hash) { throw 'Native launcher install hash differs' }
[pscustomobject]@{ Browser = "$application\chrome.exe"; Launcher = $launcher; Profile = $destination; RuntimeFiles = $manifest.Count; BrowserSha256 = (Get-FileHash -LiteralPath "$application\chrome.exe" -Algorithm SHA256).Hash } | ConvertTo-Json
