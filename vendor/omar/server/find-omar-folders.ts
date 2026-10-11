import {withBunMcp} from "./bun-mcp-client.ts";
await withBunMcp("C:/",async call=>{
const result=await call("vfs_find",{query:"omar",kind:"dir",mode:"substring",limit:100,max_tokens:6000});
await Bun.write("C:/SSH/omar/server/var/omar-folder-inventory.json",JSON.stringify(result,null,2)+"\n");console.log(JSON.stringify(result));
});
