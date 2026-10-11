import windows from "bun:windows";
const tasks = ["\\Aphrody\\Omar Nginx", "\\Aphrody\\Omar Llama CUDA", "\\Aphrody\\Native\\Omar A2A", "\\Aphrody\\Native\\Omar System Stream", "\\Aphrody\\Aphrody MCP HTTP"];
for (const task of tasks) {
  const result = Bun.spawnSync({cmd: ["schtasks.exe", "/query", "/tn", task, "/xml"], stdout:"pipe",stderr:"pipe"});
  const xml = result.stdout.toString();
  const tag = (name: string) => xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1];
  console.log(JSON.stringify({task,exists:result.exitCode===0,command:tag("Command"),workingDirectory:tag("WorkingDirectory"),enabled:tag("Enabled"),principal:tag("UserId"),argumentsContainSecret: /(?:--token|--password|Bearer\s)/i.test(tag("Arguments")??"")}));
}
console.log(JSON.stringify({services:windows.services.list().filter(s=>/OmarServer|AphrodyHost|OmarBeszelAgent|WireGuard|sshd/.test(s.name)),processes:windows.processes.list().filter(p=>/nginx|aphrody|llama-server/.test(p.name)).map(({pid,ppid,name})=>({pid,ppid,name}))}));
