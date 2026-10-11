import {existsSync,lstatSync,mkdirSync,realpathSync,renameSync,rmSync} from "node:fs";
import {dirname,join,resolve} from "node:path";
const root=realpathSync("C:/SSH/omar");
const prefix=root.toLowerCase()+"\\";
const backup=join(root,"server/var/workspace-migration/retired");
mkdirSync(backup,{recursive:true});
const paths=["server/node_modules","server/apps/bun-webos/node_modules","server/apps/bun-plugin-tailwind/node_modules","server/bun.lock","server/apps/bun-webos/bun.lock","server/apps/bun-plugin-tailwind/bun.lock"];
const moved:Array<{source:string;target:string;directory:boolean}>=[];
function checked(path:string){const value=realpathSync(path);if(!value.toLowerCase().startsWith(prefix))throw new Error("Workspace path escaped canonical root");return value;}
for(const relative of paths){
 const source=join(root,relative);
 if(!existsSync(source))continue;
 if(lstatSync(source).isSymbolicLink())throw new Error(`Unexpected top-level link: ${relative}`);
 checked(source);
 const target=join(backup,relative.replaceAll("/","--"));
 checked(dirname(target));
 if(existsSync(target))throw new Error(`Retired dependency path already exists: ${target}`);
 const directory=lstatSync(source).isDirectory();
 renameSync(source,target);
 moved.push({source,target,directory});
}
try{
 const build=Bun.spawnSync({cmd:["C:/Windows/System32/bun.exe","--no-env-file","build.ts"],cwd:join(root,"server/apps/bun-webos"),stdout:"pipe",stderr:"pipe"});
 if(build.exitCode!==0)throw new Error(build.stderr.toString().slice(0,2000));
 for(const name of ["react","react-dom","@aphrody/bun-plugin-tailwind","@bjorn3/browser_wasi_shim"]){
  const resolved=Bun.resolveSync(name,join(root,"server/apps/bun-webos"));
  if(!resolve(resolved).toLowerCase().startsWith(prefix))throw new Error(`Dependency escaped monorepo: ${name}`);
 }
 for(const item of moved.filter(item=>item.directory)){
  const target=checked(item.target);
  const intended=realpathSync(backup).toLowerCase()+"\\";
  if(!target.toLowerCase().startsWith(intended)||lstatSync(target).isSymbolicLink())throw new Error("Retired deletion escaped checked backup directory");
  rmSync(target,{recursive:true});
 }
 const result={completedAt:new Date().toISOString(),canonicalLock:join(root,"bun.lock"),dependenciesRoot:join(root,"node_modules"),versionsPreserved:true,retired:moved.map(item=>({path:item.source,kind:item.directory?"regenerable dependencies removed":"old lock preserved under ignored migration backup"})),buildQualified:true};
 await Bun.write(join(backup,"result.json"),JSON.stringify(result,null,2)+"\n");
 console.log(JSON.stringify(result));
}catch(error){
 for(const item of [...moved].reverse())if(existsSync(item.target)&&!existsSync(item.source))renameSync(item.target,item.source);
 throw error;
}
