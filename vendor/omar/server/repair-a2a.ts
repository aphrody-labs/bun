import windows from "bun:windows";
const configPath="C:/SSH/omar/server/services.json";
const config=await Bun.file(configPath).json();
const a2a=config.services.find((s:any)=>s.id==="a2a");
a2a.cwd="C:/aphrody";a2a.env={...(a2a.env??{}),APHRODY_ROOT:"C:/aphrody"};
a2a.command[a2a.command.indexOf("--coord-dir")+1]="C:/aphrody/.coord";
await Bun.write(configPath,JSON.stringify(config,null,2)+"\n");
windows.services.stop("OmarServer");
const deadline=Date.now()+15000;
while(windows.services.get("OmarServer")?.state!=="stopped"){
 if(Date.now()>deadline)throw new Error("Service did not stop within deadline");await Bun.sleep(200);
}
windows.services.start("OmarServer");
console.log(JSON.stringify({a2aCwd:a2a.cwd,restarted:"OmarServer",coord:"C:/aphrody/.coord"}));
