import { existsSync, mkdirSync } from "node:fs";
import windows from "bun:windows";
const root = "C:/SSH/omar/server";
const nssm = "C:/Users/omara/AppData/Local/Microsoft/WinGet/Packages/NSSM.NSSM_Microsoft.Winget.Source_8wekyb3d8bbwe/nssm-2.24-101-g897c7ad/win64/nssm.exe";
if (!windows.isElevated() || !existsSync(nssm)) throw new Error("Administrator token and existing NSSM are required");
const run = (args:string[]) => { const result = Bun.spawnSync({cmd:args,stdout:"pipe",stderr:"pipe"}); if(result.exitCode!==0) throw new Error(`${args[0]} ${args[1]} failed (${result.exitCode}): ${result.stderr.toString()}`); };
for (const file of ["supervisor.ts","services.json"]) if(!existsSync(`${root}/${file}`)) throw new Error(`Missing ${file}`);
new Bun.Transpiler({loader:"ts"}).transformSync(await Bun.file(`${root}/supervisor.ts`).text());
mkdirSync(`${root}/var/services`,{recursive:true});
if (!windows.services.list().some(s=>s.name==="OmarServer")) run([nssm,"install","OmarServer","C:/Users/omara/.bun/bin/bun.exe"]);
const values: [string,string[]][] = [
  ["Application",["C:/Users/omara/.bun/bin/bun.exe"]],
  ["AppParameters",["--no-env-file C:/SSH/omar/server/supervisor.ts"]],
  ["AppDirectory",[root]],
  ["DisplayName",["Omar Server"]],
  ["Description",["Bun 1.4.4 supervisor for native Nginx, A2A, Windows system stream, CUDA inference and Bun WebOS."]],
  ["Start",["SERVICE_AUTO_START"]],
  ["AppStdout",[`${root}/var/services/supervisor.log`]],
  ["AppStderr",[`${root}/var/services/supervisor-error.log`]],
  ["AppRotateFiles",["1"]], ["AppRotateOnline",["1"]], ["AppRotateBytes",["10485760"]],
  ["AppExit",["Default","Restart"]], ["AppRestartDelay",["5000"]],
  ["AppKillProcessTree",["1"]],
  ["AppEnvironmentExtra",["APHRODY_HOME=C:/Users/omara/.aphrody","BUN_INSTALL=C:/Users/omara/.bun"]]
];
for (const [key,value] of values) run([nssm,"set","OmarServer",key,...value]);
run(["sc.exe","failure","OmarServer","reset=","86400","actions=","restart/5000/restart/15000/restart/30000"]);
console.log(JSON.stringify({installed:true,service:"OmarServer",started:false,nativeRuntime:"Bun",syntaxValid:true}));
