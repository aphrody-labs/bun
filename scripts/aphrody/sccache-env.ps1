$ErrorActionPreference = 'Stop'

$cloudflareEnv = Join-Path $HOME '.aphrody\config\cloudflare.env'
if (!(Test-Path -LiteralPath $cloudflareEnv)) { throw "Missing protected Cloudflare environment: $cloudflareEnv" }

foreach ($line in [IO.File]::ReadLines($cloudflareEnv)) {
    if ($line -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
        $value = $Matches[2] -replace '^(?:"(.*)"|''(.*)'')$', '$1$2'
        [Environment]::SetEnvironmentVariable($Matches[1], $value, 'Process')
    }
}

# Like sccache-env.sh: the machine's own SCCACHE_DIR and size win, so one local cache serves every shell.
if (!$env:SCCACHE_DIR) { $env:SCCACHE_DIR = Join-Path $HOME '.cache\sccache' }
if (!$env:SCCACHE_CACHE_SIZE) { $env:SCCACHE_CACHE_SIZE = '30G' }
$env:SCCACHE_BASEDIRS = 'C:\bun;C:\src'
$env:SCCACHE_IDLE_TIMEOUT = '0'
$env:SCCACHE_CLIENT_SIDE = '1'
$env:SCCACHE_MULTILEVEL_CHAIN = 'disk,s3'
$env:SCCACHE_MULTILEVEL_WRITE_ERROR_POLICY = 'l0'
$env:SCCACHE_BUCKET = 'aphrody-dist'
$env:SCCACHE_ENDPOINT = $env:R2_ENDPOINT
$env:SCCACHE_REGION = 'auto'
$env:SCCACHE_S3_USE_SSL = 'true'
$env:SCCACHE_S3_KEY_PREFIX = 'bun-v1'
$env:RUSTC_WRAPPER = (Get-Command sccache -ErrorAction Stop).Source

