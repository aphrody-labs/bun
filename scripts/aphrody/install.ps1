# Installs the aphrody-labs/bun runtime from its releases, mirrored on https://dist.aphrody.app (Cloudflare R2), else GitHub.
#
#   irm https://raw.githubusercontent.com/aphrody-labs/bun/main/scripts/aphrody/install.ps1 | iex
#   & ([scriptblock]::Create((irm .../install.ps1))) -Version 1.4.4   # exact stable release
#   & ([scriptblock]::Create((irm .../install.ps1))) -Version bun-v1.4.4                # exact release tag
#
# BUN_INSTALL (default ~\.bun) keeps user state. -BinDir or APHRODY_BUN_BIN_DIR overrides the executable directory.
# System32 requires an administrator token. -NoPathUpdate skips the user PATH.
# APHRODY_BUN_DIST overrides the mirror (empty: GitHub only), APHRODY_BUN_REPO selects the repository; GITHUB_TOKEN (or GH_TOKEN) authenticates metadata and assets.
param(
  [String]$Version = "latest",
  [String]$BinDir = "",
  [ValidateSet("perf", "full")]
  [String]$Flavor = $(if ($env:APHRODY_BUN_FLAVOR) { $env:APHRODY_BUN_FLAVOR } else { "perf" }),
  [Switch]$DebugInfo = $false,
  [Switch]$NoPathUpdate = $false
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Repo = if ($env:APHRODY_BUN_REPO) { $env:APHRODY_BUN_REPO } else { "aphrody-labs/bun" }
$Dist = if ($null -ne $env:APHRODY_BUN_DIST) { $env:APHRODY_BUN_DIST } else { "https://dist.aphrody.app/bun" }
$Token = if ($env:GITHUB_TOKEN) { $env:GITHUB_TOKEN } else { $env:GH_TOKEN }
$Headers = @{ Accept = "application/vnd.github+json" }
if ($Token) { $Headers.Authorization = "Bearer $Token" }

$Arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
$BunArch = switch ($Arch) {
  "Arm64" { "aarch64" }
  "X64" { "x64" }
  default { throw "unsupported Windows architecture: $Arch" }
}
if ($DebugInfo -and $Flavor -eq "full") { throw "full debug-info archives are not published" }
$Target = if ($DebugInfo) { "bun-windows-$BunArch-profile" } else { "bun-windows-$BunArch" }
if ($Flavor -eq "full") { $Target += "-full" }
$Exe = if ($DebugInfo) { "bun-profile.exe" } else { "bun.exe" }

$Tag = switch -Regex ($Version) {
  # The repository also publishes other releases (tools, n2b): the newest runtime release, not GitHub's "latest".
  "^latest$" {
    $Mirrored = if ($Dist) { try { (Invoke-RestMethod "$Dist/latest.json").tag } catch { $null } }
    if ($Mirrored) { $Mirrored; break }
    (Invoke-RestMethod -Headers $Headers "https://api.github.com/repos/$Repo/releases?per_page=100") |
      Where-Object { -not $_.draft -and -not $_.prerelease -and $_.tag_name -match '^(bun-v\d+\.\d+\.\d+|aphrody-v\d+\.\d+\.\d+-aphrody\.\d+)$' } |
      Select-Object -First 1 -ExpandProperty tag_name
  }
  "^aphrody-v" { $Version }
  "^bun-v\d+\.\d+\.\d+$" { $Version; break }
  "^(bun-)?v?(\d+\.\d+\.\d+)$" {
    $Base = $Matches[2]
    $Releases = Invoke-RestMethod -Headers $Headers "https://api.github.com/repos/$Repo/releases?per_page=100"
    $Stable = $Releases | Where-Object { -not $_.draft -and -not $_.prerelease -and $_.tag_name -eq "bun-v$Base" }
    if ($Stable) { "bun-v$Base" } else {
      $Releases | Where-Object { -not $_.draft -and -not $_.prerelease } | Select-Object -ExpandProperty tag_name |
        Where-Object { $_ -match "^aphrody-v$([regex]::Escape($Base))-aphrody\.(\d+)$" } |
        Sort-Object { [int]($_ -replace '^.*\.', '') } | Select-Object -Last 1
    }
  }
  default { throw "Version must be latest, X.Y.Z or aphrody-vX.Y.Z-aphrody.N" }
}
if (-not $Tag) { throw "no $Repo release for $Version" }

$BaseUrl = "https://github.com/$Repo/releases/download/$Tag"
$ReleaseAssets = $null
if ($Token) {
  $Release = Invoke-RestMethod -Headers $Headers "https://api.github.com/repos/$Repo/releases/tags/$Tag"
  $ReleaseAssets = @($Release.assets)
}
function Get-ReleaseArchive {
  param([string]$Name, [string]$Destination)
  if ($Token) {
    $Assets = @($ReleaseAssets | Where-Object { $_.name -ceq $Name })
    if ($Assets.Count -ne 1) { throw "release must contain exactly one asset named $Name" }
    $AssetUrl = [string]$Assets[0].url
    $Expected = "^https://api\.github\.com/repos/" + [regex]::Escape($Repo) + "/releases/assets/[0-9]+$"
    if ($AssetUrl -notmatch $Expected) { throw "release asset URL does not belong to the selected repository" }
    $AssetHeaders = @{ Accept = "application/octet-stream"; Authorization = "Bearer $Token" }
    Invoke-WebRequest $AssetUrl -Headers $AssetHeaders -OutFile $Destination
  } else {
    # The mirror holds the same bytes as the release; SHA256SUMS.txt verifies whichever source answered.
    if ($Dist) {
      try { Invoke-WebRequest "$Dist/$Tag/$Name" -OutFile $Destination; return } catch {}
    }
    Invoke-WebRequest "$BaseUrl/$Name" -OutFile $Destination
  }
}
$Tmp = Join-Path ([System.IO.Path]::GetTempPath()) "aphrody-bun-$([guid]::NewGuid())"
New-Item -ItemType Directory -Force $Tmp | Out-Null
try {
  $Zip = Join-Path $Tmp "$Target.zip"
  Get-ReleaseArchive "$Target.zip" $Zip
  $SumsFile = Join-Path $Tmp "SHA256SUMS.txt"
  try { Get-ReleaseArchive "SHA256SUMS.txt" $SumsFile } catch { throw "release checksums are required" }
  $ChecksumPattern = "^([a-fA-F0-9]{64})\s+" + [regex]::Escape("$Target.zip") + "\s*$"
  $Rows = @(Get-Content $SumsFile | Where-Object { $_ -match $ChecksumPattern })
  if ($Rows.Count -ne 1) { throw "release checksum must name the archive exactly once" }
  $Want = ($Rows[0] -split "\s+")[0].ToLower()
  $Got = (Get-FileHash -Algorithm SHA256 $Zip).Hash.ToLower()
  if ($Want -ne $Got) { throw "checksum mismatch for $Target.zip" }
  Expand-Archive -Force $Zip $Tmp
  $Candidate = Join-Path $Tmp "$Target\$Exe"
  $Revision = & $Candidate --revision
  if ($LASTEXITCODE -ne 0) { throw "downloaded runtime does not run on this system" }
  & $Candidate -e 'if (Bun.resolveSync("picocolors", ".") !== "picocolors") process.exit(1)'
  if ($LASTEXITCODE -ne 0) { throw "downloaded runtime is not the Aphrody fork" }
  $ExpectedVersion = $Tag -replace "^(bun-v|aphrody-v)", ""
  $ActualVersion = & $Candidate --version
  if ($LASTEXITCODE -ne 0 -or $ActualVersion -cne $ExpectedVersion) { throw "downloaded runtime version does not match the selected release ($ActualVersion != $ExpectedVersion)" }
  if ($Flavor -eq "full") {
    $Manifest = Get-Content -LiteralPath (Join-Path $Tmp "$Target/release-flavor.json") -Raw | ConvertFrom-Json
    if ($Manifest.flavor -cne "full" -or $Manifest.compiledFeatures.coreutils -ne $true) {
      throw "full archive must contain its compiled feature manifest"
    }
  }

  $Root = if ($env:BUN_INSTALL) { $env:BUN_INSTALL } else { Join-Path $HOME ".bun" }
  $Bin = if ($BinDir) { [System.IO.Path]::GetFullPath($BinDir) } elseif ($env:APHRODY_BUN_BIN_DIR) { [System.IO.Path]::GetFullPath($env:APHRODY_BUN_BIN_DIR) } else { Join-Path $Root "bin" }
  New-Item -ItemType Directory -Force $Bin | Out-Null
  $Bun = Join-Path $Bin "bun.exe"
  $Stage = Join-Path $Bin ".bun-stage-$([guid]::NewGuid()).exe"
  $Changes = [Collections.Generic.List[object]]::new()
  $Committed = $false
  try {
    Copy-Item -LiteralPath $Candidate -Destination $Stage
    foreach ($Alias in "bun.exe", "bunx.exe", "node.exe", "npm.exe", "npx.exe") {
      $Path = Join-Path $Bin $Alias
      $Exists = Test-Path -LiteralPath $Path
      if ($Alias -notin "bun.exe", "bunx.exe" -and -not $Exists) { continue }
      if ($Exists -and (Get-Item -LiteralPath $Path).PSIsContainer) { throw "runtime paths must not be directories" }
      $Change = @{ Path = $Path; Backup = $null; Created = $false }
      $Changes.Add($Change)
      if ($Exists) {
        $Change.Backup = "$Path.backup-$([guid]::NewGuid())"
        Move-Item -LiteralPath $Path -Destination $Change.Backup
      }
      if ($Alias -eq "bun.exe") { Move-Item -LiteralPath $Stage -Destination $Path }
      else { New-Item -ItemType HardLink -Path $Path -Target $Bun | Out-Null }
      $Change.Created = $true
    }
    $Committed = $true
  } catch {
    $Failure = $_
    for ($Index = $Changes.Count - 1; $Index -ge 0; $Index--) {
      $Change = $Changes[$Index]
      if ($Change.Created) { Remove-Item -LiteralPath $Change.Path -Force }
      if ($Change.Backup -and (Test-Path -LiteralPath $Change.Backup)) {
        Move-Item -LiteralPath $Change.Backup -Destination $Change.Path
      }
    }
    throw $Failure
  } finally {
    if (Test-Path -LiteralPath $Stage) { Remove-Item -LiteralPath $Stage -Force }
    if ($Committed) {
      foreach ($Change in $Changes) {
        if ($Change.Backup) { Remove-Item -LiteralPath $Change.Backup -Force }
      }
    }
  }
  $PreviousAutoUpdate = $env:IS_BUN_AUTO_UPDATE
  try { $env:IS_BUN_AUTO_UPDATE = "1"; & $Bun completions *> $null }
  finally { $env:IS_BUN_AUTO_UPDATE = $PreviousAutoUpdate }
  Write-Output "Installed $Tag ($Revision) to $Bun"

  if (-not $NoPathUpdate) {
    $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if (-not (($UserPath -split ";") -contains $Bin)) {
      [Environment]::SetEnvironmentVariable("Path", "$Bin;$UserPath", "User")
      Write-Output "Added $Bin to the user PATH (open a new terminal)"
    }
  }
} finally {
  Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
}
