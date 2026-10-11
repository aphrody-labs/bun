import {mkdirSync} from "node:fs";
const stamp=new Date().toISOString().replace(/[:.]/g,"-");
const destination=`C:/SSH/omar/server/var/profile-export/${stamp}`;
mkdirSync(destination,{recursive:true});
const permissions=Bun.spawnSync({cmd:["icacls.exe",destination,"/inheritance:r","/grant:r","*S-1-5-18:(OI)(CI)F","*S-1-5-32-544:(OI)(CI)F","*S-1-5-21-3932564588-2171231841-2513615082-1001:(OI)(CI)F"],stdout:"pipe",stderr:"pipe"});
if(permissions.exitCode!==0)throw new Error("Private export directory ACL failed");
const files:Record<string,string>={};
const inventory:any[]=[];
const cleanUrl=(value:string)=>{try{const url=new URL(value);url.username="";url.password="";for(const key of [...url.searchParams.keys()])if(/token|password|passwd|secret|auth|credential|api.?key|code|session|jwt/i.test(key))url.searchParams.delete(key);if(/token|password|secret|auth|session|jwt/i.test(url.hash))url.hash="";return url.href;}catch{return "";}};
function bookmarks(node:any):any{if(!node||typeof node!=="object")return undefined;const result:any={};for(const key of ["name","type","date_added","date_modified"])if(typeof node[key]==="string")result[key]=node[key];if(typeof node.url==="string")result.url=cleanUrl(node.url);if(Array.isArray(node.children))result.children=node.children.map(bookmarks).filter(Boolean);return result;}
const opera="C:/Users/omara/AppData/Roaming/Opera Software";
for await(const path of new Bun.Glob("**/{Bookmarks,Preferences}").scan({cwd:opera,absolute:true,onlyFiles:true,followSymlinks:false})){ 
 const file=Bun.file(path);if(file.size>16777216){inventory.push({source:path,category:"opera",result:"skipped: exceeds16MiB"});continue;}
 try{
  const data=await file.json();const relative=path.replaceAll("\\","/").slice(opera.length+1).replace(/[^A-Za-z0-9_./-]/g,"_");
  if(path.endsWith("Bookmarks")){const roots=Object.fromEntries(Object.entries(data.roots??{}).map(([key,value])=>[key,bookmarks(value)]));files[`opera/${relative}.json`]=JSON.stringify({version:data.version??1,roots},null,2)+"\n";inventory.push({source:path,category:"opera-bookmarks",result:"copied-sanitized"});}
  else{const selected:any={};for(const key of ["intl","download","browser","appearance"])if(data[key]){const current=data[key];const allowed=key==="download"?["default_directory","prompt_for_download"]:key==="browser"?["show_home_button","check_default_browser"]:key==="intl"?["accept_languages","selected_languages"]:["font_scale","custom_chrome_frame","color_scheme"];selected[key]=Object.fromEntries(allowed.filter(k=>k in current).map(k=>[k,current[k]]));}files[`opera/${relative}.json`]=JSON.stringify(selected,null,2)+"\n";inventory.push({source:path,category:"opera-preferences",result:"copied-allowlist"});}
 }catch{inventory.push({source:path,category:"opera",result:"unreadable-or-not-JSON"});}
}
const github=Bun.spawnSync({cmd:["gh","api","user"],stdout:"pipe",stderr:"pipe"});
if(github.exitCode===0){try{const account=JSON.parse(github.stdout.toString());const keys=["login","id","name","html_url","avatar_url","bio","blog","company","location","public_repos","created_at"];files["github/profile.json"]=JSON.stringify(Object.fromEntries(keys.filter(k=>k in account).map(k=>[k,account[k]])),null,2)+"\n";inventory.push({source:"github-authenticated-api:user",category:"github-public-profile",result:"copied-allowlist"});}catch{inventory.push({category:"github-public-profile",result:"invalid-api-response"});}}
else inventory.push({category:"github-public-profile",result:"authentication-not-available"});
const manifest={createdAt:new Date().toISOString(),destination,transfer:"local staging only; external destination unresolved",inventory,included:Object.keys(files),excluded:["passwords","private keys","API tokens","environment secrets","cookies","browser login/session databases","Windows profile caches"],pending:["Google account data categories and authenticated export scope","GitHub private account/repository data categories","External transfer destination if requested"]};
files["manifest.json"]=JSON.stringify(manifest,null,2)+"\n";
const archive=new Bun.Archive(files,{compress:"gzip",mtime:0});
const path=`${destination}/omar-profile.tar.gz`;await Bun.write(path,archive);
const digest=new Bun.CryptoHasher("sha256").update(await Bun.file(path).arrayBuffer()).digest("hex");
await Bun.write(`${destination}/manifest.json`,files["manifest.json"]);
await Bun.write(`${destination}/SHA256SUMS.txt`,`${digest}  omar-profile.tar.gz\n`);
console.log(JSON.stringify({destination,archive:path,files:Object.keys(files).length,operaSources:inventory.filter(i=>i.category.startsWith("opera")&&i.result.startsWith("copied")).length,githubProfileIncluded:!!files["github/profile.json"],sha256:digest,externalTransfer:false}));
