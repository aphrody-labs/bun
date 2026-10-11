import {withBunMcp,guardedWrite} from "./bun-mcp-client";
const path="C:/aphrody/tools/config/host/nginx/omar-webos.json";
const spec=await Bun.file(path).json();
const server=spec.servers[0];
server.custom_directives=["allow 127.0.0.1","allow 10.200.77.1","allow 10.200.77.3","allow 10.200.77.4","allow 10.200.77.10","deny all"];
server.server_names=["omar-webos","localhost","omar","10.200.77.10"];
const location=server.locations[0];
location.headers=location.headers.map((header:string[])=>header[0]==="Host"?["Host","$http_host"]:header);
if(!server.locations.some((location:any)=>location.path==="/system-stream/"))server.locations.push({path:"/system-stream/",proxy_pass:"http://127.0.0.1:8796/events",proxy_http_version:"1.1",headers:[["Host","$http_host"],["Upgrade","$http_upgrade"],["Connection","$connection_upgrade"],["Origin","$http_origin"]],custom_directives:["proxy_buffering off","proxy_read_timeout 3600s"]});
for(const directive of ["add_header Cross-Origin-Opener-Policy same-origin always","add_header Cross-Origin-Embedder-Policy require-corp always"]){
 if(!location.custom_directives.includes(directive))location.custom_directives.push(directive);
}
const dashboardPath="C:/aphrody/tools/config/host/nginx/omar-pc.json";
const dashboard=await Bun.file(dashboardPath).json();
for(const inherited of dashboard.servers[0].locations){
 if(inherited.path!=="/"&&!server.locations.some((location:any)=>location.path===inherited.path))server.locations.push(structuredClone(inherited));
}
await withBunMcp("C:/",call=>guardedWrite(call,path,JSON.stringify(spec,null,2)+"\n"));
const integrated=Bun.spawnSync({cmd:["C:/Windows/System32/aphrody.exe","infra","nginx","render",path],stdout:"pipe",stderr:"pipe"});
if(integrated.exitCode!==0)throw new Error("Integrated WebOS Nginx rendering failed");
await withBunMcp("C:/",call=>guardedWrite(call,"C:/SSH/omar/server/nginx/webos.conf",integrated.stdout.toString()));
dashboard.servers[0].server_names=dashboard.servers[0].server_names.filter((name:string)=>!server.server_names.includes(name.toLowerCase()));
for(const location of dashboard.servers[0].locations.filter((location:any)=>["/system-stream/","/system-snapshot/"].includes(location.path)))location.headers=location.headers.map((header:string[])=>header[0]==="Host"?["Host","$http_host"]:header);
await withBunMcp("C:/",call=>guardedWrite(call,dashboardPath,JSON.stringify(dashboard,null,2)+"\n"));
const dashboardRendered=Bun.spawnSync({cmd:["C:/Windows/System32/aphrody.exe","infra","nginx","render",dashboardPath],stdout:"pipe",stderr:"pipe"});
if(dashboardRendered.exitCode!==0)throw new Error("Aphrody dashboard rendering failed");
await withBunMcp("C:/",call=>guardedWrite(call,"C:/SSH/omar/server/nginx/servers.conf",dashboardRendered.stdout.toString()));
const {services}=await Bun.file("C:/SSH/omar/server/services.json").json();
const nginx=services.find((service:any)=>service.id==="nginx");
const check=Bun.spawnSync({cmd:[nginx.command[0],"-t","-p","C:/SSH/omar/server/nginx/","-c","nginx.conf"],stdout:"pipe",stderr:"pipe"});
if(check.exitCode!==0)throw new Error(check.stderr.toString());
console.log(JSON.stringify({webos:"http://localhost/",isolated:true,nginxConfigValid:true,restartRequired:true}));
