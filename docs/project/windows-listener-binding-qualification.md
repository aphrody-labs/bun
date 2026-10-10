# Windows listener binding qualification — 2026-10-10

Named-pipe listener errors use their existing BunString values directly for
code, message, syscall and path. TCP/TLS named-pipe connection branches transfer
the optional owned local binding into the reused or newly allocated socket.
The branches return without reusing the value; the socket keeps the same
ownership obligation without cloning and then dropping a redundant copy.

The rebuilt Windows executable passes 116 local socket/listener/retention tests
with 1513 assertions and ten existing skips. A name filter excludes the legacy
public-domain TLS drain test. The preliminary unfiltered run was stopped before
that socket suite executed; its exit-255 receipt is retained and does not count
as qualification. Test sources and assertions were not changed.

Seven further native named-pipe TLS tests pass with 809 assertions. They cover
TLS 1.2/1.3 writes before handshake completion, destruction during secureConnect,
certificate rotation and upgrading a named-pipe connection to TLS.

Strict Clippy reports zero diagnostics in Listener.rs on Windows/Linux GNU
x64/ARM64. The GNU runtime passes completely; Windows retains 90 diagnostics
elsewhere. Rustfmt and owned whitespace gates pass. Linux runtime, performance,
release distribution and provider/production activation remain separate gates.

Receipts: tmp/listener-binding-native-local.log,
tmp/listener-binding-namedpipe-tls-native.log and
 tmp/listener-binding-<target>.jsonl with exit-code files.
