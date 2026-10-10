# HTTP file-size normalization — 2026-10-10

File routes, directory routes and response contexts share a private
`nonnegative_stat_size` helper. Windows `uv_stat_t` already supplies an
unsigned size; POSIX signed sizes retain their existing negative-to-zero
normalization. The response context still checks conversion into
`BlobSizeType`. No extra filesystem call, allocation or metadata refresh
is introduced. Range, EOF, ETag and HEAD behavior is preserved.

The changed Windows debug engine is built through the owner factory with
MSVC 14.44, four Ninja jobs and four linker workers, retaining symbols:

```powershell
bun msvc --toolset 14.44 exec -- bun bd --link-threads=4 -j4 test test/js/bun/http/bun-serve-static.test.ts test/js/bun/http/bun-serve-static-stress-no-body.test.ts test/js/bun/http/bun-serve-static-stress-access-body.test.ts
bun msvc --toolset 14.44 exec -- bun bd --link-threads=4 -j4 test test/js/bun/http/bun-serve-file.test.ts test/js/bun/http/serve-directory-routes.test.ts test/js/bun/http/serve-file-slice-read-error.test.ts
```

The static suites pass 70 tests with zero failures and 1680 assertions.
The file/directory suites pass 196 tests with zero failures, ten inherited
skips, three existing TODOs, four snapshots and 1641 assertions. They
exercise file contents, HEAD, empty files, ranges, slices, conditional
requests and directory routes. This change removes redundant unsigned
conversions; it does not claim a previously failing HTTP behavior.

Strict GNU x64 and ARM64 `bun_runtime` Clippy gates exit zero on the VPS,
using canonical heavy/Cargo locks, four jobs and the qualified LLVM 23
ARM64 sysroot. Their runner subsequently exits 127 on a trailing CRLF
blank line; both completed target receipts remain zero. This observer
failure is recorded rather than represented as an all-green runner.

Local receipts: `tmp/server-stat-native.log/.exit`,
`tmp/server-stat-file-native.log/.exit`,
`tmp/server-stat-windows-strict-summary.json` and
`tmp/server-stat-vps-plan.json`. GNU target JSON, stderr and exit receipts
remain under the VPS checkout's `tmp/owner-linux-qualification/`.

The source checkout is based on `d5bdc8a4e03` with this owned patch.
Windows debug revision metadata remains pinned separately. This is not
a released source commit or proof of Linux GPU hardware support.

Both serialized Windows MSVC x64/ARM64 strict gates report zero owned errors. Each exits 101 with 45 unrelated runtime errors, down from 50 before this patch. Scoped rustfmt and diff checks pass; global Windows strict closure remains open.
