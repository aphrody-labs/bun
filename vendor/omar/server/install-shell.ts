import windows from "bun:windows";
import {mkdirSync} from "node:fs";
const root="C:/SSH/omar/server";
const key="HKLM\\SOFTWARE\\OpenSSH";
const names=["DefaultShell","DefaultShellCommandOption","DefaultShellEscapeArguments"];
const before=Object.fromEntries(names.map(name=>[name,windows.registry.get(key,name)]));
await Bun.write(`${root}/var/checkpoints/openssh-shell-before.json`,JSON.stringify(before,null,2)+"\n");
windows.registry.set(key,"DefaultShell","C:\\Windows\\System32\\bunsh.exe","REG_SZ");
windows.registry.set(key,"DefaultShellCommandOption","-c","REG_SZ");
windows.registry.set(key,"DefaultShellEscapeArguments",0,"REG_DWORD");
const fragment="C:/Users/omara/AppData/Local/Microsoft/Windows Terminal/Fragments/Omar";
mkdirSync(fragment,{recursive:true});
await Bun.write(`${fragment}/bun-shell.json`,JSON.stringify({profiles:[{guid:"{5db76c74-f13b-514b-ae59-2087eb08bce9}",name:"Omar — Bun Shell",commandline:"C:\\Windows\\System32\\bunsh.exe -l",startingDirectory:"C:\\Users\\omara",icon:"C:\\Windows\\System32\\bun.exe"}]},null,2)+"\n");
const checks=["hostname","bun --revision","echo omar-bun-shell"];
let passed=true;
for(const command of checks){const p=Bun.spawnSync({cmd:["C:/Windows/System32/bun.exe","ssh","exec","--native","--json","-i","C:/Users/omara/.ssh/id_ed25519","-o","ConnectTimeout=10","omara@127.0.0.1",command],stdout:"pipe",stderr:"pipe"});let code=-1;let output="";try{const value=JSON.parse(p.stdout.toString());code=value.exitCode??value.code??-1;output=value.stdout??"";}catch{} const ok=p.exitCode===0&&code===0;passed&&=ok;console.log(JSON.stringify({command,passed:ok,result:output.trim()}));}
if(!passed){for(const name of names){const value=before[name];if(value)windows.registry.set(key,name,value.value,value.type);else windows.registry.deleteValue(key,name);}throw new Error("SSH Bun shell qualification failed; previous defaults restored");}
console.log(JSON.stringify({sshShell:"Bun Shell",terminalProfile:"Omar — Bun Shell",registryQualified:true}));
