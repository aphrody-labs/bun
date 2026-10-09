# Clones and builds the aphrody-labs/bun fork in one command (Windows 10/11, x64 or arm64):
#
#   irm https://aphrody.com/bun/setup.ps1 | iex
#   irm https://raw.githubusercontent.com/aphrody-labs/bun/main/scripts/aphrody/install-dev.ps1 | iex
#   & ([scriptblock]::Create((irm https://aphrody.com/bun/setup.ps1))) --dry-run   # any setup.ts option
#
# Installs the fork's bun when the machine has none (or an upstream one), then runs scripts/aphrody/setup.ts,
# which clones the repository (default C:\bun, or APHRODY_BUN_CHECKOUT), installs Git, CMake, NASM and
# PowerShell 7 (winget), LLVM, rustup and the pinned nightly, MSVC and the Windows SDK (`bun msvc setup`),
# fetches the native dependencies and ends with `bun bd --version`. Safe to run again: finished steps are skipped.
# Through `| iex` options come from $env:APHRODY_BUN_SETUP_ARGS (e.g. "--dry-run --no-build").
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$SetupArgs = @($args)
if ($SetupArgs.Count -eq 0 -and $env:APHRODY_BUN_SETUP_ARGS) { $SetupArgs = $env:APHRODY_BUN_SETUP_ARGS -split '\s+' | Where-Object { $_ } }
$Repo = if ($env:APHRODY_BUN_REPO) { $env:APHRODY_BUN_REPO } else { "aphrody-labs/bun" }
$Ref = if ($env:APHRODY_BUN_REF) { $env:APHRODY_BUN_REF } else { "main" }
$Raw = "https://raw.githubusercontent.com/$Repo/$Ref/scripts/aphrody"
$BunRoot = if ($env:BUN_INSTALL) { $env:BUN_INSTALL } else { Join-Path $HOME ".bun" }
$BunBin = Join-Path $BunRoot "bin"
if (-not (($env:Path -split ";") -contains $BunBin)) { $env:Path = "$BunBin;$env:Path" }

function Test-ForkBun {
  $Bun = Get-Command bun -ErrorAction SilentlyContinue
  if (-not $Bun) { return $false }
  Push-Location ([System.IO.Path]::GetTempPath())
  try {
    # The fork resolves these npm names to built-in modules; upstream Bun cannot.
    $Out = & $Bun.Source -e "await import('picocolors'); await import('tiny-invariant'); console.log('aphrody')" 2>$null
    return ($LASTEXITCODE -eq 0 -and "$Out".Trim() -eq "aphrody")
  } finally { Pop-Location }
}

if (-not (Test-ForkBun)) {
  & ([scriptblock]::Create((Invoke-RestMethod "$Raw/install.ps1")))
  if (-not (Test-ForkBun)) { throw "bun on PATH is not the aphrody-labs/bun build" }
}

# A --dir among the arguments comes last and wins over this default.
$Checkout = if ($env:APHRODY_BUN_CHECKOUT) { $env:APHRODY_BUN_CHECKOUT } else { "C:\bun" }
$Local = Join-Path $Checkout "scripts\aphrody\setup.ts"
# No exit: under `irm | iex` it would close the calling PowerShell.
if (Test-Path $Local) {
  & bun $Local --dir $Checkout @SetupArgs
} else {
  $Tmp = Join-Path ([System.IO.Path]::GetTempPath()) "aphrody-bun-setup-$([guid]::NewGuid())"
  New-Item -ItemType Directory -Force $Tmp | Out-Null
  try {
    Invoke-WebRequest "$Raw/setup.ts" -OutFile (Join-Path $Tmp "setup.ts")
    & bun (Join-Path $Tmp "setup.ts") --dir $Checkout --ref $Ref @SetupArgs
  } finally {
    Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
  }
}
if ($LASTEXITCODE -ne 0) { throw "aphrody-labs/bun setup failed (exit code $LASTEXITCODE)" }
