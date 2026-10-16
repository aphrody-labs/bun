---
name: bun-os-runtime
description: "Bun OS and Aphrody runtime source ownership, provenance, integration and qualification boundaries"
metadata:
  type: reference
---

# Bun OS runtime

Bun OS is Aphrody's runtime and toolkit. Open-source components are integrated
under their existing source owners; authorship, upstream Git history, licences
and ABI identifiers remain part of their provenance.

## Source owners

- `aphrody-labs/bun` owns the runtime. `oven-sh/bun` is its upstream source;
  `scripts/aphrody/sync-upstream.ts` owns synchronization. Inspect current refs
  and concurrent changes before changing the checkout.
- `src/runtime`, `src/js/bun`, `src/jsc` and `src/sys` own runtime behavior.
  `packages/bun-types` declares its public contracts; a declaration is not a
  native behavior test.
- `scripts/build.ts` and `scripts/build/*` own `bun bd`. Use that driver for
  checkout runtime changes and its trailing execution arguments for tests.
- `packages/bun-agent-plugin` owns source skills, adapters, hooks and generated
  bundles. Generated resources qualify their source inputs; they do not prove
  client execution or the installed executable's embedded plugin.
- `scripts/aphrody/release-matrix.ts`, `media-stage.ts` and `media-release.ts`
  own release target selection and media staging. Reuse their manifests and
  qualification receipts rather than creating a parallel platform catalog.

## Runtime identity and gates

Use `bun agent-plugin doctor --json` to identify the selected executable.
Record its actual revision and SHA-256, source revision, target and relevant
test receipts. A release URL or plugin content hash is not an archive checksum.

For checkout changes use `bun bd test <file>` with the appropriate existing
test in `test/js`, `test/cli`, `test/bundler` or `test/integration`. Declaration
changes use `test/integration/bun-types/bun-types.test.ts`. Native SDKs require
their own target and ABI gates. Source, package, native artifact, client
execution and production deployment are separate qualifications.

Respect one heavy build per host and bounded parallelism. Use native Windows
on the workstation. Preserve concurrent source edits and protected stores;
credentials, raw sessions, corpora and model weights are not plugin resources.

Do not infer all-platform availability, model calibration, trained weights or
performance from module declarations, a generated bundle or one passing target.
Historical receipts retain their recorded runtime, source, host and workload.

Related: `bun-build-commands`, `bun-review-rules`, `bun-agent-shared-memory`.
