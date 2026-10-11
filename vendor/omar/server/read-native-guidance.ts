import {withBunMcp} from "./bun-mcp-client.ts";
await withBunMcp("C:/bun",async call=>{
 for(const [name,args] of [["read_file",{path:"src/bun_core/feature_flags.rs",line_count:210}],["read_file",{path:"src/bun_core/env_var.rs",start_line:205,line_count:125}],["docs_read",{path:"runtime/winui"}],["read_file",{path:"packages/bun-windows-kernel32/index.ts",line_count:38}],["docs_read",{path:"project/setup"}]] as const){const r=await call(name,args);console.log(JSON.stringify({tool:name,args,result:r}));}
});
