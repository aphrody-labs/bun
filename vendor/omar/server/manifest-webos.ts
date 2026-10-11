import {readdirSync} from "node:fs";
import {withBunMcp,guardedWrite} from "./bun-mcp-client";
const root="C:/SSH/omar/server/apps/bun-webos";
const base="65c232c1db46f01037b983a11499df61229d1511";
const files:any[]=[];
async function scan(dir:string){
 for(const item of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
  if(["node_modules","dist","target",".git"].includes(item.name)||item.isSymbolicLink())continue;
  const path=`${dir}/${item.name}`;
  if(item.isDirectory()){await scan(path);continue;}
  if(!item.isFile())continue;
  const relative=path.slice(root.length+1);
  const bytes=await Bun.file(path).bytes();
  const sha256=new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
  const original=Bun.spawnSync({cmd:["git","show",`${base}:packages/bun-webos/${relative}`],cwd:"C:/bun",stdout:"pipe",stderr:"ignore"});
  const baseSha256=original.exitCode===0?new Bun.CryptoHasher("sha256").update(original.stdout.toString().replaceAll("\r\n","\n")).digest("hex"):null;
  const textHash=new Bun.CryptoHasher("sha256").update(new TextDecoder().decode(bytes).replaceAll("\r\n","\n")).digest("hex");
  files.push({path:relative,bytes:bytes.length,sha256,baseSha256,overlay:baseSha256!==textHash});
 }
}
await scan(root);
const manifest={schemaVersion:2,generatedAt:new Date().toISOString(),runtime:Bun.version,revision:Bun.revision,baseRepository:"aphrody-labs/bun-os",baseCommit:base,sourceRoot:"C:/bun/packages/bun-webos",deploymentRoot:root,count:files.length,overlayFiles:files.filter(f=>f.overlay).map(f=>f.path),treeSha256:new Bun.CryptoHasher("sha256").update(JSON.stringify(files)).digest("hex"),note:"Pinned upstream plus Omar integration; source overlay hashes distinguish local changes from the upstream snapshot.",files};
await withBunMcp("C:/",call=>guardedWrite(call,"C:/SSH/omar/server/apps/webos-source-manifest.json",JSON.stringify(manifest,null,2)+"\n"));
console.log(JSON.stringify({sourceFiles:files.length,overlayFiles:manifest.overlayFiles,treeSha256:manifest.treeSha256}));
