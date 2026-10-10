# Native launcher dispatch qualification — 2026-10-10

The UV, .NET, MSVC and WinMD invocation enums contain only command-selection
variants. They now implement `Clone` and `Copy`; launcher argument routing and
execution signatures are unchanged. This resolves their four strict Clippy
pass-by-value diagnostics without borrowing across terminal dispatch.

The rebuilt native Windows executable passes:

- 14 selected MSVC/WinMD tests, 82 assertions, including SDK inspection,
  environment handling and Rust/TypeScript/JSON metadata projections.
- One embedded UV version test, four assertions.
- Two .NET SDK/file-based C# application tests, five assertions.

Strict Clippy confirms these four dispatch diagnostics are absent on Windows
x64/ARM64 and Linux GNU x64/ARM64. The complete runtime still fails with 154
Windows and 15 GNU Linux diagnostics. In particular, a separate path-conversion
diagnostic remains in `dotnet_command.rs`; this is not a clean whole-file gate.
Linux runtime execution, release publication and host activation remain pending.

Receipts: `tmp/native-launcher-{windows-tools,uv,dotnet}.log` and
`tmp/native-launcher-clippy-{linux,windows}-{x64,arm64}.jsonl`.
