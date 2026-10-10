# Route hash and changed-test path scratch qualification

Qualified on 2026-10-10 from public base 9abd9db37b2c21eb2ee00417accc4fab41919029.

Encoded route hashing retains its double-width initialized byte buffer, identical route serialization, bounds and one-shot wyhash. The buffer is allocated directly on the heap and freed at scope exit. This adds a scoped allocation; throughput improvement is not established. Changed-test Git discovery uses the existing RAII path pool. The borrowed Git executable path remains valid throughout the calls using it; success and error paths return the guard to the pool. No extra Git or filesystem probe is added.

Strict locked bun_runtime Clippy exits zero on GNU x64 and ARM64 on the VPS. Both MSVC targets report zero errors in these two files, with 22 unrelated runtime errors and exit 101, down from 24. Rust formatting and git diff checks pass.

The native MSVC 14.44 owner factory uses four jobs/linker threads and full symbols. Existing framework-router and test-changed suites run against the changed debug engine: 52 pass, three inherited watch-mode skips, zero failures, 99 assertions, 5.52 seconds. Watch-mode behavior is not established by skipped cases.

Receipts remain under tmp/route-changed-scratch-* and the VPS owner-linux-qualification directory. The pre-build cache capacity operation losslessly NTFS-compressed 650 exact canonical Cargo artifacts under the factory lock; all 650 SHA256 values match their planned values. No artifacts or symbols were deleted.

Global strict qualification, distribution performance/tagging, PATH/provider activation, private publication and physical Linux GPU/WSL qualification remain open.
