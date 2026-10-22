# Bun media release

The requested delivery covers the eight Bun release targets, using the full
flavor: Linux GNU x64/arm64, Linux musl x64/arm64, macOS x64/arm64, and Windows
x64/arm64. `scripts/aphrody/media-release.ts plan <absolute-input.json>` inventories
every target through the existing runtime matrix. It records exact input hashes,
the serialized VPS build command, the existing native runner/ABI container, and
missing runtime, application, SDK and native gate receipts. Planning performs no
build, dispatch or publication. Missing targets keep `complete: false`.

## Native assembly

The assembly recipe covers all eight targets and must execute on the matching
native OS, architecture and Linux libc. It consumes existing explicit
artifacts and writes `bun-<target>-full.zip`, `SHA256SUMS.txt` and
`media-release-qualification.json`. It does not compile or publish.
The following input selects Windows x64:

```json
{
  "target": "windows-x64",
  "source": "<exact 40-character committed revision>",
  "sourceRoot": "C:/bun",
  "runtime": "C:/bun/build/release/bun-profile.exe",
  "executable": "C:/bun/build/apps/bun-video.exe",
  "mediaPrefix": "C:/bun/build/media",
  "output": "C:/bun/tmp/bun-media-release",
  "sdkArchives": [
    {
      "directory": "packages/bun-video",
      "archive": "C:/bun/tmp/media-packs/aphrody-bun-video.tgz"
    },
    {
      "directory": "packages/bun-runtime-sdk",
      "archive": "C:/bun/tmp/media-packs/aphrody-bun-runtime-sdk.tgz"
    }
  ]
}
```

Prepare the SDK archives with the real package manager, from committed package
sources, then supply their absolute paths. Packing is distinct from the native
runtime/application build:

```sh
bun pm pack --ignore-scripts --filename C:/bun/tmp/media-packs/aphrody-bun-video.tgz
```

Run that command from `packages/bun-video`, then pack `packages/bun-runtime-sdk`
with its corresponding filename. The release validator compares the tarball
manifest and every member with its source and verifies exported entry points.
It refuses private stores, cookies, captures and escaping archive members.
External npm dependencies retain the versions declared in those source packages;
their registry installation contract is recorded explicitly. Compiled application
dependencies are shipped by the separately qualified executable.

```sh
bun scripts/aphrody/media-release.ts C:/bun/tmp/media-release-input.json
```

The checkout must be committed at the supplied source, with no tracked changes.
Both the runtime and the compiled application's `capabilities` command must report
the selected native target, Bun `1.4.4` and that complete exact revision. Their
embedded `--version` is checked independently because `Bun.version` may report
only the base version. A canary, another source
revision or a cross-built binary without native execution is rejected.

`stageMediaBundle` supplies the isolated FFmpeg/mpv SDK layout under
`lib/media/<component>/<sdk-target>`, including executables, public headers,
import libraries, transitively required DLLs and source notices. Bun and the
absorbed engine notices are included under `licenses`. The archive manifest
binds payload files, SDK tarballs and executed gate logs with SHA-256.

Native gates run from the assembled directory with an explicit PATH containing
its binaries and standard OS directories (Windows System32 or `/usr/bin:/bin`).
Their environment excludes provider
credentials and uses a disposable local home. They check runtime/application
identity, lossless Image WebP/RGBA, FilmCraft MP4 timing metadata, FFmpeg/mpv ABI,
the compiled application commands and an exact synthetic FFV1 encode/decode pixel
roundtrip. The MP4 fixture checks container metadata; it is not a decoder vector.
GPU, browser rendering, DRM and authenticated services need separate receipts.

## Complete matrix boundary

For matrix inventory, use the same `source` and `sourceRoot`, with a `platforms`
object keyed by the existing target names. Each entry may provide `runtime`,
`executable`, `mediaPrefix`, `sdkArchives` and `nativeQualification` absolute paths.
A native receipt must identify `source`, `target`, `native: true`, `passed: true`,
`runtimeSHA256` and `executableSHA256`. Inventory binds those hashes to the supplied
files; it never treats a receipt for another binary as qualification.

