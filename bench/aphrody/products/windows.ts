import windows from "bun:windows";
const kernel32 = windows.family("kernel32");
for (let i = 0; i < 10000; i++) kernel32.GetCurrentProcessId();
let valid = true;
const start = performance.now();
for (let i = 0; i < 100000; i++) valid &&= kernel32.GetCurrentProcessId() === process.pid;
console.log("BENCH_RESULT " + JSON.stringify({ value: String(valid), workMs: performance.now() - start }));
