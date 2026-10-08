# Ensures that commands run in a Visual Studio environment.
# This is required to run commands like cmake and ninja on Windows.

$ErrorActionPreference = "Stop"

# Detect system architecture
$script:IsARM64 = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -eq [System.Runtime.InteropServices.Architecture]::Arm64
$script:VsArch = if ($script:IsARM64) { "arm64" } else { "amd64" }

if($env:VSINSTALLDIR -eq $null) {
  Write-Host "Loading Visual Studio environment, this may take a second..."

  $vswhere = "C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe"
  if (!(Test-Path $vswhere)) {
    throw "Command not found: vswhere (did you install Visual Studio?)"
  }

  $vsDir = (& $vswhere -prerelease -latest -products * -property installationPath)
  if ($vsDir -eq $null) {
    # Check common VS installation paths
    $searchPaths = @(
      "C:\Program Files\Microsoft Visual Studio\2022",
      "C:\Program Files (x86)\Microsoft Visual Studio\2022"
    )
    foreach ($searchPath in $searchPaths) {
      if (Test-Path $searchPath) {
        $vsDir = (Get-ChildItem -Path $searchPath -Directory | Select-Object -First 1).FullName
        if ($vsDir -ne $null) { break }
      }
    }
    if ($vsDir -eq $null) {
      throw "Visual Studio directory not found."
    }
  }

  # VsDevCmd.bat runs vswhere.exe by name.
  $env:PATH = "$(Split-Path $vswhere);$env:PATH"

  # The prebuilt WebKit is compiled against the pinned MSVC toolset's STL, and
  # a newer STL is not ABI-compatible with it (see checkNativeMsvcToolset in
  # scripts/build/winsysroot.ts). Use the pinned toolset when it is installed.
  $toolsetArgs = ""
  $specFile = Join-Path $PSScriptRoot "build\ci-images\spec.ts"
  if ((Test-Path $specFile) -and ((Get-Content -Raw $specFile) -match 'windowsSysroot:\s*\{[^}]*crt:\s*"(\d+\.\d+)\.')) {
    $pinnedToolset = $Matches[1]
    if (Get-ChildItem -Path (Join-Path $vsDir "VC\Tools\MSVC") -Directory -Filter "$pinnedToolset.*" -ErrorAction SilentlyContinue) {
      $toolsetArgs = " -vcvars_ver=$pinnedToolset"
    }
  }

  Push-Location $vsDir
  try {
    # -host_arch only accepts "x86" or "amd64" — even on native ARM64, use "amd64"
    $hostArch = if ($script:VsArch -eq "arm64") { "amd64" } else { $script:VsArch }
    Import-Module (Join-Path -Path $vsDir -ChildPath "Common7\Tools\Microsoft.VisualStudio.DevShell.dll")
    Enter-VsDevShell -VsInstallPath $vsDir -SkipAutomaticLocation -DevCmdArguments "-arch=$($script:VsArch) -host_arch=$hostArch -no_logo$toolsetArgs"

    # VS dev shell with -HostArch amd64 sets PROCESSOR_ARCHITECTURE=AMD64,
    # which causes CMake to misdetect the system as x64. Restore it on ARM64.
    if ($script:IsARM64) {
      $env:PROCESSOR_ARCHITECTURE = "ARM64"
    }
  } finally {
    Pop-Location
  }
}

if($env:VSCMD_ARG_TGT_ARCH -eq "x86") {
  throw "Visual Studio environment is targeting 32 bit x86, but only 64-bit architectures (x64/arm64) are supported."
}

if ($args.Count -gt 0) {
  $command = $args[0]
  $commandArgs = @()
  if ($args.Count -gt 1) {
    $commandArgs = @($args[1..($args.Count - 1)] | % {$_})
  }

  # Don't print the full command as it may contain sensitive information like certificates
  # Just show the command name and basic info
  $displayArgs = @()
  foreach ($arg in $commandArgs) {
    if ($arg -match "^-") {
      # Include flags
      $displayArgs += $arg
    } elseif ($arg -match "\.(mjs|js|ts|cmake|zig|cpp|c|h|exe)$") {
      # Include file names
      $displayArgs += $arg
    } elseif ($arg.Length -gt 100) {
      # Truncate long arguments (likely certificates or encoded data)
      $displayArgs += "[REDACTED]"
    } else {
      $displayArgs += $arg
    }
  }

  Write-Host "$ $command $displayArgs"
  & $command $commandArgs
  exit $LASTEXITCODE
}
