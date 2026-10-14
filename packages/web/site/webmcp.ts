import { PUBLIC_BUN_TOOLS } from "./public-tools";

/** Browser tools share the same public catalogue as the site's HTTP MCP adapter. */
export const WEBMCP_SCRIPT = `(()=>{
const tools=${JSON.stringify(PUBLIC_BUN_TOOLS)},key=Symbol.for('bun.site.webmcp');
async function read(response,signal){
  const reader=response.body?.getReader();if(!reader)throw Error('Empty public response');
  const decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
  const cancel=()=>{void reader.cancel().catch(()=>{})};signal.addEventListener('abort',cancel,{once:true});
  try{for(;;){signal.throwIfAborted();const part=await reader.read();signal.throwIfAborted();if(part.done)break;bytes+=part.value.length;if(bytes>1048576)throw Error('Public response exceeds 1 MiB');text+=decoder.decode(part.value,{stream:true})}return JSON.parse(text+decoder.decode())}
  finally{signal.removeEventListener('abort',cancel);await reader.cancel().catch(()=>{});reader.releaseLock()}
}
async function start(){
  const context=document.modelContext,status=document.querySelector('[data-webmcp-status]');
  if(!context||typeof context.registerTool!=='function'){if(status)status.textContent='Public HTTP tools are available. This browser does not expose WebMCP.';return}
  if(document[key]&&!document[key].signal.aborted)return;
  const controller=new AbortController();document[key]=controller;
  try{for(const tool of tools){await context.registerTool({name:tool.name,description:tool.description,inputSchema:{type:'object',properties:tool.properties,required:tool.required,additionalProperties:false},
    async execute(input,{signal}){try{
      if(!input||typeof input!=='object'||Array.isArray(input))return {error:'Expected an input object'};
      for(const name of tool.required)if(input[name]===undefined)return {error:'Missing '+name};
      const url=new URL(tool.path,location.origin);
      for(const [name,value]of Object.entries(input)){
        const schema=tool.properties[name];if(!schema)return {error:'Unknown parameter '+name};
        if(schema.type==='string'?(typeof value!=='string'||value.length<(schema.minLength||0)||value.length>(schema.maxLength||500)):(typeof value!=='number'||!Number.isInteger(value)||value<schema.minimum||value>schema.maximum))return {error:'Invalid '+name};
        url.searchParams.set(name,String(value))
      }
      const response=await fetch(url,{signal,credentials:'omit',redirect:'error',headers:{accept:'application/json'}});
      const data=await read(response,signal);return response.ok?data:{error:'Public API returned '+response.status,details:data};
    }catch(error){if(signal.aborted)throw error;return {error:'Public Bun tool failed; retry or use its HTTP route.'}}},
    annotations:{readOnlyHint:true,untrustedContentHint:true}
  },{signal:controller.signal})}
  if(status)status.textContent='Four public Bun tools registered with WebMCP.';
  }catch{controller.abort();if(status)status.textContent='WebMCP registration failed. Public HTTP tools remain available.'}
}
window.addEventListener('pagehide',()=>document[key]?.abort());
window.addEventListener('pageshow',()=>{void start()});void start();
})();`;
