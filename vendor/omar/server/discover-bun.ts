const child=Bun.spawnSync({cmd:["C:/Windows/System32/bun.exe","mcp","tools","--json"],env:{...process.env,BUN_FEATURE_FLAG_EXPERIMENTAL_MCP_NATIVE_TOOLS:"1"},stdout:"pipe",stderr:"pipe"});
if(child.exitCode!==0)throw new Error("Bun MCP tool discovery failed");
const parsed=JSON.parse(child.stdout.toString());
const tools=Array.isArray(parsed)?parsed:parsed.tools??parsed.result?.tools;
if(!Array.isArray(tools))throw new Error("Unexpected Bun MCP discovery shape");
await Bun.write("C:/SSH/omar/server/var/bun-mcp-tools.json",JSON.stringify(tools,null,2)+"\n");
console.log(JSON.stringify({runtime:Bun.version,revision:Bun.revision,count:tools.length,tools:tools.map(t=>({name:t.name,description:t.description?.slice(0,95)}))},null,2));
for(const name of ["host_inventory","host_find","vfs_find","vfs_grep","read_file","shell","vfs_apply"]){const tool=tools.find(t=>t.name===name);if(tool)console.log(JSON.stringify({name,inputSchema:tool.inputSchema}));}
