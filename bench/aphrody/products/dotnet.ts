import dotnet from "bun:dotnet";
import { join } from "node:path";
const directory = process.env.BENCH_DOTNET!;
dotnet.initialize(join(directory, "Fixture.runtimeconfig.json"));
const call = dotnet.unmanaged(
  { assembly: join(directory, "Fixture.dll"), type: "ProductBench.Native, Fixture", method: "Call" },
  { args: ["i32"], returns: "i32" },
);
const n = Number(process.env.BENCH_SIZE ?? 10);
for (let i = 0; i < 100000; i++) call(n);
let value = 0;
const start = performance.now();
for (let i = 0; i < 100000; i++) value = call(n);
console.log("BENCH_RESULT " + JSON.stringify({ value: String(value), workMs: performance.now() - start }));
