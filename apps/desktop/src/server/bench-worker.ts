// SPDX-License-Identifier: Apache-2.0
/** Benchmarks of native Bun APIs, run in a Bun Worker so the WebOS server keeps answering meanwhile. */
declare const self: Worker;

export interface BenchResult {
  name: string;
  iterations: number;
  durationMs: number;
  opsPerSec: number;
  environment: string;
}

const PAYLOAD = new TextEncoder().encode("Bun WebOS benchmark payload: native APIs measured in a worker. ".repeat(64));
const TSX =
  'export function Widget({ title }: { title: string }) { return <div className="card"><h1>{title}</h1></div>; }';

async function measure(name: string, iterations: number, fn: () => unknown): Promise<BenchResult> {
  const start = Bun.nanoseconds();
  for (let i = 0; i < iterations; i++) await fn();
  const durationMs = (Bun.nanoseconds() - start) / 1e6;
  return {
    name,
    iterations,
    durationMs: Math.round(durationMs * 100) / 100,
    opsPerSec: Math.round((iterations / Math.max(durationMs, 1e-3)) * 1000),
    environment: `Bun ${Bun.version} worker (${process.platform}-${process.arch})`,
  };
}

export async function runBenchmarks(): Promise<BenchResult[]> {
  const transpiler = new Bun.Transpiler({ loader: "tsx" });
  const deflated = Bun.deflateSync(PAYLOAD);
  return [
    await measure("Bun.Transpiler (TSX)", 2000, () => transpiler.transformSync(TSX)),
    await measure("Bun.deflateSync (libdeflate)", 2000, () => Bun.deflateSync(PAYLOAD)),
    await measure("Bun.inflateSync (libdeflate)", 2000, () => Bun.inflateSync(deflated)),
    await measure("Bun.zstdCompressSync", 2000, () => Bun.zstdCompressSync(PAYLOAD)),
    await measure("Bun.hash (wyhash)", 20000, () => Bun.hash(PAYLOAD)),
    await measure("Bun.CryptoHasher (sha256)", 5000, () => new Bun.CryptoHasher("sha256").update(PAYLOAD).digest()),
    await measure("Bun.password.hash (argon2id)", 4, () => Bun.password.hash("bun-webos", { algorithm: "argon2id" })),
  ];
}

self.onmessage = async () => {
  try {
    self.postMessage({ ok: true, results: await runBenchmarks() });
  } catch (error) {
    self.postMessage({ ok: false, error: (error as Error).message });
  }
};
