# Windows COM and query pointer qualification

On 2026-10-10, the COM delegate's final Release documents why it owns the
allocation it destroys, and stores the static vtable through an explicit raw
constant pointer. Reference-count ordering and null-this completion signaling
are unchanged. Event enumeration/rendering and known-folder queries pass
explicit raw pointers to initialized output storage and the live GUID.

The changed engine runs through the MSVC 14.44 owner factory:

```
bun msvc --toolset 14.44 exec -- bun bd test test/js/bun/windows/winrt.test.ts test/js/bun/windows/windows.test.ts -t 'bun:winrt|known folders|event log query'
```

Result: 7 pass, 1 existing skip, 0 fail, 27 assertions. WinRT projects native
System32 namespaces; real StorageFolder async operations and IVectorView
iteration execute, including temporary file deletion and a missing-file HRESULT.
Known folders and read-only System event-log queries execute. Shared test
fixtures are read-only and are not staged in this batch.

Serialized locked strict runtime Clippy with -D warnings reports zero owned
file diagnostics on Windows x64/ARM64 and GNU x64/ARM64. GNU whole runtime passes;
Windows retains 58 diagnostics elsewhere in the shared checkout. Scoped
rustfmt and diff checks pass. The documented process-local Windows cache opt-out
is retained. These scoped results do not establish complete release or installed
consumer qualification.

Receipts: tmp/com-query-native.log/.exit and
 tmp/com-query-<target>.jsonl/.stderr/.exit. A separate clean published checkout
is being qualified to distinguish released source from concurrent shared work.
