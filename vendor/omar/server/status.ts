import windows from "bun:windows";
console.log(JSON.stringify({observedAt:new Date().toISOString(),memory:windows.memory.status(),drives:windows.storage.drives(),service:windows.services.list().find(s=>s.name==="OmarServer"),buildProcesses:windows.processes.list().filter(p=>/rustc|clang|lld-link|ninja|cl\.exe/.test(p.name))},null,2));
