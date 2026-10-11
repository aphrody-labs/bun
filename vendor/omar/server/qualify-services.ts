const root="C:/SSH/omar/server";
const results:any[]=[];
const health=await fetch("http://127.0.0.1:8797/health",{signal:AbortSignal.timeout(6000)}).then(r=>r.json());
if(!health.ok)throw new Error("Supervisor reports an unhealthy child");
results.push({name:"boot-supervisor",passed:true,services:health.services.map((s:any)=>s.id),runtimeRevision:health.runtimeRevision});
for(const path of ["/","/api/webos/system","/api/webos/capabilities"]){const response=await fetch(`http://127.0.0.1${path}`,{headers:{Host:"omar-webos",Origin:"http://omar-webos"},signal:AbortSignal.timeout(8000)});const passed=response.status===200;await response.body?.cancel();results.push({name:"webos-proxy",path,status:response.status,passed});if(!passed)throw new Error(`WebOS proxy failed ${path}`);}
const refused=await fetch("http://127.0.0.1/api/os/vfs/list",{headers:{Host:"omar-webos",Origin:"http://example.invalid","Sec-Fetch-Site":"cross-site"},signal:AbortSignal.timeout(5000)});
await refused.body?.cancel();if(refused.status!==403)throw new Error("WebOS cross-site request not refused");results.push({name:"webos-origin-guard",status:403,passed:true});
const events=await new Promise<{snapshots:number;events:number}>((resolve,reject)=>{
 const ws=new WebSocket("ws://127.0.0.1/system-stream/");let snapshots=0,events=0;
 const timeout=setTimeout(()=>{ws.close();reject(new Error("System WebSocket did not send expected messages"));},8000);
 ws.onmessage=(message)=>{try{const value=JSON.parse(String(message.data));if(value.type==="snapshot")snapshots++;if(value.type==="event")events++;if(snapshots&&events){clearTimeout(timeout);ws.close();resolve({snapshots,events});}}catch(error){clearTimeout(timeout);ws.close();reject(error);}};
 ws.onerror=()=>{clearTimeout(timeout);ws.close();reject(new Error("System WebSocket failed"));};
});results.push({name:"system-event-websocket",passed:true,...events});
const token=(await Bun.file("C:/Users/omara/.aphrody/private/omar-server/llama-api-key.txt").text()).trim();
const response=await fetch("http://127.0.0.1/v1/chat/completions",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({model:"omar-qwen3",messages:[{role:"user",content:"Réponds simplement OK."}],max_tokens:32,stream:true,chat_template_kwargs:{enable_thinking:false}}),signal:AbortSignal.timeout(30000)});
if(!response.ok)throw new Error(`CUDA chat failed: ${response.status}`);
const text=await response.text();const streamFrames=text.split(/\r?\n/).filter(l=>l.startsWith("data:")).length;
if(!streamFrames||!text.includes("[DONE]"))throw new Error("CUDA chat streaming incomplete");
results.push({name:"cuda-openai-chat-stream",status:response.status,passed:true,streamFrames,complete:true});
const record={checkedAt:new Date().toISOString(),results};await Bun.write(`${root}/var/services/qualification.json`,JSON.stringify(record,null,2)+"\n");console.log(JSON.stringify(record));
