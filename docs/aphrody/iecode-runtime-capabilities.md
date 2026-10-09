---
title: "Bun fork capabilities in IECODE"
description: "Export every registered Bun module, scoped package and native library owner, then qualify the shared NIE, .NET and Inagle consumers."
---

# Bun fork capabilities in IECODE

The Aphrody Bun fork supplies the runtime. IECODE supplies game formats and the shared NIE native ABI. Inagle and managed IECODE consume the same NIE implementation; they must not duplicate Bun's runtime or copy the NIE Rust engine.

## Export the complete source inventory

Run the exporter from the selected fork checkout, with an absolute output path in a local staging directory:

```sh
bun scripts/aphrody/fork-capabilities.ts --root <bun-checkout> --out <absolute-catalog.json>
```

`--upstream <ref>` selects the upstream baseline (default `upstream/main`). The exporter resolves its merge base with the selected fork revision. It reads Git-tracked paths, never searches provider sessions, cookies, databases, model stores or untracked files.

To combine this inventory with the existing native graph and documentation owners:

```sh
bun scripts/aphrody/fork-capabilities.ts --root <bun-checkout> --out <absolute-catalog.json> --graph-docs <absolute-evidence-directory>
```

This invokes `bun:graph-index` and `bun:graph-native` across all source/package domains, stores their immutable snapshots through `bun:graph`, then invokes the existing `graph-docs.ts` exporter. `--domain src/graph --domain packages/bun-python-native` restricts indexing when a scoped receipt is required; the source catalog still retains its complete inventory. The evidence directory contains `fork-graph.sqlite`, native snapshots, `evidence.json`, and Markdown/MDX/HTML, skill and JSON documentation for each domain. Documentation tables retain their explicit row limits; full native snapshots are kept separately.

The graph retains file hashes, extraction errors and unsupported or metadata-only inputs. Its native query, path, explain, analyze and export operations consume those same snapshots. This pipeline stays in the Bun source profile; IECODE's consumer keeps its own domain profile and native qualification receipts.

The versioned JSON contains:

- Every `bun:*` module registered in `src/resolve_builtins/HardcodedModule.rs`, including upstream modules, with a `forkOnly` flag and the registry SHA-256.
- Every tracked `@aphrody/*` package manifest below `packages/` or `src/`, with version, SHA-256, exports and platform constraints when declared.
- Every native Rust library manifest below those owners declaring `cdylib` or `staticlib`, with its crate types and SHA-256.
- The complete committed path delta from the merge base, including vendor updates and deleted files. Paths preserve spaces and Unicode.
- Exact array counts, fork/upstream/merge-base revisions, tracked-file count and a dirty-tree flag.

These inventories cover registered modules, package manifests, native library owners and the committed source delta. They do not enumerate every JavaScript export or every Rust function. Current manifest and registry hashes describe the selected working tree; the committed delta describes its recorded revision. A dirty tree requires qualification of the intended committed artifact before deployment.

Unversioned private package manifests retain `version: null`; they are included rather than silently dropped.

## Runtime contracts

| Capability                 | Interface                                                                      | Required qualification                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| .NET 10 and C# files       | [`bun:dotnet`](/runtime/dotnet), `bun run file.cs`, `bun dotnet ...`           | Matching SDK/runtime and host libraries; execute a real C# file and a managed call.                                                     |
| Managed DLL objects        | `dotnet.load(assembly)`                                                        | The packed `node-api-dotnet` bridge, selected through `BUN_DOTNET_NODE_API` when needed. A plain DLL import can resolve to a file path. |
| Native DLL/SO calls        | [`bun:ffi`](/runtime/ffi), `dlopen`                                            | Correct OS/architecture, declared C signatures, ABI negotiation and ownership of allocated buffers.                                     |
| Win32                      | [`bun:windows`](/runtime/windows), generated `@aphrody/bun-windows-*` packages | Windows and the relevant generated family; call a real function. Presence of generated metadata is not qualification of every API.      |
| WinRT                      | [`bun:winrt`](/runtime/winrt)                                                  | Windows Runtime activation and the requested interface; exercise an actual object.                                                      |
| Python files and libraries | [`bun:python`](/runtime/python), Buv/PyJS                                      | The compatible native Python host plus shared CPython/stdlib/extension paths; execute and import real Python code.                      |
| Source/code graph          | [`bun:graph`](/runtime/graph), `bun:graph-native`, `bun:graph-index`           | Await extraction/indexing; use the selected domain profile and source. A source catalog is not an indexed graph.                        |
| NIE Rust and Inagle        | IECODE's `aphrody-nie-ffi` owner                                               | Load the actual `iecode` native library, negotiate ABI/target/capabilities and verify a real format operation.                          |
| Managed IECODE             | Existing NativeAOT/Node-API adapter                                            | Load the actual managed adapter and verify its operation. TypeScript fallback does not qualify native .NET.                             |

[Microsoft's .NET 10 documentation](https://learn.microsoft.com/en-us/dotnet/core/whats-new/dotnet-10/overview) describes the upstream SDK/runtime. Fork behavior must also be checked against the selected Bun binary. The SDK and object bridge are separate prerequisites.

## IECODE consumption

IECODE's `packages/inagle/src/ffi/fork-runtime.ts` consumes schema version 1, checks inventory counts and exposes lazy catalog-approved module imports. Its `scripts/tools/fork-runtime.ts` invokes the exporter from an explicitly selected Bun checkout and reports source revision separately from the executing fork revision.

Use `--help` on that consumer for the current CLI. Reports retain missing native libraries and failed imports. They must not replace failed native operations with TypeScript implementations or label source presence as runtime support.

The canonical NIE artifact remains `iecode.dll` on Windows or `libiecode.so` on Linux. A requested `ie.dll`/`ie.so` distribution name must refer to a checksum-qualified copy of the same ABI artifact. Such a name does not embed the Bun executable, .NET runtime, CPython or every Windows library into one DLL. Those are separately owned runtime dependencies.

## Web consumers and M3

Rose Griffon, Achillea and Azalée use the same qualified fork binary. Next uses `@aphrody/next-bun`; Tailwind uses `@aphrody/bun-plugin-tailwind`; M3 token generation belongs to `aphrody m3`. Migrating shared shadcn components requires the actual shared UI producer and the qualified Base UI fork package, preserving component behavior and accessibility.

Package names, registry presence, generated CSS and successful imports each establish their own layer. The application build, component behavior, native operations and production activation require their respective gates.
