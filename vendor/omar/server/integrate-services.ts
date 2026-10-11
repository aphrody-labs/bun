import {withBunMcp,guardedWrite} from "./bun-mcp-client";
const root="C:/SSH/omar/server";
const file=`${root}/services.json`;
const config=await Bun.file(file).json();
const {env}=await Bun.file(`${root}/runtime-features.json`).json();
for(const name of ["crawl-proxy-service","ntfs-index-service","warm-cache-service"]){
 const fragment=await Bun.file(`${root}/config/${name}.json`).json();
 fragment.env={...env,...fragment.env};
 if(fragment.command[0].toLowerCase().endsWith("bun.exe"))fragment.command[0]="C:/Windows/System32/bun.exe";
 const index=config.services.findIndex((s:any)=>s.id===fragment.id);
 if(index<0)config.services.push(fragment);else config.services[index]=fragment;
}
for(const service of config.services){
 service.cwd=service.cwd.replaceAll("C:/SSH/omar-server","C:/SSH/omar/server");
 service.command=service.command.map((arg:string)=>arg.replaceAll("C:/SSH/omar-server","C:/SSH/omar/server"));
 if(service.command[0].toLowerCase().endsWith("bun.exe"))service.command[0]="C:/Windows/System32/bun.exe";
 if(service.id==="webos"){
  const rootArgument=service.command.indexOf("--root");
  if(rootArgument>=0)service.command[rootArgument+1]="C:/SSH/omar";
 }
}
await withBunMcp("C:/",call=>guardedWrite(call,file,JSON.stringify(config,null,2)+"\n"));
console.log(JSON.stringify({configured:config.services.map((s:any)=>s.id),restartRequired:true}));
