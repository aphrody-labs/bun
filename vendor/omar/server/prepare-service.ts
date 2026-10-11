import { mkdirSync } from "node:fs";
const root = "C:/SSH/omar/server";
const catalogPath = "C:/aphrody/tools/config/service-catalog.json";
const catalog = await Bun.file(catalogPath).json();
const nginx = catalog.boot.entries.find((e: any) => e.name === "Omar Nginx");
const llama = catalog.boot.entries.find((e: any) => e.name === "Omar Llama CUDA");
if (!nginx || !llama) throw new Error("Expected existing declared native services");
const bun = "C:/Users/omara/.bun/bin/bun.exe";
const aphrody = "C:/Users/omara/AppData/Local/Aphrody/bin/aphrody.exe";
mkdirSync(`${root}/var/checkpoints`, {recursive:true});
mkdirSync(`${root}/var/coord`, {recursive:true});
await Bun.write(`${root}/var/checkpoints/service-catalog-before-omar-server.json`, JSON.stringify(catalog,null,2)+"\n");
const services = [
  { id:"nginx", command:[nginx.execute,"-p",`${root}/nginx/`,"-c","nginx.conf","-g","daemon off;"], cwd:nginx.workingDirectory, health:"http://127.0.0.1/" },
  { id:"a2a", command:[aphrody,"a2a","serve","--bind","127.0.0.1:8788","--coord-dir",`${root}/var/coord`], cwd:root, health:"http://127.0.0.1:8788/ping" },
  { id:"system-stream", command:[bun,"--no-env-file",`${root}/system-stream.ts`], cwd:root, health:"http://127.0.0.1:8796/health" },
  { id:"llama-cuda", command:[llama.execute,"--model","C:/Users/omara/.aphrody/models/omar-server/Qwen3-0.6B-Q8_0.gguf","--host","127.0.0.1","--port","8081","--n-gpu-layers","99","--ctx-size","2048","--parallel","1","--alias","omar-qwen3","--api-key-file","C:/Users/omara/.aphrody/private/omar-server/llama-api-key.txt"],cwd:llama.workingDirectory,health:"http://127.0.0.1:8081/health" },
  { id:"webos", command:[bun,"--no-env-file","C:/bun/packages/bun-webos/server.ts","--hostname","127.0.0.1","--port","3000","--data",`${root}/var/webos`,"--root",`${root}/var/webos/home`],cwd:"C:/bun/packages/bun-webos",health:"http://127.0.0.1:3000/api/webos/system",env:{NODE_ENV:"production"} }
];
await Bun.write(`${root}/services.json`, JSON.stringify({version:1,services},null,2)+"\n");
for (const name of ["Omar Nginx","Omar Llama CUDA","Omar A2A","Omar System Stream"]) {
  const entry = catalog.boot.entries.find((e:any)=>e.host==="local"&&e.name===name);
  if(entry) entry.hold="Lifecycle owned by OmarServer Windows service (Bun supervisor, C:/SSH/omar/server/services.json); legacy task disabled for recovery.";
}
catalog.boot.entries = catalog.boot.entries.filter((e:any)=>!(e.host==="local"&&e.kind==="docker"&&["omar-wayland","omar-vllm"].includes(e.container)));
if(!catalog.boot.entries.some((e:any)=>e.host==="local"&&e.name==="OmarServer")) catalog.boot.entries.push({host:"local",kind:"windowsService",name:"OmarServer",restartOnFailure:true});
await Bun.write(catalogPath,JSON.stringify(catalog,null,2)+"\n");
console.log(JSON.stringify({prepared:services.map(s=>s.id),bootService:"OmarServer",legacyTasksHeld:true}));
