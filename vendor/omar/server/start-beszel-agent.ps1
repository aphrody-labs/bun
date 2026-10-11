$ErrorActionPreference = 'Stop'
$private = 'C:/Users/omara/.aphrody/private/omar-server'
foreach ($line in Get-Content "$private/agent.env") {
    if ($line -match '^([^#=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process') }
}
$env:PATH = 'C:/Windows/System32;C:/Program Files/NVIDIA Corporation/NVSMI;' + $env:PATH
$env:DATA_DIR = "$private/agent-data"
$ErrorActionPreference = 'Continue'
& 'C:/Users/omara/AppData/Local/Microsoft/WinGet/Packages/henrygd.beszel-agent_Microsoft.Winget.Source_8wekyb3d8bbwe/beszel-agent.exe' 1>> "$private/agent.log" 2>&1
exit $LASTEXITCODE
