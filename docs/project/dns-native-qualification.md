# Native DNS qualification

Qualification date: 2026-10-10.

Resolver FFI calls use explicit raw output pointers and documented ownership contracts. The Windows completion holder is consumed by value, and the libuv lookup borrows its query while libuv copies its inputs. IPv4/IPv6 address reads use unaligned loads from the family-neutral address buffer.

The Windows backend intentionally retains its embedded libuv request in the heap-owned parent. A narrowly scoped, explained `large_enum_variant` exception preserves that stable layout without adding a separate allocation per native lookup. No new performance result is claimed.

The changed Windows binary passed 43 local DNS tests with 16 existing platform skips and 447 assertions. Coverage includes loopback lookup through system/libc/c-ares backends, parallel lookups, oversized-hostname rejection, address-family interleaving, local fetch/WebSocket/TCP connections and timeouts beyond the 32-entry pending cache. The fixture matching the npm registry's address shape is seeded locally; it does not contact the registry.

The DNS file has zero strict Clippy diagnostics on Windows x64/ARM64 and Linux GNU x64/ARM64. Whole-runtime Clippy still fails elsewhere: 166 diagnostics on either Windows target and 37 on either Linux target. Linux checks used the installed cargo-zigbuild/Zig adapter from native Windows; these are compile/lint checks, not Linux runtime execution. macOS qualification remains separate because the Darwin rootfs integration is pending ownership resolution.

Rust formatting, whitespace checks and the rebuilt Windows duplicate-symbol audit passed. Release publication and production activation remain open.
