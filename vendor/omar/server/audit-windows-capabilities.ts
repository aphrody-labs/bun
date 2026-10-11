import windows from "bun:windows";
import winrt from "bun:winrt";
import winui from "bun:winui";
import {withBunMcp} from "./bun-mcp-client.ts";
console.log(JSON.stringify({windows:windows.isSupported,conpty:windows.conpty.info(),gpu:windows.gpu.d3d12.info(),winrtExports:Object.keys(winrt),winuiSupported:winui.isSupported()}));
try{console.log(JSON.stringify({winuiRuntime:winui.runtime()}));}catch(error){console.log(JSON.stringify({winuiRuntimeError:String(error)}));}
await withBunMcp("C:/bun",async call=>{for(const [name,args] of [["vfs_find",{query:"kernel32",path:"packages",limit:10}],["vfs_grep",{pattern:"BUN_WINDOWS_",paths:["src/js/bun","docs/runtime"],context:1,limit:70,max_tokens:5500}],["read_file",{path:"packages/bun-windows-kernel32/index.js",line_count:25}]] as const){console.log(JSON.stringify({tool:name,result:await call(name,args)}));}});
