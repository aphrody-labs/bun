[CmdletBinding()]
param(
  [string]$Checkout = (Join-Path $PSScriptRoot '../../..'),
  [string]$Config,
  [string]$ProductionReceipt,
  [switch]$Apply
)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'The site publication task requires native Windows.' }
if (-not $Config) {
  $siteState = if ($env:APHRODY_HOME) { $env:APHRODY_HOME } else { Join-Path ([Environment]::GetFolderPath('UserProfile')) '.aphrody' }
  $Config = Join-Path $siteState 'config/bun-site-sync.json'
}
$Checkout = [IO.Path]::GetFullPath($Checkout)
$Config = [IO.Path]::GetFullPath($Config)
$bun = (Get-Command bun -CommandType Application -ErrorAction Stop).Source
function Resolve-CheckoutReference([string]$Reference) {
  $canonical = & $bun --no-env-file -e 'process.stdout.write(require("node:fs").realpathSync(Bun.argv.at(-1)))' -- $Reference
  if ($LASTEXITCODE -ne 0) { throw 'The selected checkout reference cannot be resolved.' }
  return ([string]$canonical).Trim()
}
$Checkout = Resolve-CheckoutReference $Checkout
$entry = Join-Path $Checkout 'packages/web/site/auto-publish.ts'
$siteConfig = Get-Content -LiteralPath $Config -Raw | ConvertFrom-Json
foreach ($field in @('checkout','captureRoot','buildRoot','ownerConnectionFile','readerConnectionFile','credentialFile')) {
  $reference = $siteConfig.$field
  if (-not ($reference -is [string]) -or -not [IO.Path]::IsPathFullyQualified($reference)) { throw 'The site configuration requires absolute references.' }
}
foreach ($field in @('ownerConnectionFile','readerConnectionFile','credentialFile')) {
  if (-not (Test-Path -LiteralPath $siteConfig.$field -PathType Leaf)) { throw 'A protected publication reference is missing.' }
}
if (-not (Test-Path -LiteralPath (Join-Path $siteConfig.captureRoot 'manifest.json') -PathType Leaf)) { throw 'The source capture receipt is missing.' }
if ((Resolve-CheckoutReference $siteConfig.checkout).TrimEnd('\','/') -ne $Checkout.TrimEnd('\','/')) { throw 'The task and pipeline checkouts differ.' }
$head = (& git -C $Checkout rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $head -notmatch '^[a-f0-9]{40}$') { throw 'The selected source commit is unavailable.' }
$remote = if ($siteConfig.sourceRemote) { $siteConfig.sourceRemote } else { 'origin' }
if ($remote -notmatch '^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$') { throw 'The site source remote is invalid.' }
& git -C $Checkout merge-base --is-ancestor $head "refs/remotes/$remote/main"
if ($LASTEXITCODE -ne 0) { throw 'Publish and push the selected source before installing its task.' }
$blob = (& git -C $Checkout rev-parse "${head}:packages/web/site/auto-publish.ts").Trim()
if ($LASTEXITCODE -ne 0 -or $blob -notmatch '^[a-f0-9]{40}$') { throw 'The native publisher is not committed.' }
$workingBlob = (& git -C $Checkout hash-object $entry).Trim()
if ($LASTEXITCODE -ne 0 -or $workingBlob -ne $blob) { throw 'The native publisher differs from its committed source.' }
$taskName = 'Aphrody Site Publish'
$description = 'Aphrody source-pinned site publisher; five-minute native Windows owner task.'
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing -and $existing.Description -ne $description) { throw 'The selected task name belongs to another owner.' }
if (-not $Apply) {
  [pscustomobject]@{ task=$taskName; intervalMinutes=5; bootstrapVerified=$true; source=$head; apply=$false } | ConvertTo-Json -Compress
  return
}
if (-not $ProductionReceipt) { throw 'A successful production pipeline receipt is required before task activation.' }
$receipt = Get-Content -LiteralPath $ProductionReceipt -Raw | ConvertFrom-Json
if ($receipt.commit -notmatch '^[a-f0-9]{40}$' -or $receipt.evidence -notmatch '^[a-f0-9]{64}$' -or
  $receipt.snapshot.source -ne $receipt.commit -or $receipt.deployment.source -ne $receipt.commit -or
  $receipt.deployment.qualified -ne $true -or $receipt.deployment.dryRun -ne $false) {
  throw 'The production receipt is incomplete or is a dry run.'
}
& git -C $Checkout merge-base --is-ancestor $receipt.commit "refs/remotes/$remote/main"
if ($LASTEXITCODE -ne 0) { throw 'The production source is outside the published main history.' }
$publishedSource = (& git -C $Checkout rev-parse "refs/remotes/$remote/main^{commit}").Trim()
if ($LASTEXITCODE -ne 0 -or $receipt.commit -ne $publishedSource) { throw 'The current published main source has no production qualification receipt.' }
$qualifiedBootstrap = (& git -C $Checkout rev-parse "$($receipt.commit):packages/web/site/auto-publish.ts").Trim()
if ($LASTEXITCODE -ne 0 -or $qualifiedBootstrap -ne $blob) { throw 'The production source does not contain this publisher bootstrap.' }
$public = Invoke-RestMethod -Uri 'https://bun.aphrody.app/publish.json' -TimeoutSec 15 -Headers @{ 'Cache-Control'='no-cache' }
$api = Invoke-RestMethod -Uri 'https://bun.aphrody.app/api/site/snapshot' -TimeoutSec 15 -Headers @{ 'Cache-Control'='no-cache' }
$apiSource = if ($api.snapshot) { $api.snapshot.source } else { $api.source }
if ($public.commit -ne $receipt.commit -or $public.evidence -ne $receipt.evidence -or $apiSource -ne $receipt.commit) {
  throw 'Public static and database routes do not confirm the production receipt.'
}
function Quote-TaskArgument([string]$Value) {
  if ($Value.Contains('"') -or $Value.Contains([char]0)) { throw 'The task argument is invalid.' }
  return '"' + $Value + '"'
}
$arguments = '--no-env-file ' + (Quote-TaskArgument $entry) + ' --config ' + (Quote-TaskArgument $Config) + ' --bootstrap-blob ' + $blob
$action = New-ScheduledTaskAction -Execute $bun -Argument $arguments -WorkingDirectory $Checkout
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -StartWhenAvailable -RunOnlyIfNetworkAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$task = New-ScheduledTask -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description $description
Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null
[pscustomobject]@{ task=$taskName; intervalMinutes=5; source=$head; apply=$true; log='auto-publish-last.json'; logon='interactive' } | ConvertTo-Json -Compress
