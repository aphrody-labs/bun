for (const m of ["fs", "path", "os", "crypto", "http", "stream", "zlib", "url", "util", "events", "child_process"]) require("node:" + m);
console.log(JSON.stringify({ rss: process.memoryUsage.rss() }));
