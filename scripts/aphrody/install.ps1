# Installs the aphrody-labs/bun runtime from its GitHub releases.
#
#   irm https://raw.githubusercontent.com/aphrody-labs/bun/main/scripts/aphrody/install.ps1 | iex
#   & ([scriptblock]::Create((irm .../install.ps1))) -Version 1.4.3   # newest aphrody.N build of base 1.4.3
#   & ([scriptblock]::Create((irm .../install.ps1))) -Version aphrody-v1.4.3-aphrody.1
#
# BUN_INSTALL (default ~\.bun) receives bin\bun.exe and bin\bunx.exe. -NoPathUpdate skips the user PATH.
# APHRODY_BUN_REPO overrides the repository, GITHUB_TOKEN (or GH_TOKEN) authenticates the release lookup.
param(
  [String]$Version = "latest",
  [Switch]$DebugInfo = $false,
  [Switch]$NoPathUpdate = $false
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$Repo = if ($env:APHRODY_BUN_REPO) { $env:APHRODY_BUN_REPO } else { "aphrody-labs/bun" }
$Token = if ($env:GITHUB_TOKEN) { $env:GITHUB_TOKEN } else { $env:GH_TOKEN }
$Headers = @{ Accept = "application/vnd.github+json" }
if ($Token) { $Headers.Authorization = "Bearer $Token" }

$Arch = (Get-CimInstance Win32_OperatingSystem).OSArchitecture
if ($Arch -match "ARM") { throw "no windows-aarch64 build of $Repo" }
$Target = if ($DebugInfo) { "bun-windows-x64-profile" } else { "bun-windows-x64" }
$Exe = if ($DebugInfo) { "bun-profile.exe" } else { "bun.exe" }

$Tag = switch -Regex ($Version) {
  "^latest$" { (Invoke-RestMethod -Headers $Headers "https://api.github.com/repos/$Repo/releases/latest").tag_name }
  "^aphrody-v" { $Version }
  "^(bun-)?v?(\d+\.\d+\.\d+)$" {
    $Base = $Matches[2]
    (Invoke-RestMethod -Headers $Headers "https://api.github.com/repos/$Repo/releases?per_page=100").tag_name |
      Where-Object { $_ -match "^aphrody-v$([regex]::Escape($Base))-aphrody\.(\d+)$" } |
      Sort-Object { [int]($_ -replace '^.*\.', '') } | Select-Object -Last 1
  }
  default { throw "Version must be latest, X.Y.Z or aphrody-vX.Y.Z-aphrody.N" }
}
if (-not $Tag) { throw "no $Repo release for $Version" }

$BaseUrl = "https://github.com/$Repo/releases/download/$Tag"
$Tmp = Join-Path ([System.IO.Path]::GetTempPath()) "aphrody-bun-$([guid]::NewGuid())"
New-Item -ItemType Directory -Force $Tmp | Out-Null
try {
  $Zip = Join-Path $Tmp "$Target.zip"
  Invoke-WebRequest "$BaseUrl/$Target.zip" -OutFile $Zip
  $SumsFile = Join-Path $Tmp "SHA256SUMS.txt"
  try { Invoke-WebRequest "$BaseUrl/SHA256SUMS.txt" -OutFile $SumsFile; $Sums = Get-Content $SumsFile } catch { $Sums = $null }
  if ($Sums) {
    $Want = ($Sums | Where-Object { $_ -match " $Target\.zip\s*$" } | Select-Object -First 1) -replace '\s.*$', ''
    $Got = (Get-FileHash -Algorithm SHA256 $Zip).Hash.ToLower()
    if (-not $Want -or $Want.ToLower() -ne $Got) { throw "checksum mismatch for $Target.zip" }
  }
  Expand-Archive -Force $Zip $Tmp

  $Root = if ($env:BUN_INSTALL) { $env:BUN_INSTALL } else { Join-Path $HOME ".bun" }
  $Bin = Join-Path $Root "bin"
  New-Item -ItemType Directory -Force $Bin | Out-Null
  $Bun = Join-Path $Bin "bun.exe"
  Move-Item -Force (Join-Path $Tmp "$Target\$Exe") $Bun
  $env:IS_BUN_AUTO_UPDATE = "1"
  & $Bun completions *> $null
  $env:IS_BUN_AUTO_UPDATE = $null
  $Bunx = Join-Path $Bin "bunx.exe"
  if (-not (Test-Path $Bunx)) { Copy-Item -Force $Bun $Bunx }
  Write-Output "Installed $Tag ($(& $Bun --revision)) to $Bun"

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
