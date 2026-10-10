# Image and shell portability qualification

Owner qualification, 2026-10-10, source base 86b6c9364fe476a17ab22345715016bb959aaa35.

Image file sizes use the Windows unsigned stat field directly; POSIX retains the negative-size clamp. The input-size limit and cleanup remain unchanged, with no additional filesystem probe. Shell environment hashing constructs its unit context directly. Buffered shell output retains the same Arc strong-count operations using cast_const pointers.

The native Windows owner factory (MSVC 14.44, four jobs/link threads, full symbols) ran seven existing image and shell test files: 246 pass, 18 inherited platform skips, zero failures, 7236 assertions. Fault-injection tests skipped on Windows are not claimed as exercised.

Locked strict bun_runtime Clippy passes on GNU x64 and ARM64 on the VPS. MSVC x64 and ARM64 have zero diagnostics in these three files; both retain 28 unrelated runtime errors and exit 101. This batch removes five diagnostics from the previous 33. Rust formatting and git diff checks pass. Receipts are retained under tmp/image-shell-stat-* and the VPS owner-linux-qualification directory.

No release promotion, performance comparison, Linux GPU hardware, WSL activation or private video publication is established by these gates.
