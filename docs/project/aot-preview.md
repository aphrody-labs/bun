# Bun AOT preview

A build of upstream's ahead-of-time compiler, [oven-sh/bun#45631](https://github.com/oven-sh/bun/pull/45631)
("Compile TypeScript to machine code ahead of time: `bun build --compile --aot`"), at commit
`5b598476cda9537b813459730d9002017aa45b40`. It is upstream Bun 1.4.4 plus that pull request, with none of
this fork's changes, so fork-only APIs and commands (`bun msvc`, `bun factory`, `bun:windows`, Bun Video and
the rest of `bun-fork-features`) are missing. It is a preview for benchmarks and scripts, not the fork's
release.

Release: [`bun-aot-pr45631-5b598476cda`](https://github.com/aphrody-labs/bun/releases/tag/bun-aot-pr45631-5b598476cda)
(prerelease, Linux x64 glibc and Windows x64, `bun --revision` = `1.4.4-canary.1+5b598476c`). The release
notes say how it was built: upstream's `release` profile with ThinLTO and the trimmable link, plus a traced
symbol order file on Linux.

## Install

```sh
curl -fsSL https://github.com/aphrody-labs/bun/releases/download/bun-aot-pr45631-5b598476cda/install-aot.sh | bash
ln -sfn ~/.bun-aot/bin/bun ~/.bun/bin/bun-aot
```

```powershell
& ([scriptblock]::Create((irm https://github.com/aphrody-labs/bun/releases/download/bun-aot-pr45631-5b598476cda/install-aot.ps1)))
Copy-Item $env:USERPROFILE\.bun-aot\bin\bun.exe $env:USERPROFILE\.bun\bin\bun-aot.exe -Force
```

The installers verify `SHA256SUMS.txt` and install to `~/.bun-aot/bin/bun` (`%USERPROFILE%\.bun-aot\bin\bun.exe`).
They leave PATH alone. `--default` puts that directory first on PATH, so it becomes `bun` (shell rc files on
Linux, the user PATH on Windows, never the machine PATH). `--uninstall` removes it again. The second line
exposes it as `bun-aot` next to the fork's `bun`. On Windows, `bun-aot.exe` is a copy, so repeat the
`Copy-Item` after an update.

On `vps` and on the Windows workstation it is installed this way, without `--default`.

## Running the fork's scripts

Call the script itself, not a `bun run` package script: package scripts start `bun` from PATH, which is
still the fork's.

| Instead of                | Run                                                                       |
| ------------------------- | ------------------------------------------------------------------------- |
| `bun bd`                  | `BUN_DEBUG_QUIET_LOGS=1 bun-aot scripts/build.ts --profile=debug --quiet` |
| `bun run build:release`   | `bun-aot scripts/build.ts --profile=release`                              |
| `bun bd --configure-only` | `bun-aot scripts/build.ts --profile=debug --configure-only`               |
| `bun scripts/<name>.ts`   | `bun-aot scripts/<name>.ts`                                               |

`scripts/build.ts --help` works on both hosts, and `--profile=debug --configure-only` configured a scratch
copy of the fork on `vps`. A script that uses a fork-only API or command still needs the fork's `bun`. On
Windows, `scripts/build.ts` loads the MSVC environment through `bun msvc sync`, which this build lacks, and
falls back to the `bun-msvc` binary of `vendor/find-msvc-tools` through cargo.

To try the compiler:

```sh
bun-aot build --compile --aot ./hello.ts --outfile hello   # or: bun-aot compile ./hello.ts
./hello
```

This commit has no `Bun.isAOT` (it is `undefined`). An AOT executable shows itself by its size: a 5-line
program is 68 MB on Linux and 80 MB on Windows, against 140 MB and 147 MB without `--aot`. Its `.bun` section
holds the compiled image, not source text. Upstream calls AOT experimental, and on Windows "many tests still
fail".

## Benchmarking

Compare against upstream 1.4.4 (the official `bun-v1.4.4` zip, `1.4.4+38afee6c8`, checked against its
`SHASUMS256.txt`) and the fork's release binary. Copy the fork's binary first, so that a rebuild of
`C:\bun\build\release` during the run doesn't change it. Close other builds: a build in the background
easily changes these numbers by 2x.

```powershell
$fork = "$env:LOCALAPPDATA\bun-aot-bench\fork\bun.exe"   # a copy of C:\bun\build\release\bun.exe
$up = "$env:LOCALAPPDATA\bun-aot-bench\bun-1.4.4\bun-windows-x64\bun.exe"
$aot = "$env:USERPROFILE\.bun-aot\bin\bun.exe"
hyperfine -N --warmup 10 --runs 100 -n aot "`"$aot`" -e 0" -n fork "`"$fork`" -e 0" -n upstream-1.4.4 "`"$up`" -e 0"
```

On `vps` the same comparison uses `~/.bun-aot/bin/bun`, the fork's `~/.bun/bin/bun` and the official
1.4.4 in `~/build/cache/bench/bun-1.4.4/bun-linux-x64/bun`. Pin the run to free CPUs with
`bun ~/src/bun/scripts/factory/factory.ts run --max-slots 1 -- hyperfine ...`.

The measured set: `--version`, `-e 0`, a warm `bun install` (cache full, `node_modules` removed before each
run, `--prepare`), `bun test` of a one-test file, `bun build --minify` of a React app (react, react-dom,
zod, date-fns, lodash-es), 200 `Bun.spawnSync` calls of a trivial program (`/bin/true`, `cmd /c exit 0`),
and `scripts/build.ts --help` in the fork. The scripts that ran them are
`~/build/out/bun-upstream/scripts/bench.sh` on `vps` and `%LOCALAPPDATA%\bun-aot-bench\scripts\bench.ps1`
on the workstation. Results from 2026-10-25 (medians):

| Windows x64 (i7-13700F) |     aot |            fork |  upstream-1.4.4 |
| ----------------------- | ------: | --------------: | --------------: |
| version                 |  8.7 ms | 10.0 ms (1.15x) |  8.3 ms (0.96x) |
| eval0                   | 20.4 ms | 21.8 ms (1.07x) | 18.3 ms (0.90x) |
| install-warm            | 85.7 ms | 86.1 ms (1.01x) | 80.8 ms (0.94x) |
| test-tiny               | 20.3 ms | 21.7 ms (1.07x) | 20.6 ms (1.02x) |
| build-app               | 66.1 ms | 66.4 ms (1.00x) | 61.4 ms (0.93x) |
| spawnSync200            | 2274 ms | 4640 ms (2.04x) | 2440 ms (1.07x) |
| fork-build-help         | 61.1 ms | 66.4 ms (1.09x) | 62.3 ms (1.02x) |

| Linux x64 (vps, 12 vCPU) |     aot |            fork |  upstream-1.4.4 |
| ------------------------ | ------: | --------------: | --------------: |
| version                  |  1.4 ms |  1.9 ms (1.37x) |  1.6 ms (1.18x) |
| eval0                    |  5.0 ms |  8.0 ms (1.60x) |  6.5 ms (1.29x) |
| install-warm             |  592 ms |  533 ms (0.90x) |  645 ms (1.09x) |
| test-tiny                |  7.1 ms | 11.0 ms (1.55x) |  7.0 ms (0.98x) |
| build-app                |  385 ms |  385 ms (1.00x) |  384 ms (1.00x) |
| spawnSync200             | 1023 ms | 1032 ms (1.01x) | 1070 ms (1.05x) |
| fork-build-help          | 58.2 ms | 69.4 ms (1.19x) | 64.6 ms (1.11x) |

The ratios are against `aot`; above 1.00x, `aot` was faster. The fork is `1.4.6-canary.1+169d8c5ea` on
Windows (`C:\bun\build\release\bun.exe`, built 2026-10-18) and `1.4.6-canary.1+fd9d7a224` on `vps`.

- Startup (`--version`, `-e 0`, `bun test`, `scripts/build.ts --help`) is within about 10% of upstream
  1.4.4 on Windows. On `vps` it was 20-60% faster than the fork and up to 30% faster than 1.4.4 (`bun test` equal).
- 200 `Bun.spawnSync` calls take twice as long with the fork on Windows (4.6 s against 2.3 s). The
  other passes of that day also had the fork slowest there (1.2x to 3.9x). On Linux the three are equal.
- `bun install` and `bun build` are equal within noise. On `vps`, `bun build` of the app varied from 50 ms
  to 900 ms with the host's load (it runs other agents' builds), so its row says little there.
- The AOT compiler itself is not on any of these paths: they measure the runtime that the pull request
  ships, built with LTO, the trimmable link and, on Linux, the order file.

Two earlier Windows passes on the same day ran while another build was using the machine and gave 2-5x
larger, inconsistent numbers. They are not in the table.
