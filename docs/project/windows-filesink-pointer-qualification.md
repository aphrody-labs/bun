# Windows FileSink and linker resource qualification

On 2026-10-10, the Windows synchronous-stdio FileSink path obtains a raw
libuv pipe pointer directly and uses its typed cast. It avoids introducing
an intermediate mutable reference; the existing source owner and audited
libuv handle-subtyping contract remain in place.

Strict locked runtime Clippy reports zero FileSink diagnostics on Windows
x64 and ARM64. The whole Windows runtime decreases from 53 to 51 unrelated
errors; this does not establish a clean whole-runtime gate. A native GNU
Linux x64 check on the VPS completes with exit zero. Local GNU attempts
stop at the missing C cross-compiler, so GNU ARM64 qualification remains
open. Receipts: tmp/filesink-pointer-strict-<target>.\* and
tmp/filesink-pointer-native-gnu.stderr/.exit.

The owner build factory now accepts --link-threads=<positive integer> for
Windows lld-link. The default preserves LLVM's hardware-thread selection;
other platforms do not receive the Windows flag. The explicit setting
changes linker worker count, preserving DEBUG:FULL and all optimization
flags. Numeric CLI parsing, invalid values, Windows x64/ARM64 emission,
Linux isolation and unchanged debug flags are covered by existing test
files. Unused codegen-only destructuring bindings receive explicit unused
names without changing the returned fields.

The changed debug engine builds through the MSVC 14.44 owner factory:

```sh
bun msvc --toolset 14.44 exec -- bun bd --link-threads=1 -j4 test test/internal/build-cli-config-flags.test.ts test/internal/build-debug-info-flags.test.ts test/js/bun/util/filesink.test.ts test/js/node/fs/fs-writeSync-stdio-windows.test.ts test/js/node/process/process-stdin.test.ts
```

Result: 70 pass, 45 existing platform skips, zero failures, ten snapshots
and 1400 assertions across five files. Additional ARM64 flag coverage then
passes 14 tests, 93 assertions and zero failures across the two config
files. Scoped TypeScript, oxlint, Prettier and Rust formatting exit zero.
The subsequent full internal debug gate passes 895 tests, with 33 existing
skips, zero failures, five snapshots and 146192 assertions across 92 files.
The changed-engine scope check exits zero. Receipts:
tmp/link-threads-internal-complete.log/.exit and tmp/link-threads-scope.log/.exit.
The engine uses source base 988d73b430a plus the recorded owned patches;
its SHA256 is 5ca15280b1a1344b650641c28271251ae326a57e5af3b2f37449c47e904639f0.
The 433114624-byte debug executable retains a 2706808832-byte PDB.

Initial debug attempts fail from measured disk exhaustion and an LLVM
in-page exception. The owner compiler tree is stopped at the capacity
threshold. No source, protected store or release provider is removed.
Lossless NTFS compression of the private build outputs and 69 explicitly
inventoried shared debug Rust archives recovers space. Every shared archive
retains its recorded SHA256; the bounded shared operation releases
7084089344 bytes under the Cargo mutex. The successful final link begins
with at least 8 GB free and one linker worker. Capacity and worker count
change together, so no isolated memory or performance gain is claimed.

The source Cargo helper on the VPS encounters a verified nested heavy-lock
wait. Only its owned helper tree is terminated. The successful native GNU
check uses the canonical heavy and Cargo locks, four jobs, nice 10, the
existing sccache and the owner's generated release codegen directory.
This qualifies this check; it does not close the separate resource-helper
inheritance issue. Existing production runtime candidates remain intact.

Plans and receipts: tmp/link-threads-native-final-plan.json,
tmp/link-threads-native-final.log/.exit,
tmp/link-threads-native-config-final.log/.exit,
tmp/link-threads-{tsc,lint,format}-final.\*,
tmp/filesink-pointer-debug-capacity-stop.json,
tmp/filesink-bounded-canonical-compression-plan.json and
tmp/filesink-bounded-canonical-compression-receipt.json.

Full runtime lint closure, matching release performance, platform
distribution and production activation remain separate open gates.
