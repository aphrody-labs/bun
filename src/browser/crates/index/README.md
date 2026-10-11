<!-- SPDX-License-Identifier: Apache-2.0 -->
# Bun browser vector index

Optional Rust library for Bun: HNSW approximate nearest-neighbour search,
scalar and SIMD distance kernels, int8 quantization, exact rescoring,
concurrent indexing and memory-mapped persistence. The browser provider owns
this implementation; consumers use the existing Bun runtime/FFI surface.

Current transfer provenance is recorded in
[../../BROWSER-MIGRATION.json](../../BROWSER-MIGRATION.json), with the
original Aphrody snapshot and separate integrated source hashes. Source
ancestry and dated performance measurements remain in
[BENCHMARKS.md](BENCHMARKS.md); they are not current VPS qualification.

The persistence format deliberately retains its historical BXCIDX01 magic
and version. Existing index files stay readable. The Rust handle facade is
preserved; no new FFI product or ABI rename is introduced by this migration.

Before retiring existing consumers, qualify the API/persistence/corruption/
concurrency/recall fixtures and native Bun FFI integration on the VPS. Repeat
the benchmark on the same host and corpus for comparable performance claims.
