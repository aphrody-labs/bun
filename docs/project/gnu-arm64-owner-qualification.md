# Native GNU ARM64 runtime qualification — 2026-10-10

On the VPS owner checkout based on `988d73b430a`, the strict runtime gate
completes with exit zero in 4 min 19 s:

```sh
cargo clippy --locked -p bun_runtime --no-deps --target aarch64-unknown-linux-gnu --message-format=json -- -D warnings
```

The checkout retains the published internal-fixture and FileSink pointer
patches. No repository source is rewritten by this qualification.

The native host runs the repository's `nightly-2026-09-15` Rust toolchain.
The installed LLVM 23.1.3 compiler targets `aarch64-linux-gnu` explicitly.
The initial `/usr/aarch64-linux-gnu` directory lacks libc development
headers, so its presence alone cannot qualify a compiler. Three official
Ubuntu packages are downloaded to the owner's temporary directory,
checked against APT metadata SHA256, and extracted there without a system
package installation:

| Package                    | Version             | SHA256                                                           |
| -------------------------- | ------------------- | ---------------------------------------------------------------- |
| libc6-dev-arm64-cross      | 2.43-2ubuntu2cross1 | 5057ab46f4bf3f4e2aa9f84745f903c26301c541fcce1704bc511aa4aadf7a1a |
| libc6-arm64-cross          | 2.43-2ubuntu2cross1 | 43dc16e207bfc1423088240c8ce7b6387acc48a21057b998d8f7bb95dca20253 |
| linux-libc-dev-arm64-cross | 7.0.0-13.13cross1   | 3752af8900d16be48d042b232b0dac75e47411305ecb486b544ac77eb8759ac4 |

A C probe including stdio and stdlib compiles against this sysroot; `file`
identifies its output as an ELF 64-bit AArch64 relocatable object.
Target-specific `CC`, `CXX`, `AR`, `CFLAGS` and `CXXFLAGS` select LLVM and
this sysroot for Cargo's native dependencies. The host's x64 headers are
not substituted for target libc.

The run holds `/home/ubuntu/build/locks/heavy.lock` and
`/home/ubuntu/build/locks/cargo-build.lock`, uses four jobs, nice 10, the
existing sccache and release codegen directory. Capacity is checked before
the gate; available disk remains approximately 3.92 GB at completion.
The process is terminal and both locks are released.

Local plan and receipts: `tmp/vps-arm64-qualification-plan.json`,
`tmp/vps-arm64-qualification.sh`, `tmp/arm64-native.log`,
`tmp/arm64-native.stderr` and `tmp/arm64-native.exit` (zero). Remote JSON
diagnostics remain in the checkout's `tmp/owner-linux-qualification/`.

This closes the strict GNU ARM64 runtime check for the recorded source.
It does not prove an ARM64 executable links, runs on physical hardware,
meets the distribution glibc floor, or qualifies musl/Darwin. The Ubuntu
development sysroot is not the release compatibility sysroot.
