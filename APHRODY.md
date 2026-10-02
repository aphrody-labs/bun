# Aphrody Bun Fork Architecture & Specifications

> **Repository**: [aphrody-labs/bun](https://github.com/aphrody-labs/bun)  
> **Upstream**: [oven-sh/bun](https://github.com/oven-sh/bun)  
> **Organization**: `aphrody-labs`  
> **Maintainer**: `aphrody-dev` (`contact@aphrody.com`)  
> **Role in Monorepo**: High-performance JavaScript/TypeScript runtime & native FFI engine for Aphrody OS & Google DeepMind Gemini 4 agent workflows.

---

## 1. Fork Topology & Branching Model

To ensure seamless upstream synchronization without merge fatigue or lost customizations, the fork employs a strict dual-branch topology:

| Branch | Tracking Target | Purpose & Policy |
| :--- | :--- | :--- |
| **`main`** | `upstream/main` (`oven-sh/bun:main`) | **Pristine Upstream Mirror**. Never commit fork-specific changes here. Updated via fast-forward only. |
| **`aphrody`** | `origin/aphrody` (`aphrody-labs/bun:aphrody`) | **Active Fork Integration Branch**. Contains Aphrody enhancements, custom FFI bridges, and agent performance optimizations. Auto-rebased or merged on upstream sync. |
| **`feature/*`** | `origin/feature/*` | Ephemeral feature development branches. |

---

## 2. Aphrody Enhancements & Optimization Architecture

1. **Native Agent Loop Low-Latency Execution**:
   - Tuned memory layout and garbage collection thresholds for sustained 24/7 background agent execution.
   - Zero telemetry and stripped analytics for maximum hermetic security.
2. **Aphrody FFI & Interop Bridge**:
   - First-class FFI binding contracts with the `aphrody` Rust engine and `obscura` headless browser engine (`packages/obscura`).
   - Direct memory sharing for image/canvas byte buffers and CDP WebSocket streams.
3. **Automated Upstream Ingestion & Drift Resolution**:
   - `scripts/bun_upstream_sync.ts` automates bidirectional tracking, detects conflicts, and resolves drift.
   - Versioned patches stored in `patches/aphrody/` guarantee reproducible re-application across major upstream refactors.
4. **Upstream PR & Issue Intelligence**:
   - `scripts/bun_upstream_tracker.ts` scans upstream issues and PRs for critical performance optimizations (SIMD, JIT, SQLite, allocator) to cherry-pick ahead of general releases.

---

## 3. Remote Configuration Matrix

```bash
# Verify remotes
git remote -v
# origin   git@github-dev:aphrody-labs/bun.git (fetch & push)
# upstream https://github.com/oven-sh/bun.git (fetch & push)
```

---

## 4. Upstream Synchronization Command

Run the automated synchronization engine from the monorepo root:

```bash
bun scripts/bun_upstream_sync.ts
```
