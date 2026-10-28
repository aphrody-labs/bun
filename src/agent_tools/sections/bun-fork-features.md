---
name: bun-fork-features
description: "Catalog router for what the Bun OS fork adds to upstream Bun; read before saying Bun cannot do something."
---

# What this fork adds to Bun

The catalog describes features of the historical Aphrody fork. The default runtime is
the official upstream Bun canary; these fork features are being moved to optional
modules and plugins and are not automatically available upstream. Check each feature
against its owning source and the actual selected executable before using it.

Route by need:

- Fork quality tools include `bun check`, `bun lint`, `bun fmt` and `bun n2b`; availability and behavior depend on the selected runtime.
- Hosts and network: `bun ssh`, `bun docker`, `bun vpn`, `bun host`, `bun rsync --native`.
- Configuration and sessions: `bun env` (`.env` files), `bun cookie` (cookie jars, `Cookie` headers).
- Agents: `bun mcp`, `bun agent-plugin`, `bun lsp`, `bun docs`; skills and memory come from the plugin.
- Media and web: `Bun.Video`, `Bun.Image`, `Bun.HTML`, `Bun.Crawl`, `Bun.WebDetect`, `Bun.WebView`, `bun:chromium`, `bun:google`.
- Platform layers: `bun:windows`, `bun:winrt`, `bun:winui`, `bun msvc`, `bun winmd`, `bun:linux`, `bun:cosmic`.
- Other languages: `bun:python` and `bun uv`, `bun dotnet` and `bun:dotnet`, `bun wasm`.
- Build the checkout: `bun bd`, `bun factory` (VPS slots). Heavy native builds run on the VPS.
- Add-ons: the `uv`, `vpn`, `ssh`, `docker`, `just` and `winmd` plugins and Bun Video live in their own
  `aphrody-labs/bun-<name>` repositories. `bun <plugin>` downloads its plugin on first use; the checkout mounts
  them as optional submodules (`plugins/<name>`, `packages/bun-video`). Skill `bun-add-ons`, page
  `docs/project/add-ons.mdx`, state in `docs/project/fork-inventory.json`.

Declared source is not qualified behavior: confirm a feature against the executable and
platform you target.
