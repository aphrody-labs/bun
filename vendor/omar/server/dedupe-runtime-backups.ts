import {linkSync,realpathSync,renameSync,statSync,unlinkSync} from "node:fs";
import {resolve} from "node:path";
const root=realpathSync("C:/SSH/omar/server/var/runtime-backups");
const prefix=root.toLowerCase()+"\\";
const groups=new Map<string,string>();
const changes:any[]=[];
for await(const file of new Bun.Glob("**/*.exe").scan({cwd:root,absolute:true,followSymlinks:false})){
 const target=realpathSync(file);
 if(!resolve(target).toLowerCase().startsWith(prefix))throw new Error("Backup path escaped its root");
 const before=statSync(target,{bigint:true});
 const digest=new Bun.CryptoHasher("sha256");
 for await(const chunk of Bun.file(target).stream())digest.update(chunk);
 const sha256=digest.digest("hex");
 const key=`${before.size}:${sha256}`;
 const canonical=groups.get(key);
 if(!canonical){groups.set(key,target);continue;}
 const other=statSync(canonical,{bigint:true});
 if(before.ino===other.ino&&before.dev===other.dev)continue;
 const temporary=target+".dedupe-previous";
 if(await Bun.file(temporary).exists())throw new Error("Previous dedupe transaction remains");
 renameSync(target,temporary);
 try{linkSync(canonical,target);}catch(error){renameSync(temporary,target);throw error;}
 try{unlinkSync(temporary);}catch(error){unlinkSync(target);renameSync(temporary,target);throw error;}
 const after=statSync(target,{bigint:true});
 if(after.ino!==statSync(canonical,{bigint:true}).ino)throw new Error("Hardlink identity verification failed");
 changes.push({target,canonical,sha256,reclaimedBytes:before.nlink===1n?Number(before.size):0});
}
const result={observedAt:new Date().toISOString(),scope:root,filesDeduplicated:changes.length,reclaimedBytes:changes.reduce((sum,item)=>sum+item.reclaimedBytes,0),method:"NTFS hardlinks; all backup paths and distinct binary versions retained",changes};
await Bun.write("C:/SSH/omar/server/var/runtime-backup-dedupe.json",JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({filesDeduplicated:result.filesDeduplicated,reclaimedBytes:result.reclaimedBytes,scope:root}));
