const t = performance.now();
for (const m of ["picocolors", "tiny-invariant", "dotenv", "uuid"]) require(m);
console.log(JSON.stringify({ ms: performance.now() - t }));
