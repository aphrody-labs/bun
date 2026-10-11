# Native OXC source vendoring

Bun 1.4.4 builds its embedded OXC tools from `vendor/oxc`. The upstream crate versions and notices remain unchanged. The initial source is `aphrody-labs/oxc@b25696441c80fd580c35d671797f1940c642a624`.

The vendoring tool defaults to a plan. Supply an existing Git checkout containing the pinned commit:

```sh
bun bd scripts/aphrody/vendor-oxc.ts --source /path/to/oxc --target /path/to/bun/vendor/oxc --workspace /path/to/bun
```

Add `--apply` to export a new target. The tool reads tracked Git blobs directly, verifies their sizes and Git hashes, and records SHA-256 hashes in `.bun-vendor.json`. Git-tracked `node_modules` fixtures are source, so they are retained; an installed root `node_modules` tree is excluded.

Git archive can apply line-ending attributes. Its digest is recorded as a reference artifact; archive extraction does not supply the source bytes. Native symbolic links are created separately from their recorded, contained relative targets. Windows link targets are normalized to Git's slash spelling for verification. On Unix, executable file permissions are restored.

An existing receipt must match the commit and every exported file. Unexpected files, modified content, escaped targets and symbolic-link parents fail verification. The tool never overwrites a different source snapshot. An interrupted export without a receipt requires explicit `--resume-incomplete`; this verifies regular files and may create missing declared links, without replacing modified content.

The qualified Windows export contains 14,777 source entries, including two symbolic links, and 78,367,821 source bytes. Source integrity alone does not qualify a release: native build, quality commands, CLI tests and locked consumer checks remain required.
