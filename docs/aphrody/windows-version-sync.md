# Native Windows version synchronization

Run from the fork checkout with its installed Bun runtime:

```powershell
bun run bun:windows --audit tmp/windows-version-plan.json
bun run bun:windows --apply
bun run bun:windows --check
```

The default stable source version is **1.4.4**. `--version X.Y.Z` selects another
stable version; `--root PATH` selects an explicit checkout. The host is identified
through `bun:windows.systemInfo()`. No WSL or POSIX shell is started.

The source plan updates the root runtime manifest, the coupled agent plugin
manifest and its Bun engine minimum. Bun's build reads the root manifest; generated
types and plugin bundles obtain their version through their existing producers.
Independent npm/crate/Python package versions and dependency ranges retain their
own release contracts.

The inventory reads tracked scripts, CI actions/workflows, Docker build contexts
and package manifests.
`--audit` writes their version references, paths, line numbers and roles to a new
file. Historical reports, fixture versions and bootstrap runtimes are inspected
without rewriting them as if they were current release products.

To synchronize deployment artifact pins after publishing the release:

```powershell
bun run bun:windows --release-tag bun-v1.4.4
bun run bun:windows --release-tag bun-v1.4.4 --apply
```

This requires authenticated `gh` access to the existing `aphrody-labs/bun` remote,
a published stable release, its matching GHCR image, and its `SHA256SUMS.txt`. Ubuntu deployment Dockerfile,
Compose, Kubernetes, Docker doctor/sync and Alpine runtime pins are updated
together. The Alpine x64, baseline and ARM64 archive checksums are also replaced;
a missing asset or checksum blocks the entire plan. This does not publish images,
change host resources or install a runtime. Publishers/installers accept the new
`bun-v1.4.4` stable contract and retain legacy `aphrody-v*` compatibility.

`--apply` checks the original contents before each replacement and refuses stale
inputs. Each file is replaced atomically; a filesystem failure can leave earlier
files updated, so review the result and rerun the idempotent command. Existing
formatting and line endings are retained. `--check` exits 1 when source declarations
still differ from the requested version.
