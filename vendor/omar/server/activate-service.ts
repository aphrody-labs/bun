import windows from "bun:windows";
import {existsSync,mkdirSync,renameSync} from "node:fs";
const root="C:/SSH/omar/server";
const run=(cmd:string[],strict=true)=>{const p=Bun.spawnSync({cmd,stdout:"pipe",stderr:"pipe",cwd:root});if(strict&&p.exitCode!==0)throw new Error(`${cmd[0]} ${cmd[1]} failed (${p.exitCode}): ${p.stderr.toString()}`);return p;};
const config=await Bun.file(`${root}/services.json`).json();
const webos=config.services.find((s:any)=>s.id==="webos");
const bundled=existsSync(`${root}/apps/bun-webos/dist/server.js`);
webos.cwd=`${root}/apps/bun-webos${bundled?"/dist":""}`;
webos.command[2]=`${webos.cwd}/server.${bundled?"js":"ts"}`;
if(bundled&&!webos.command.includes("--dist"))webos.command.push("--dist",webos.cwd);
if(!existsSync(webos.command[2]))throw new Error("Qualified deployed WebOS missing");
await Bun.write(`${root}/services.json`,JSON.stringify(config,null,2)+"\n");
const rendered=run(["aphrody","infra","nginx","render","C:/aphrody/tools/config/host/nginx/omar-webos.json"]);
await Bun.write(`${root}/nginx/webos.conf`,rendered.stdout);
const nginxMain=await Bun.file(`${root}/nginx/nginx.conf`).text();
if(!nginxMain.includes("include webos.conf;"))await Bun.write(`${root}/nginx/nginx.conf`,nginxMain.replace("include servers.conf;","include servers.conf;\n    include webos.conf;"));
const nginx=config.services.find((s:any)=>s.id==="nginx");
run([nginx.command[0],"-t","-p",`${root}/nginx/`,"-c","nginx.conf"]);
const hostsPath="C:/Windows/System32/drivers/etc/hosts";
const hosts=await Bun.file(hostsPath).text();
if(!/^\s*127\.0\.0\.1\s+omar-webos(?:\s|$)/m.test(hosts)){
 await Bun.write(`${root}/var/checkpoints/hosts-before-webos.txt`,hosts);
 await Bun.write(hostsPath,hosts.trimEnd()+"\r\n\r\n# Omar Bun WebOS — gateway loopback\r\n127.0.0.1 omar-webos\r\n");
}
for(const task of ["\\Aphrody\\Omar Nginx","\\Aphrody\\Omar Llama CUDA","\\Aphrody\\Native\\Omar A2A","\\Aphrody\\Native\\Omar System Stream"]){
 const xml=run(["schtasks.exe","/query","/tn",task,"/xml"],false);
 if(xml.exitCode===0){
   await Bun.write(`${root}/var/checkpoints/${task.split("\\").at(-1)}-before-service.xml`,xml.stdout);
   run(["schtasks.exe","/end","/tn",task],false);
   run(["schtasks.exe","/change","/tn",task,"/disable"]);
 }
}
run(["aphrody","infra","--root","C:/aphrody","boot","--host","local","--entry","OmarServer","apply","--json"]);
console.log(JSON.stringify({service:"OmarServer",state:windows.services.get("OmarServer"),legacyTasksDisabled:true,webos:"http://omar-webos/"}));
