# Windows performance

Where the fork's Windows release binary spends time and memory compared with upstream Bun, what was
changed, and how to measure it again. Measured on 2026-10-25 on the owner's workstation: Intel
i7-13700F (24 threads), 32 GB RAM, Windows 11 build 28120, with no build running during a benchmark.

Binaries compared:

| Name     | What                                                                                      |
| -------- | ----------------------------------------------------------------------------------------- |
| upstream | official `bun-windows-x64.zip` of Bun 1.4.4 (`38afee6c8`), SHA256 checked against SHASUMS |
| aot      | `~/.bun-aot/bin/bun.exe`, upstream PR #45631 preview (1.4.4-canary.1, release + LTO)      |
| before   | this fork at `0d1e32e96`, `bun scripts/build.ts --profile=release` (LTO, no order file)   |
| after    | the same with the changes below                                                           |
| + order  | after, relinked with a symbol order file traced from this build (`bun run orderfile`)     |

Every column of this table comes from one session, each benchmark interleaving the binaries
(hyperfine `-N`, 10 warmup runs and 150 / 100 runs; the spawn script three times each, 200 spawns of
`C:\Windows\System32\hostname.exe` per call kind and run). Another agent's crawler used about one
core meanwhile. In an earlier, quieter session the same binaries gave `--version` 4.6 ms
(upstream) and 5.6 ms (before), `-e 0` 10.9 and 13.0 ms, `spawnSync` 7.2 and 13.4 ms: the ratios
hold, the absolute times do not carry from one session to the next.

| Measure                              | upstream | aot   | before | after | + order |
| ------------------------------------ | -------- | ----- | ------ | ----- | ------- |
| `bun --version` (ms)                 | 8.17     | 8.10  | 9.70   | 8.59  | 8.22    |
| `bun -e 0` (ms)                      | 18.10    | 20.01 | 21.67  | 20.45 | 19.23   |
| `Bun.spawnSync` per call (ms)        | 12.57    | 11.62 | 21.74  | 12.57 | 12.42   |
| `Bun.spawn` + `exited` per call (ms) | 12.23    | 10.80 | 22.16  | 12.18 | 12.22   |
| RSS after the spawn script (MB)      | 20.5     | 23.2  | 24.2   | 24.4  | 20.6    |
| DLLs mapped once `-e` code runs      | 10       | -     | 15     | 10    | 10      |
| Size (MiB)                           | 109.9    | 140.4 | 168.6  | 168.6 | 168.6   |

The spawn script is `Bun.spawnSync({ cmd, stdout: "pipe" })` and
`await Bun.spawn({ cmd, stdout: "pipe" }).exited` in a loop after 10 warmup calls, and
`process.memoryUsage().rss` at the end.

## Spawn and console hosts

`Bun.spawnSync`/`Bun.spawn` of `hostname.exe` took twice as long as upstream, all of it in the parent.
Neither the environment block, the PATH search, the Job Object nor the DLL diagnosis was the cause:
the time was a console host. The fork's `bun_no_window` crate (and the libuv patch
`win-hide-console-without-console.patch`) passed `CREATE_NO_WINDOW` whenever `GetConsoleWindow()`
returned NULL, to keep a console child of a GUI or service from opening a window. But a process
attached to a pseudoconsole (ConPTY: Windows Terminal, VS Code, every agent shell), or to a console
created hidden, also has no console window. For those parents every child got `CREATE_NO_WINDOW`,
and Windows starts a new `conhost.exe` for a console process created with it: 6 to 9 ms per spawn
here. Upstream pays the same with `windowsHide: true`, which sets the flag when no stdio is
inherited: in one run of the same loop, upstream took 13.3 ms per `spawnSync` with
`stdout: "pipe"` and 23.5 ms with `windowsHide: true` added; the fork took 21.7 and 22.6 ms, the
flag being set in both cases.

The test is now whether this process is attached to a console at all (`GetConsoleProcessList`
returns 0 without one): a child of a process with a console shares it and opens no window, whether
or not the console has one. `bun run --parallel` scripts also share the console now (they were
spawned hidden, each with its own console host), so a Ctrl+C reaches them as it does under a POSIX
terminal.

Not the cause, measured: handles (one per 300 spawns either way, see Supervision), the
`spawn_with_job` libuv patch (only with a job), `elevate` (only when requested).

## Startup and size

`bun --version` and `bun -e 0` with hyperfine (`-N`, 10 and 5 warmup runs, 150 and 100 runs). DLLs mapped
once `-e` code runs (`windows.dll.loaded(pid)` of a child):

- upstream: 10 modules;
- before: 15, the five extra being `advapi32`, `sechost`, `bcrypt`, `mpr` and `version`.

