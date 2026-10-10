# .NET host string qualification — 2026-10-10

`bun:dotnet` validates the UTF-8 bytes produced by JavaScript string conversion
before copying text into the native host's string API. Invalid UTF-8 raises an
argument error instead of silently replacing bytes. The error translator borrows
the host error while creating its JavaScript message, code and HRESULT; callers
retain ownership until translation finishes.

The rebuilt Windows executable passes five selected native .NET tests, with
12 assertions and no skips. They exercise the in-process SDK muxer, file-based
C# execution, installation discovery, CLR function pointers/delegates and the
TypeScript `.csts` integration.

Strict Clippy reports no diagnostics in `dotnet/host.rs` or `dotnet/mod.rs` on
Windows/Linux GNU x64/ARM64. The complete runtime still fails elsewhere with
149 Windows and 10 GNU Linux diagnostics. The .NET CLI path conversion is a
separate remaining diagnostic; this batch does not qualify Linux execution,
release distribution or host activation.

Receipts: `tmp/dotnet-host-native-final.log` and
`tmp/dotnet-host-final-clippy-{linux,windows}-{x64,arm64}.jsonl`.
