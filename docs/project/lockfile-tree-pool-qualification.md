# Lockfile tree iterator pooled scratch qualification

2026-10-10, source base 385b8231b334c1302f08080f09c58670f0492c51. The iterator owns an existing RAII path-pool guard instead of an inline path array. Capacity, separators, depth traversal and borrowed path lifetime remain intact. Drop returns scratch storage on normal and early exits. No filesystem probe is added; throughput is unmeasured.

Changed MSVC14.44 debug engine, four jobs/link threads, full symbols: existing licenses, lockfile-only and pruned frozen-lockfile suites pass 200 tests, zero failures, 40 snapshots, 2975 assertions in 12.96 seconds. Initial run retained:18 passes/3 failures, including two missing Verdaccio imports and one five-second update timeout. Exact locked Verdaccio6.0.0 was linked from the installed workspace dependency into the isolated checkout without manifest/lock changes. Timeout case then passes isolated (292ms) and in the full run (361ms); its original cause is not established, and no timeout/assertion was changed.

GNU x64/ARM64 strict bun_runtime passes; MSVC targets retain18 unrelated runtime errors, down from22. Dedicated bun_install strict exits101 with115 Windows errors and53 GNU errors per architecture, zero errors in the owned Tree.rs file. These global failures remain open. Rust formatting/diff checks pass. No broad strict-clean or release claim is made.

Receipts: tmp/lockfile-tree-pool-* and lockfile-tree-install-*; VPS owner-linux-qualification. Before linkage650 exact release-cache archives/symbol files were NTFS-compressed under the factory lock, all planned SHA256 values unchanged; free space3799441408 to8889475072 bytes. No deletion or symbol removal. Full publication/performance/activation/private/hardware delivery remains open.
