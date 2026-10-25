# Bun Video WebGPU

`@aphrody/bun-video` exposes bounded WGSL compute for Bun video workflows through
`@aphrody/bun-video/webgpu` and the `bun-video webgpu` CLI.

```ts
import { runWebGpuJob } from "@aphrody/bun-video/webgpu";

const result = await runWebGpuJob({
  shader: `
    @group(0) @binding(0) var<storage, read_write> data: array<u32>;
    @compute @workgroup_size(1) fn main() { data[0] += 1; }
  `,
  workgroups: [1, 1, 1],
  data: new Uint32Array([0]),
});
console.log(
  new DataView(
    result.data.buffer,
    result.data.byteOffset,
    result.data.byteLength,
  ).getUint32(0, true),
);
```

Use `backend: "chromium"` for Bun-launched Chromium WebGPU, or the default
`native` backend with the installed wgpu/CUDA runtime provider. The CLI supports
`info`, `probe`, `run`, and the Windows `desktop` adapter probe.

This API performs compute and readback. It does not claim DRM access, replace the
official Crunchyroll player, or automatically encode WebGPU composition output.
See the package guide at [`packages/bun-video/docs/webgpu.md`](https://github.com/aphrody-labs/bun-video/blob/main/docs/webgpu.md).
