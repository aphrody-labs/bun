import React, {useEffect,useState} from "react";
import {api} from "../api";
const number=(value:number|undefined)=>(value??0).toLocaleString("fr-FR");

export function OmarServices({resources,cache}:{resources:any[];cache:any}){
 const [services,setServices]=useState<any[]>([]);
 const [live,setLive]=useState<any>(null);
 const [connected,setConnected]=useState(false);
 const [events,setEvents]=useState(0);
 useEffect(()=>{
  let stopped=false;
  let socket:WebSocket;
  let retry:ReturnType<typeof setTimeout>|undefined;
  const health=async()=>{try{const result=await api<any>("/api/omar/services");if(!stopped)setServices(result.services??[]);}catch{if(!stopped)setServices([]);}};
  function connect(){
   socket=new WebSocket(new URL("/system-stream/",window.location.href).href.replace(/^http/,"ws"));
   socket.onopen=()=>{if(!stopped)setConnected(true);};
   socket.onmessage=event=>{
    if(stopped)return;
    try{const message=JSON.parse(String(event.data));if(message.type==="snapshot")setLive(message.data);else if(message.type==="event")setEvents(n=>n+1);}catch{}
   };
   socket.onerror=()=>socket.close();
   socket.onclose=()=>{if(!stopped){setConnected(false);retry=setTimeout(connect,3000);}};
  }
  connect();void health();const timer=setInterval(()=>void health(),10_000);
  return()=>{stopped=true;clearInterval(timer);if(retry)clearTimeout(retry);socket?.close();};
 },[]);
 return <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
  <section><h3 className="text-sm font-semibold">Ce PC en direct</h3>
   <p role="status" className="mt-2 text-xs opacity-70">{connected?"Connecté · instantané toutes les 2 secondes":"Connexion au stream Windows…"} · {number(events)} événements reçus</p>
   {live&&<dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
    <div><dt className="opacity-60">Mémoire libre</dt><dd className="mt-1">{(live.memory.availablePhysical/1073741824).toFixed(1)} / {(live.memory.totalPhysical/1073741824).toFixed(1)} Go</dd></div>
    <div><dt className="opacity-60">GPU</dt><dd className="mt-1">{live.gpu.adapter} · {(live.gpu.dedicatedVideoMemory/1073741824).toFixed(1)} Go</dd></div>
    <div><dt className="opacity-60">Processus</dt><dd className="mt-1">{number(live.processes.length)}</dd></div>
    <div><dt className="opacity-60">Mesure</dt><dd className="mt-1">{new Date(live.observedAt).toLocaleTimeString("fr-FR")}</dd></div>
   </dl>}
  </section>
  <section><h3 className="text-sm font-semibold">Démarrage OmarServer</h3>
   <div className="mt-3 grid gap-2 sm:grid-cols-2">{services.map(service=><div key={service.id} className="flex justify-between rounded-lg border border-white/10 p-2 text-xs"><span>{service.id}</span><span className={service.healthy?"text-emerald-400":"text-amber-300"}>{service.healthy?"Actif":"Indisponible"}</span></div>)}</div>
  </section>
  <section><h3 className="text-sm font-semibold">Cache partagé</h3>
   <p className="mt-2 text-xs opacity-70">{cache?.available?`${number(cache.keys)} clés · ${Math.round(cache.memoryBytes/1048576)} Mo utilisés sur ${Math.round(cache.maxmemoryBytes/1048576)} Mo · ${cache.persistence}`:"Cache indisponible. SQLite reste la source de l’index."}</p>
   {cache?.snapshot&&<p className="mt-2 text-xs opacity-65">{cache.snapshot.complete?"Snapshot complet":"Snapshot incomplet"} · {number(cache.snapshot.rows)} lignes · {number(cache.snapshot.tables)} tables · {number(cache.snapshot.chunks)} chunks. Renouvellement toutes les 30 minutes.</p>}
  </section>
  <h3 className="text-sm font-semibold">Ressources Omar</h3>
  {resources.map(resource=><article key={resource.id} className="border-b border-white/10 pb-3"><h4 className="text-sm">{resource.name}</h4><p className="mt-1 break-all text-xs opacity-65">{resource.canonical_path}</p></article>)}
 </div>;
}
