const t = performance.now();
for (const m of ["bun:ffi", "bun:sqlite", "bun:jsc", "bun:test"]) require(m);
console.log(JSON.stringify({ ms: performance.now() - t }));
