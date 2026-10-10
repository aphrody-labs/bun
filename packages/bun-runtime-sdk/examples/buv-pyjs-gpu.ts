// SPDX-License-Identifier: Apache-2.0
import { Python } from "buv:python";
import { Python as PyJS } from "pyjs:python";
import { GpuRuntime } from "../../buv/gpu.ts";

const libraryPath = process.env.BUV_RUNTIME_LIB;
if (!libraryPath) throw new Error("Set BUV_RUNTIME_LIB to the qualified GPU provider");
if (Python !== PyJS) throw new Error("Buv and PyJS must share the Python host");

using py = Python.open();
py.exec(String.raw`
import os
import numpy as np
import pycuda.driver as cuda
from pycuda.compiler import SourceModule

cuda.init()
context = cuda.Device(0).make_context()
try:
    source = np.arange(37, dtype=np.float32)
    allocation = cuda.mem_alloc(source.nbytes)
    try:
        cuda.memcpy_htod(allocation, source)
        module = SourceModule('extern "C" __global__ void twice(float *x, unsigned int n) { unsigned int i = blockIdx.x * blockDim.x + threadIdx.x; if (i < n) x[i] *= 2.0f; }', no_extern_c=True)
        module.get_function("twice")(allocation, np.uint32(source.size), block=(32, 1, 1), grid=(2, 1, 1))
        context.synchronize()
        output = np.empty_like(source)
        cuda.memcpy_dtoh(output, allocation)
        assert np.array_equal(output, source * 2)
        verified = output.tolist()
    finally:
        allocation.free()
finally:
    context.pop()
    context.detach()
`);
if (py.evalJSON<number>("os.getpid()") !== process.pid) throw new Error("Python process mismatch");
const input = Float32Array.from(py.evalJSON<number[]>("verified"));

using gpu = GpuRuntime.load({ libraryPath });
const report = await gpu.info();
if (!report.selected?.nvidia || !report.cuda?.nvrtcLoaded) throw new Error("NVIDIA GPU/NVRTC unavailable");
if (process.platform === "win32" && report.selected.backend !== "Dx12") {
  throw new Error("Expected the native D3D12 backend");
}

const wgsl = await gpu.wgsl({
  shader: `@group(0) @binding(0) var<storage, read_write> data: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x < arrayLength(&data)) { data[id.x] += 1.0; }
}`,
  workgroups: [1, 1, 1],
  data: input,
});
const intermediate = new Float32Array(wgsl.data.buffer, wgsl.data.byteOffset, wgsl.data.byteLength / 4);
const expected = Array.from({ length: 37 }, (_, i) => i * 2 + 1);
if (JSON.stringify([...intermediate]) !== JSON.stringify(expected)) throw new Error("WGSL readback mismatch");

const result = await gpu.cuda({
  source: `extern "C" __global__ void twice(float *x, unsigned int n) {
  unsigned int i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i < n) x[i] *= 2.0f;
}`,
  kernel: "twice",
  data: intermediate,
});
if (JSON.stringify([...result.data]) !== JSON.stringify(expected.map(value => value * 2))) {
  throw new Error("CUDA readback mismatch");
}
console.log(
  JSON.stringify({ revision: Bun.revision, pid: process.pid, adapter: report.selected, values: [...result.data] }),
);
