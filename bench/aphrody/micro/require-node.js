const mods = ["fs","path","os","crypto","http","https","net","stream","zlib","url","util","events","child_process","buffer","assert","readline","dns","tls","http2","worker_threads","perf_hooks","async_hooks","vm","v8","tty","querystring","string_decoder","timers","fs/promises","stream/promises","module"];
const t = performance.now();
for (const m of mods) require("node:" + m);
console.log(JSON.stringify({ ms: performance.now() - t }));
