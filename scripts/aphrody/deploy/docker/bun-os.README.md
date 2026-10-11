<!-- SPDX-License-Identifier: Apache-2.0 -->
# Bun WebOS container profile

This additive Linux browser desktop uses a built public WebOS archive. Host APIs
are disabled unconditionally. It mounts no host directories, credentials, Docker
socket, device, model or private catalog. State is disposable container tmpfs.
The host port binds loopback; the existing `os.aphrody.com` UI remains unchanged
until the separately reviewed public route and browser integration are qualified.

Build through the declared VPS factory with a minimal context containing a
checksum-verified GNU Linux x64 Bun1.4.4 executable named `bun` and the extracted,
production-built archive under `package/`. Include its `scripts/serve-container.ts`
from the same source revision. The base digest currently contains GNU libc2.43
and Bun1.4.3; the explicit checked executable replaces that older runtime. Pass
`BUN_SHA256` and `SOURCE_REVISION` build arguments, then record the resulting image
digest. Do not copy a GNU binary into Alpine; a musl profile needs a separately
qualified musl runtime, plugin binaries and image. No such profile is claimed here.

The qualified GNU artifact is `1.4.4+dfde053a3`, SHA256
`890af6a675e1dc58b15a15777c53de3b2e82668690c9be5f6e87ec690246ac0e`.
The UI snapshot is `3252f0020bb6c51639f3fc2bb95549deab9a5981`, with the tracked
generic `src/core/theme.ts` adapter. A frozen source scan resolved all72 relative
imports across60 source files before the production build. The lightweight
factory lane serializes one UI job separately, with768MiB and one CPU admission;
it does not alter the global native build lock or rebuild the runtime. The Docker
build then copies the qualified executable and production assets.

Plan with `docker compose -f bun-os.compose.yaml config`, setting `BUN_OS_IMAGE`
to the verified image digest. Use the capability-owner Infra SSH workflow for
factory build and target Compose activation. Qualify non-root identity, Bun
version, page/CSS/JS/worker responses, capabilities `hostAccess:false`, every host
route refusal, graceful SIGTERM and unchanged existing public UI before proxying.
Preserve the previous image and route for rollback. No public bridge is included.

Windows host services and Linux/COSMIC desktop services retain their native owners.
Browser file/device permissions require a visitor gesture and are capability
specific. WASM and OPFS operate in the browser sandbox; this container is a Linux
process, not a Windows kernel or a complete JavaScriptCore runtime in WASM.
Any later native bridge must be independently paired, authenticated and scoped
on the visited/local host before enabling host operations.
