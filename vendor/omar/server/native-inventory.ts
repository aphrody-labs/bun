import {withBunMcp} from "./bun-mcp-client.ts";
await withBunMcp("C:/",async call=>{
 for(const [name,args] of [["host_inventory",{refresh:true,max_tokens:2000}],["vfs_find",{query:"omar",kind:"dir",mode:"substring",limit:100,max_tokens:5000,path:"SSH"}],["docs_search",{query:"duplicate dedupe system packages winget uninstall",limit:5}]] as const){
  const result=await call(name,args);await Bun.write(`C:/SSH/omar/server/var/native-${name}.json`,JSON.stringify(result,null,2)+"\n");console.log(JSON.stringify({tool:name,result}));
 }
});