Each platform still requires complete native artifacts, media SDK prefixes and
artifact-bound gate receipts. Merely having a shared assembly recipe does not
qualify any platform. The SDK catalogue lists all eight targets; normalized SDK
assets remain unavailable until their independent qualification and publication.
The planner reports these concrete gaps instead of applying Windows filenames or
GNU libraries to another ABI. POSIX executable modes are recorded in the receipt
and ZIP even when inventory is produced on Windows. Dynamic loader overrides
are excluded from native gate environments, so RPATH/install names must resolve
the packaged dependency layout. Existing native runner names come from
`scripts/aphrody/build-host.ts`; runtime commands come from `release-matrix.ts`.

Each assembled platform artifact is marked `channel: candidate` and
`completeFactoryReleaseQualified: false`. Its stable version string does not
promote the global runtime release. Global publication still consumes the existing
factory/source/platform gates. Use a fresh revision-bound draft tag for new
artifacts; never overwrite an existing version or its source pin.

## Eight-product publication barrier

`scripts/aphrody/release-aggregation.ts` verifies the eight full products against
one exact source SHA and version. It rehashes each ZIP, every payload member,
the embedded and external media receipts, both source SDK packs, and all native
gate logs. Publication consumes this aggregate in addition to the existing
factory qualification; the stable integration policy remains unchanged.

For each existing target, deliver these flat files together:

- `bun-<target>-full.zip`
- `bun-<target>-full.qualification.json`: the existing assembly receipt, including
  its archive identity, copied under a target-specific delivery name
- `bun-<target>-full.platform-gates.json`: a `NativePlatformQualification` from
  `release-aggregation.ts`, bound to the exact archive/runtime/application hashes,
  native OS/architecture, source SHA, version and catalogue FFmpeg/mpv source pins
- `bun-<target>-full-<gate-id>.log`: the hash-bound platform gate evidence

Required platform gates are `runtime-regressions`, `native-runtime-sdk`, `native-closure`,
`native-install`, `native-path`, and `native-update`. Windows also requires
`winget-manifest` and `winget-install`. These receipts must record real native
execution. Wine, cross compilation, a runner label, an empty log or copied
qualification from another binary cannot establish that execution.

The worker must exercise the changed binary with local fixtures, audit the
complete loader closure and GNU symbol floor, install into a disposable local
home, resolve the installed executable through PATH in a new process, and run
update/integrity checks against an exact-source local fixture. Windows workers
must validate the exact x64/arm64 installer manifests and execute the portable
package with the native Winget client. Manifest validation alone does not prove
installation. Source assembly does not write these additional successful gates.

```sh
bun scripts/aphrody/release-aggregation.ts aggregate /absolute/products <source-SHA> 1.4.4 candidate
bun scripts/aphrody/release-aggregation.ts verify /absolute/products <source-SHA> 1.4.4 candidate
bun scripts/aphrody/release-aggregation.ts download-verify <runtime-tag> /absolute/empty-directory <source-SHA> 1.4.4 candidate
```

The downloader verifies both the Git tag commit and release source, requires all
eight sets of evidence, and downloads only their explicit filenames. It uses
bounded GitHub subprocesses and rechecks the downloaded bytes. Missing or failed
evidence stops publication. Dry-run package preparation remains available.
The runtime workflow rechecks the aggregate before publication and R2 mirroring;
npm, crates and native-package workflows verify it before uploading.

The Bun Video workflow separately builds its current Windows x64 library with
the qualified exact-source Windows runtime. Its outside-consumer gate requires
an exact published Bun types version (`types-version`, or the public repository
variable `BUN_VIDEO_TYPES_VERSION` for tag runs). npm and R2 consume the exact
qualified tarball through the package's existing publisher. This Windows library
receipt does not qualify a Linux or ARM library package.

## Native CI allocation and bootstraps

`nativeFullReleasePlan(source)` in the existing `release-matrix.ts` allocates the
eight targets to their native runners with `-j2` and one heavy job per host. The
main/tag release plan exposes this allocation alongside the existing VPS plan.
It records requirements and `qualified: false`. The existing `aphrody-release.yml`
consumes that plan in its `native-full` matrix, with `max-parallel: 2`. Each job
runs `release-native-worker.ts` against the checked-out SHA and publishes its
target-specific products only after all native commands and assertions succeed.
The aggregate downloads the eight producers from the same workflow run. Failed
preflights upload diagnostics and prevent the aggregate and publication jobs.

