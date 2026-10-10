# Qualification, 2026-10-10

Scoped TypeScript, Oxfmt 0.72.0 and Oxlint passed. The changed Bun binary ran
100 tests across six files with 253 assertions and zero failures. This covers
actual Remotion interpolation, ordered worker backpressure, cancellation,
protocol validation and framework adapters; adapter tests do not qualify a
native browser device.

The standalone Windows Rust crate passed formatting, check, ten tests including
exact FFV1 RGBA roundtrip and abrupt-parent process ownership, and strict Clippy.
Its executable probed actual RTX 4070 NVENC successfully using verified FFmpeg
9.0.2. NVENC is an explicit lossy mode and does not preserve alpha. GPU encoding
does not prove GPU frame rendering.

HyperFrames' individual compiled executable rendered a three-frame H264 MP4 in
a clean directory with embedded codec and Sharp assets and an external installed
Chrome browser. Remotion's compiled library exposed actual core and renderer
exports outside the checkout. Its complete standalone composition rendering
remains a separate gate. See each framework's qualification JSON for artifact
hashes and the precise scope of earlier builds.

The browser-enabled Aphrody DLL factory exhausted the local disk and did not
produce a release provider. Existing installed providers lack the required
browser/Oxc capabilities. Native M3/Obscura full-render benchmarks consequently
remain blocked. The seven-sample function benchmarks establish equal output,
not an end-to-end video speed improvement.

Original upstream whitespace is retained in vendored source. New integration
files passed the scoped staged whitespace check. Git LFS media remains represented
by pinned upstream pointers and requires hydration before media-dependent use.
Dependency closures retain separate exact locks pending full rendering gates.

Automatic review rejected removing two obsolete temporary executables with
`blocked by policy`. Neither deletion nor a substitute deletion was performed.
Native NTFS compression instead preserved both artifact paths and verified
unchanged SHA-256 content, reducing allocated storage by approximately 747 MB.
