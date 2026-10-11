# Bun Video WebGPU

`@aphrody/bun-video` exposes bounded WGSL compute for Bun video workflows through
`@aphrody/bun-video/webgpu` and the `bun-video-webgpu` CLI.

```ts
import { runWebGpuJob } from "@aphrody/bun-video/webgpu";

const result = await runWebGpuJob({
  shader: `@compute @workgroup_size(1) fn main() {}`,
  workgroups: [1, 1, 1],
  data: new Uint8Array(),
});
```

Use `backend: "chromium"` for Bun-launched Chromium WebGPU, or the default
`native` backend with the installed wgpu/CUDA runtime provider. The CLI supports
`info`, `probe`, `run`, and the Windows `desktop` adapter probe.

This API performs compute and readback. It does not claim DRM access, replace the
official Crunchyroll player, or automatically encode WebGPU composition output.
See the package guide at [`packages/bun-video/docs/webgpu.md`](../../packages/bun-video/docs/webgpu.md).
