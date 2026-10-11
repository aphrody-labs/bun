type Rpc = {id?:number;result?:any;error?:{message:string}};
export async function guardedWrite(call:(name:string,args:Record<string,unknown>)=>Promise<any>,path:string,content:string){
 const exists=await Bun.file(path).exists();
 const textOf=(result:any)=>{if(result.isError)throw new Error(JSON.stringify(result));return result.content?.filter((c:any)=>c.type==="text").map((c:any)=>c.text).join("\n")??"";};
 const revision=exists?Number(textOf(await call("read_file",{path,max_tokens:20000})).match(/revision:\s*(\d+)/i)?.[1]):undefined;
 if(exists&&!Number.isFinite(revision))throw new Error("Missing file revision");
 const preview=textOf(await call("write_file",{path,content,...(exists?{revision}:{create_only:true}),max_tokens:20000}));
 const plan=Number(preview.match(/"plan"\s*:\s*(\d+)/i)?.[1]??preview.match(/plan(?:\s+id)?\s*[:#=]?\s*(\d+)/i)?.[1]);
 if(!Number.isFinite(plan))throw new Error("Missing write transaction plan");
 textOf(await call("vfs_apply",{plan,max_tokens:1000}));
}
export async function withBunMcp<T>(cwd:string,action:(call:(name:string,args:Record<string,unknown>)=>Promise<any>)=>Promise<T>):Promise<T>{
 const featureFile=Bun.file("C:/SSH/omar/server/runtime-features.json");
 const features=await featureFile.exists()?(await featureFile.json()).env:{};
 const cacheFile=Bun.file("C:/Users/omara/.aphrody/private/omar-redis/client.json");
 const cache=await cacheFile.exists()?{REDIS_URL:(await cacheFile.json()).url}:{};
 const process=Bun.spawn({cmd:["C:/Windows/System32/bun.exe","mcp","--cwd",cwd,"--profile","codex","--max-tokens","7000"],env:{...Bun.env,...features,...cache,BUN_FEATURE_FLAG_EXPERIMENTAL_MCP_NATIVE_TOOLS:"1"},stdin:"pipe",stdout:"pipe",stderr:"pipe"});
 let sequence=0;const pending=new Map<number,{resolve:(value:any)=>void;reject:(e:Error)=>void}>();
 const write=(value:unknown)=>{process.stdin.write(JSON.stringify(value)+"\n");process.stdin.flush();};
 const reader=(async()=>{let buffer="";const decoder=new TextDecoder();for await(const chunk of process.stdout){buffer+=decoder.decode(chunk,{stream:true});let end:number;while((end=buffer.indexOf("\n"))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);if(!line)continue;let reply:Rpc;try{reply=JSON.parse(line);}catch{continue;}if(typeof reply.id==="number"){const item=pending.get(reply.id);if(item){pending.delete(reply.id);reply.error?item.reject(new Error(reply.error.message)):item.resolve(reply.result);}}}}for(const item of pending.values())item.reject(new Error("Bun MCP server closed"));})();
 const request=(method:string,params:any)=>new Promise<any>((resolve,reject)=>{const id=++sequence;const timeout=setTimeout(()=>{pending.delete(id);reject(new Error(`Bun MCP ${method} timeout`));},90000);pending.set(id,{resolve:(value)=>{clearTimeout(timeout);resolve(value);},reject:(error)=>{clearTimeout(timeout);reject(error);}});write({jsonrpc:"2.0",id,method,params});});
 try{await request("initialize",{protocolVersion:"2025-06-18",capabilities:{},clientInfo:{name:"omar-native-work",version:"1.0.0"}});write({jsonrpc:"2.0",method:"notifications/initialized"});return await action((name,args)=>request("tools/call",{name,arguments:args}));}
 finally{process.stdin.end();process.kill();await process.exited;await reader;}
}
