---
name: bun-video
description: "Use the Bun Video package for HLS, DASH/MPD, HAR, browser adapters, and bounded WebGPU compute."
---

# Bun Video

The package lives in `packages/bun-video`. Read its protocol guide before changing
runtime behavior. WebGPU is exported from `@aphrody/bun-video/webgpu` and exposed
through `bun-video-webgpu`.

```sh
bun-video-webgpu info
bun-video-webgpu probe
bun-video-webgpu run shader.wgsl input.bin output.bin --backend native
```

Keep credentials, cookies, HAR captures, signed media URLs, and OAuth secrets
outside the repository. WebGPU compute is separate from DRM playback and does not
replace Remotion or HyperFrames frame encoding.

Reference: [`docs/project/bun-video-webgpu.md`](../../docs/project/bun-video-webgpu.md)
and [`packages/bun-video/docs/webgpu.md`](../../packages/bun-video/docs/webgpu.md).
