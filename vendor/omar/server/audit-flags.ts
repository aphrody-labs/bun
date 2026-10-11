import {withBunMcp} from "./bun-mcp-client.ts";
await withBunMcp("C:/bun",async call=>{
 for(const [name,args] of [["vfs_grep",{pattern:"BUN_FEATURE_FLAG_",paths:["src","docs","packages"],globs:["*.rs","*.ts","*.mdx"],context:1,max_per_file:50,limit:250,max_tokens:12000}],["docs_search",{query:"feature flags experimental windows winrt winui GPU",limit:8}],["vfs_find",{query:"feature_flag",limit:30}]] as const){const result=await call(name,args);await Bun.write(`C:/SSH/omar/server/var/bun-${name}-flags.json`,JSON.stringify(result,null,2)+"\n");console.log(JSON.stringify({tool:name,result}));}
});
