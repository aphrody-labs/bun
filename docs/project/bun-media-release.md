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
artifacts; the older `bun-v1.4.4` tag points at its original immutable revision.