`advapi32` and `sechost` were loaded by the fork's libuv patch `win-allow-wer.patch`: `uv__init` opens
`HKLM\...\Windows Error Reporting\LocalDumps\<exe>` with `RegOpenKeyExW` to decide whether to leave
WER's fault box on, and advapi32 is delay-loaded, so this one lookup mapped advapi32 and sechost into
every launch (found with `cdb -c "sxe ld:advapi32; g; kn"`). It now calls kernelbase's
`RegOpenKeyExW`. `bcrypt.dll` (AWS-LC's `BCryptGenRandom`), `secur32.dll` (Pageant), `MPR.dll` and
`version.dll` (uutils) and native curl's `WLDAP32.dll` and `Normaliz.dll` are now delay-loaded
(`scripts/build/flags.ts`): each is reached only by a command or API that may never run.

The local release build had no symbol order file (`build/release/linker.order` is a placeholder until
`bun run orderfile` traces the build; CI builds inherit one). Upstream's binary is linked with one.
`bun run orderfile` needs the MSVC environment to build its tracer on Windows:

```sh
eval "$(bun msvc env --format sh --toolset 14.44)"   # Git Bash; INCLUDE and LIB for clang-cl
bun run orderfile                                    # traces build/release, writes build/release/linker.order
bun scripts/build.ts --profile=release               # relinks with it
```

With it, RSS at the end of the spawn script goes from 24.4 to 20.6 MB (upstream: 20.5) and
`-e 0` from 20.45 to 19.23 ms: the 21,480 functions the workloads enter are packed together at the
front of `.text` instead of being spread over it. The traced file is local to the build directory
and is not committed; a new trace is needed when the code moves a lot.

The binary is larger than upstream's (168.6 MiB against 109.9 MiB) because of the fork's own
features (AWS-LC, uutils, the agent tools, the AOT compiler, native curl); `--trim` and the trimmable
link are the tools for that, not link flags.

## Supervision

`Bun.spawn` kill and exit propagation, checked with a child that starts a grandchild (`ping -n 60`):

| Case                                  | upstream                  | before and after          |
| ------------------------------------- | ------------------------- | ------------------------- |
| `child.kill()`                        | child and grandchild gone | child and grandchild gone |
| the parent exits with its child alive | both gone                 | both gone                 |

The child bun's own libuv job (`KILL_ON_JOB_CLOSE`) takes the grandchild with it. Handle count of the
parent (`GetProcessHandleCount`) before and after 1000 spawns of each kind, after warming up with
20: `spawnSync` 132 → 132, `spawn` 134 → 132, `spawn` + `kill()` 134 → 133. No leak; upstream
1.4.4 and the fork before give the same (±1 over 300 spawns).

## Bugs

- oven-sh/bun#46328, Ctrl+C does not stop `bun run --parallel`: Windows runs a console control
  handler on a thread of its own. The handler set the abort flag, but the run waits in
  `tick_once` (libuv) and nothing woke it, so the abort waited for the next child event, which never
  came for scripts that ignore or never see the Ctrl+C. The handler now wakes the loop
  (`us_wakeup_loop`, thread-safe). Test: `test/cli/run/multi-run.test.ts`, "parallel: Ctrl+C stops the
  run on Windows" (a driver on a hidden console of its own sends `CTRL_C_EVENT` to it); it fails on
  upstream 1.4.4 and on the fork before, and passes after.
- oven-sh/bun#46792, `Bun.serve` drops bodies over 16 KiB: not reproduced here. `fetch` and `curl.exe`
  both receive 17,000-byte to 8 MiB bodies from upstream 1.4.4 and from the fork, on `127.0.0.1`. A
  non-blocking `send()` of a 150-byte head and a 17,000-byte body accepts both whatever `SO_SNDBUF`
  is (0, 8192, 16384). Above 16 KiB the body leaves the cork buffer and goes through
  `bsd_writev`, which on Windows is one `send()` per buffer; the stall needs that second `send()` to
  report `WSAEWOULDBLOCK` and the writable event that follows never to come, which needs something
  this machine lacks (a layered service provider or filter driver, which also moves libuv to its
  slow `select()` poll). Left open until it can be reproduced.
- oven-sh/bun#46604, `node:net` port still bound after `destroy()` (PR #46619, merged as
  `f359a91e301`): `test/regression/issue/46604.test.ts` passes on Windows, 12 of 12, with the release
  build at `7660e80f4` and with `bun bd test` at `ae58596`.

## Memory

RSS at the end of the spawn benchmark: upstream 20.5 MB, before 24.2, after 24.4, with the order
file 20.6. The difference was the binary's pages, not the heap: the order file alone removes it.
mimalloc is built with its defaults on Windows (no large OS pages, which need `SeLockMemoryPrivilege`; commit on demand); nothing there was
changed without a measured gain.

## Measuring without ETW

Kernel ETW (`wpr -start CPU`, `xperf`) needs an elevated shell and fails otherwise with "Failed to
enable the policy to profile system performance"; the Windows Performance Toolkit (xperf,
wpaexporter) is not installed. Without elevation:

- **Wall time:** `hyperfine -N --warmup 10 --runs 100 "<exe> -e 0"`. With `-N`, write paths with
  forward slashes: hyperfine splits the command like a POSIX shell and eats backslashes.
- **Where a short process spends its time:** `scripts/aphrody/win-profile.ts` starts the exe
  suspended, then suspends and reads the main thread every 100 us until it exits, and symbolizes with
  llvm-symbolizer and the PDB beside the exe. Compare shares between builds, not sample counts (the
  sampling rate depends on the load):

  ```sh
  bun scripts/aphrody/win-profile.ts sample --runs 100 --out fork.json -- build/release/bun-profile.exe -e 0
  bun scripts/aphrody/win-profile.ts report fork.json --top 30
  ```

  Upstream's `bun-windows-x64-profile.zip` has `bun-profile.exe` with its PDB and linker map, for
  the same report on upstream. In both, `JSC::VM::updateStackLimits` (13 to 15% of all samples) and mimalloc's
  `mi_page_free_list_extend` lead the samples inside the exe.

- **Who loads a DLL:** `cdb -y build\release -c "sxe ld:<dll>; g; kn 30; q" build\release\bun-profile.exe -e 0`.
- **DLLs of a running process:** `windows.dll.loaded(pid)` from `bun:windows`; imports of a file:
  `llvm-objdump -p <exe>` (the "DLL Name" lines; the delay-import table follows).
- **Handles:** `GetProcessHandleCount` through `bun:ffi`.