| Targets                | Native runner                        | ABI execution                                                                   |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| Linux GNU x64 / arm64  | `ubuntu-24.04` / `ubuntu-24.04-arm`  | Native GNU process, pinned sysroot and closure audit                            |
| Linux musl x64 / arm64 | `ubuntu-24.04` / `ubuntu-24.04-arm`  | Same-architecture `alpine:3.24` container; no QEMU                              |
| macOS x64 / arm64      | `macos-15-intel` / `macos-15-xlarge` | Native macOS process; arm64 needs the larger runner for the 6 GiB free-RAM gate |
| Windows x64 / arm64    | `windows-2025` / `windows-11-arm`    | Native Windows process                                                          |

Runner names follow the [GitHub hosted runner catalogue](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
Container actions run on the Linux host; ABI execution runs inside the native
container as described by [GitHub container jobs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/run-jobs-in-a-container).
The documented hosted disk allowance does not establish the factory's Windows
20 GiB free-space preflight. Fresh disk/memory checks and the pinned toolchain
remain required; stock runner LLVM versions do not replace the source pin.

The all-release public inventory on 2026-10-13 found all eight bootstrap archives
under `aphrody-v1.4.3-aphrody.2`, source
`f7a7086b602e39e7a2aee653a87af5f3f369a650`.
`scripts/aphrody/release-bootstraps.json` records the GitHub asset URLs, sizes and
SHA-256 digests matched against that release's `SHA256SUMS.txt`. The existing R2
latest manifest exposes only three platform archives; the `.2` checksum URL on
R2 returned 404. Bootstrap binaries have not been executed by this source audit.
Before a native worker uses one, it must verify its bytes, architecture, version,
revision and Aphrody `sourceUrl` through native execution. A bootstrap is a build
tool, not a qualification receipt for the new source.

Complete normalized FFmpeg/mpv SDKs are still missing for Linux GNU ARM, both
musl targets, both macOS targets and Windows ARM. Existing Windows x64 and
portable Linux x64 evidence does not fill those six gaps. The SDK factory now
has pinned source recipes for eight targets and ELF, PE and Mach-O closure
owners. Native source/toolchain provisioning and actual builds must complete
these targets before any eight-full aggregate can pass. All eight catalogue
SDK asset lists remain empty; a source producer can use verified local inputs
and the existing source recipe without requiring a published artifact first.
The current Sharp/Remotion packaging owner supports Windows x64 only.
Linux workers require the sysroots provisioned by `build-host.ts`/the CI image
owner; the worker stops if those SDK artifacts are absent. Standalone GNU runtime
SDK modules must also meet the 2.17 floor, and musl manifests must select an actual
musl Rust target. No CI run or publication is established by these source changes.

The worker reuses `setup.ts` for pinned tooling, the canonical SDK downloader and
extractor, `bun bd` for the runtime, the serialized Cargo wrapper and SDK stage
for the native module, and the Bun Video package qualification/build owners.
It packs the verified runtime module, headers and source-bound manifest under
`lib/runtime-sdk/<Rust-target>/current` in the full archive. The aggregate checks
that module's byte hashes, source, panic recovery and header ABI as well as its
native gate. Header-only or source-only SDK packs cannot replace it.

Every full archive must also contain a source-bound native NGINX engine under
`lib/nginx/<SDK-target>/current`, its module and closure receipts, source
archives and notices. The aggregate checks every byte and requires the exact
runtime revision to pass the controller, static Rust module and closure gates.
The negative ABI fixture is a test input and cannot enter the release archive.
Only the GNU Linux x64 portable engine recipe currently exists; the other seven
targets fail with a missing recipe diagnostic. Its proven sysroot/LLVM owner
paths remain prerequisites until that owner supports explicit provisioning.
The existing engine's earlier qualification is not evidence for a new runtime
revision or for the seven missing engines.

`release-native-install.ts` serves the candidate archive on a loopback fixture
and runs the existing `install.sh`/`install.ps1` owners into a disposable home.
Its fresh PATH process must resolve the installed candidate, and `bun upgrade
--local` must replace that installation with the exact candidate bytes. This
qualifies a local update before publication without a paid provider or a prior
release download. Windows additionally uses the Microsoft client to validate
and install an exact-archive portable manifest, executes the installed module,
and removes the unique fixture package. Local manifest support changes are
limited to ephemeral GitHub-hosted Windows runners; see Microsoft's
[local manifest installation contract](https://learn.microsoft.com/en-us/windows/package-manager/winget/install).

Legacy factory flavour, alias, Mullvad and stable integration checks remain
additional publication requirements. A successful eight-full aggregate alone
does not satisfy an incomplete legacy draft or the pending stable owners.
