#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { connect, findExecutable, type ChromiumConnection } from "bun:chromium";
import { Job } from "bun:windows";
import { mkdir } from "node:fs";
import { join, resolve } from "node:path";

type RecordJSON = Record<string, any>;
export interface CookieExport {
  cookies: {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    session: boolean;
    sameSite?: "Strict" | "Lax" | "None";
    partitionKey?: RecordJSON;
  }[];
}
export interface CapturedRequest {
  sessionId: string;
  requestId: string;
  frameId?: string;
  request: RecordJSON;
  response?: RecordJSON;
  initiator?: RecordJSON;
  bodyFile?: string;
  bodyError?: string;
  finished?: boolean;
}

function Panel() {
  return (
    <section aria-label="Inspection réseau vidéo">
      <style>{`:host{all:initial}section{font:14px Segoe UI,sans-serif;color:#edf3ff;background:#131b2b;padding:12px;border:1px solid #52709a;border-radius:12px;box-shadow:0 5px 25px #0008;width:min(580px,80vw)}header,form,nav{display:flex;gap:8px;align-items:center;margin-bottom:8px}input{flex:1;min-width:0}button,input{font:inherit;padding:6px;border-radius:6px;border:1px solid #6083b3}button{cursor:pointer;background:#c7dcff;color:#15243a}input:user-invalid{outline:2px solid #ff7c80}details{margin-top:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto}p{margin:6px 0}#flows{max-height:170px;overflow:auto}#flows button{display:block;width:100%;text-align:left;margin:3px 0;overflow-wrap:anywhere}`}</style>
      <header>
        <strong>Bun · Inspecteur vidéo</strong>
        <button id="collapse" type="button">
          Réduire
        </button>
      </header>
      <div id="body">
        <form>
          <label htmlFor="url">URL</label>
          <input id="url" type="url" required aria-describedby="status" />
          <button>Charger</button>
        </form>
        <nav>
          <button id="inspect" type="button">
            Sélectionner un élément
          </button>
          <button id="export" type="button">
            Exporter
          </button>
          <button id="quit" type="button">
            Fermer
          </button>
        </nav>
        <p id="status" role="status" aria-live="polite">
          Capture active · cliquer le lecteur pour identifier son cadre.
        </p>
        <label htmlFor="filter">Filtre réseau </label>
        <input id="filter" placeholder="m3u8, mpd, segment, domaine…" />
        <p id="selection">Tous les cadres · les correspondances sont des indices, pas une preuve de causalité.</p>
        <button id="all" type="button">
          Tous les cadres
        </button>
        <div id="flows" />
        <details>
          <summary>Détail de la requête / élément</summary>
          <pre id="detail" />
        </details>
        <details>
          <summary>Cookies JSON de la session isolée</summary>
          <pre id="cookies" />
        </details>
      </div>
    </section>
  );
}

const panelHTML = renderToStaticMarkup(<Panel />);
// Installed in a CDP isolated world: the visited site cannot call the binding.
const panelScript = `(() => {
  function mount() {
    if (document.getElementById('__bun_inspector')) return;
    const host=document.createElement('div');host.id='__bun_inspector';
    host.style.cssText='position:fixed;right:12px;top:12px;z-index:2147483647';
    document.documentElement.append(host);
    const root=host.attachShadow({mode:'closed'});root.innerHTML=${JSON.stringify(panelHTML)};
    const q=id=>root.getElementById(id);
    q('url').value=location.href;
    const send=(action,value)=>globalThis.bunInspector(JSON.stringify({action,value}));
    root.querySelector('form').addEventListener('submit',e=>{e.preventDefault();if(e.isTrusted)send('navigate',q('url').value)});
    q('url').addEventListener('blur',()=>q('url').setAttribute('aria-invalid',String(q('url').matches(':user-invalid'))));
    for(const action of ['inspect','export','quit','all']) q(action).onclick=e=>{if(e.isTrusted)send(action)};
    q('collapse').onclick=()=>{q('body').hidden=!q('body').hidden};
    q('filter').oninput=()=>render();
    let state={flows:[]};
    function render(){
      q('flows').replaceChildren();
      const filter=q('filter').value.toLowerCase();
      for(const flow of state.flows.filter(x=>x.url.toLowerCase().includes(filter))){
        const b=document.createElement('button');b.type='button';b.textContent=flow.label+' '+flow.url;
        b.onclick=e=>{if(e.isTrusted)send('request',flow.key)};q('flows').append(b);
      }
    }
    globalThis.bunInspectorUpdate=(next)=>{
      Object.assign(state,next);render();
      for(const name of ['status','selection','detail','cookies']) if(next[name]!==undefined)q(name).textContent=next[name];
    };
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})()`;

function validURL(value: string) {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password)
    throw new Error("URL HTTP(S) sans identifiants requise.");
  return url.href;
}

export function mediaCandidate(request: CapturedRequest) {
  return (
    /Media/.test(request.response?.type ?? "") ||
    /(?:mpegurl|dash\+xml|video\/|audio\/)/i.test(request.response?.mimeType ?? "") ||
    /\.(?:m3u8|mpd|m4s|ts|mp4|webm|aac)(?:[?#]|$)/i.test(request.request.url)
  );
}

async function waitEndpoint(child: Bun.Subprocess<"ignore", "ignore", "pipe">) {
  return await new Promise<string>((accept, reject) => {
    let ended = false;
    const finish = (error?: Error, endpoint?: string) => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      if (error) reject(error);
      else accept(endpoint!);
    };
    const timer = setTimeout(() => finish(new Error("Chrome CDP endpoint timed out")), 20000);
    void child.exited.then(() => finish(new Error("Chrome exited before CDP connection")));
    const drain = async () => {
      const reader = child.stderr.getReader();
      const decoder = new TextDecoder();
      let tail = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          tail += decoder.decode(value, { stream: true });
          const match = /DevTools listening on (wss?:\/\/[^\s]+)[\r\n]/.exec(tail);
          if (match) finish(undefined, match[1]);
          tail = tail.slice(-16384);
        }
        finish(new Error("Chrome exited before CDP endpoint"));
      } catch (error) {
        finish(error as Error);
      } finally {
        reader.releaseLock();
      }
    };
    void drain();
  });
}

class Inspector {
  requests = new Map<string, CapturedRequest>();
  contexts = new Map<string, number>();
  targets = new Map<string, RecordJSON>();
  jobs = new Set<Promise<unknown>>();
  bodies = new Set<Promise<unknown>>();
  errors: string[] = [];
  selectedFrame?: string;
  selectedSession?: string;
  mainSession = "";
  mainTarget = "";
  eventCount = 0;
  exportJob?: Promise<RecordJSON>;
  sink: ReturnType<ReturnType<typeof Bun.file>["writer"]>;
  stop = Promise.withResolvers<void>();
  constructor(
    public cdp: ChromiumConnection,
    public directory: string,
  ) {
    this.sink = Bun.file(join(directory, "network.ndjson")).writer();
  }
  run(job: Promise<unknown>) {
    this.jobs.add(job);
    void job
      .catch(error => {
        this.errors.push(String(error));
        void this.update({ status: "Une opération a échoué ; voir les erreurs dans l'export." }).catch(error =>
          this.errors.push(String(error)),
        );
      })
      .finally(() => this.jobs.delete(job));
  }
  async update(state: RecordJSON) {
    const contextId = this.contexts.get(this.mainSession);
    if (!contextId) return;
    await this.cdp.send(
      "Runtime.evaluate",
      { contextId, expression: `globalThis.bunInspectorUpdate?.(${JSON.stringify(state)})` },
      this.mainSession,
    );
  }
  async flows() {
    const flows = [...this.requests.entries()]
      .filter(([, r]) => {
        const matchesFrame =
          !this.selectedFrame || r.frameId === this.selectedFrame || r.sessionId === this.selectedSession;
        return matchesFrame && mediaCandidate(r);
      })
      .slice(-150)
      .map(([key, r]) => ({
        key,
        url: r.request.url,
        label: `${r.response?.status ?? "…"} ${r.response?.mimeType ?? ""}`,
      }));
    await this.update({ flows });
  }
  async session(sessionId: string, target: RecordJSON) {
    this.targets.set(sessionId, target);
    await this.cdp.send("Runtime.enable", {}, sessionId);
    await this.cdp.send(
      "Network.enable",
      { maxTotalBufferSize: 128 * 1024 * 1024, maxResourceBufferSize: 32 * 1024 * 1024 },
      sessionId,
    );
    await this.cdp.send(
      "Target.setAutoAttach",
      { autoAttach: true, waitForDebuggerOnStart: true, flatten: true },
      sessionId,
    );
    if (["page", "iframe"].includes(target.type)) {
      await this.cdp.send("Page.enable", {}, sessionId);
      await this.cdp.send("DOM.enable", {}, sessionId);
      await this.cdp.send("Overlay.enable", {}, sessionId);
      await this.cdp.send(
        "Runtime.addBinding",
        { name: "bunInspector", executionContextName: "bun-inspector" },
        sessionId,
      );
      if (sessionId === this.mainSession)
        await this.cdp.send(
          "Page.addScriptToEvaluateOnNewDocument",
          { source: panelScript, worldName: "bun-inspector" },
          sessionId,
        );
    }
    await this.cdp.send("Runtime.runIfWaitingForDebugger", {}, sessionId);
  }
  async select(sessionId: string, backendNodeId: number) {
    const { node } = await this.cdp.send<RecordJSON>("DOM.describeNode", { backendNodeId, depth: 0 }, sessionId);
    const { object } = await this.cdp.send<RecordJSON>("DOM.resolveNode", { backendNodeId }, sessionId);
    const { result } = await this.cdp.send<RecordJSON>(
      "Runtime.callFunctionOn",
      {
        objectId: object.objectId,
        returnByValue: true,
        functionDeclaration: `function(){return {tag:this.tagName,id:this.id,src:this.currentSrc||this.src||null,html:this.outerHTML?.slice(0,12000)}}`,
      },
      sessionId,
    );
    await this.cdp.send("Runtime.releaseObject", { objectId: object.objectId }, sessionId);
    const { frameTree } = await this.cdp.send<RecordJSON>("Page.getFrameTree", {}, sessionId);
    this.selectedFrame = node.frameId ?? frameTree.frame.id;
    this.selectedSession = node.frameId ? undefined : sessionId;
    await this.cdp.send("Overlay.setInspectMode", { mode: "none", highlightConfig: {} }, sessionId);
    await this.update({
      selection: `Élément ${node.nodeName} · cadre ${this.selectedFrame}`,
      detail: JSON.stringify(result.value, null, 2),
    });
    await this.flows();
  }
  async action(payload: string) {
    const { action, value } = JSON.parse(payload);
    if (action === "navigate") await this.cdp.send("Page.navigate", { url: validURL(value) }, this.mainSession);
    else if (action === "inspect") {
      for (const [session, target] of this.targets)
        if (["page", "iframe"].includes(target.type))
          await this.cdp.send(
            "Overlay.setInspectMode",
            {
              mode: "searchForNode",
              highlightConfig: { showInfo: true, contentColor: { r: 65, g: 160, b: 255, a: 0.3 } },
            },
            session,
          );
    } else if (action === "all") {
      this.selectedFrame = undefined;
      this.selectedSession = undefined;
      await this.update({ selection: "Tous les cadres" });
      await this.flows();
    } else if (action === "request") await this.update({ detail: JSON.stringify(this.requests.get(value), null, 2) });
    else if (action === "export") await this.export();
    else if (action === "quit") {
      await this.export();
      this.stop.resolve();
    }
  }
  async body(sessionId: string, requestId: string) {
    const record = this.requests.get(`${sessionId}:${requestId}`);
    if (!record) return;
    try {
      const result = await this.cdp.send<{ body: string; base64Encoded: boolean }>(
        "Network.getResponseBody",
        { requestId },
        sessionId,
      );
      const extension = /javascript/.test(record.response?.mimeType ?? "")
        ? "js"
        : /css/.test(record.response?.mimeType ?? "")
          ? "css"
          : /html/.test(record.response?.mimeType ?? "")
            ? "html"
            : "body";
      const filename = `resources/${Bun.hash(`${sessionId}:${requestId}`).toString(16)}.${extension}`;
      await Bun.write(
        join(this.directory, filename),
        result.base64Encoded ? Buffer.from(result.body, "base64") : result.body,
      );
      record.bodyFile = filename;
    } catch (error) {
      record.bodyError = String(error);
    }
  }
  event(method: string, params: RecordJSON, sessionId: string) {
    this.sink.write(JSON.stringify({ method, params, sessionId, receivedAt: new Date().toISOString() }) + "\n");
    this.eventCount++;
    const key = `${sessionId}:${params.requestId}`;
    if (method === "Network.requestWillBeSent") {
      const prior = this.requests.get(key);
      if (prior && params.redirectResponse)
        this.requests.set(`${key}:redirect:${this.eventCount}`, {
          ...prior,
          response: params.redirectResponse,
          finished: true,
        });
      this.requests.set(key, {
        sessionId,
        requestId: params.requestId,
        frameId: params.frameId,
        request: params.request,
        initiator: params.initiator,
      });
    } else if (method === "Network.responseReceived") {
      const record = this.requests.get(key);
      if (record) record.response = { ...params.response, type: params.type };
      this.run(this.flows());
    } else if (method === "Network.loadingFinished") {
      const record = this.requests.get(key);
      if (record) record.finished = true;
      const job = this.body(sessionId, params.requestId);
      this.bodies.add(job);
      void job.finally(() => this.bodies.delete(job));
      this.run(job);
    } else if (method === "Network.loadingFailed") {
      const record = this.requests.get(key);
      if (record) {
        record.finished = true;
        record.bodyError = params.errorText;
      }
    }
  }
  export() {
    return (this.exportJob ??= this.writeExport().finally(() => {
      this.exportJob = undefined;
    }));
  }
  async writeExport() {
    await Promise.allSettled(this.bodies);
    await this.sink.flush();
    const cookies = await this.cdp.send<CookieExport>("Storage.getCookies");
    await Bun.write(join(this.directory, "cookies.json"), JSON.stringify(cookies, null, 2));
    const { result } = await this.cdp.send<RecordJSON>(
      "Runtime.evaluate",
      { expression: "document.documentElement.outerHTML", returnByValue: true },
      this.mainSession,
    );
    await Bun.write(join(this.directory, "site.html"), result.value);
    const { data } = await this.cdp.send<{ data: string }>(
      "Page.captureSnapshot",
      { format: "mhtml" },
      this.mainSession,
    );
    await Bun.write(join(this.directory, "site.mhtml"), data);
    await this.networkJSON();
    await this.update({ status: `Export privé : ${this.directory}`, cookies: JSON.stringify(cookies, null, 2) });
    return cookies;
  }
  async networkJSON() {
    await this.sink.flush();
    const input = Bun.file(join(this.directory, "network.ndjson"));
    const snapshot = input.slice(0, input.size);
    const output = Bun.file(join(this.directory, "network.json")).writer();
    output.write('{"format":"cdp-network-v1","events":[');
    let carry = "",
      first = true;
    const decoder = new TextDecoder();
    for await (const chunk of snapshot.stream()) {
      carry += decoder.decode(chunk, { stream: true });
      const lines = carry.split("\n");
      carry = lines.pop()!;
      for (const line of lines)
        if (line) {
          output.write((first ? "" : ",") + line);
          first = false;
        }
    }
    output.write(
      '],"requests":' + JSON.stringify([...this.requests.values()]) + ',"errors":' + JSON.stringify(this.errors) + "}",
    );
    await output.end();
  }
}

async function main() {
  const args = Bun.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "network-window.exe [URL] [--browser chemin.exe]\nExports privés : ~/.aphrody/cookies/network-window/<session>\nSélection CDP, cookies JSON, réseau JSON brut, corps JS/CSS/HTML et MHTML.",
    );
    return;
  }
  if (process.platform !== "win32") throw new Error("Cette application nécessite Windows natif.");
  const home = Bun.env.APHRODY_HOME ?? join(Bun.env.USERPROFILE!, ".aphrody");
  const directory = join(
    home,
    "cookies",
    "network-window",
    `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${crypto.randomUUID()}`,
  );
  await new Promise<void>((ok, fail) =>
    mkdir(join(directory, "resources"), { recursive: true }, e => (e ? fail(e) : ok())),
  );
  const profile = join(directory, "profile");
  await new Promise<void>((ok, fail) => mkdir(profile, { recursive: true }, e => (e ? fail(e) : ok())));
  const browserIndex = args.indexOf("--browser");
  const candidates = [
    join(Bun.env.PROGRAMFILES ?? "C:/Program Files", "Google/Chrome/Application/chrome.exe"),
    join(Bun.env["PROGRAMFILES(X86)"] ?? "C:/Program Files (x86)", "Microsoft/Edge/Application/msedge.exe"),
  ];
  let executable = browserIndex >= 0 ? resolve(args[browserIndex + 1]!) : null;
  for (const candidate of candidates) if (!executable && (await Bun.file(candidate).exists())) executable = candidate;
  executable ??= findExecutable();
  if (!executable) throw new Error("Chrome/Edge introuvable ; utiliser --browser chemin.exe.");
  let url = validURL(
    args.find((arg, index) => !arg.startsWith("--") && !(browserIndex >= 0 && index === browserIndex + 1)) ??
      "https://example.com",
  );
  const selfTest = args.includes("--self-test");
  const fixture = selfTest
    ? Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch(request) {
          const path = new URL(request.url).pathname;
          if (path === "/site.js")
            return new Response("fetch('/stream.m3u8')", { headers: { "content-type": "application/javascript" } });
          if (path === "/site.css")
            return new Response("body{background:#eceff4}", { headers: { "content-type": "text/css" } });
          if (path === "/stream.m3u8")
            return new Response("#EXTM3U\n#EXT-X-ENDLIST\n", {
              headers: { "content-type": "application/vnd.apple.mpegurl" },
            });
          return new Response(
            '<!doctype html><title>Bun Inspector fixture</title><link rel="stylesheet" href="/site.css"><video id="player" controls></video><script src="/site.js"></script>',
            { headers: { "content-type": "text/html", "set-cookie": "fixture=pass; Path=/; HttpOnly; SameSite=Lax" } },
          );
        },
      })
    : undefined;
  if (fixture) url = fixture.url.href;
  using job = new Job({ killOnClose: true });
  const child = Bun.spawn(
    [
      executable,
      `--user-data-dir=${profile}`,
      "--remote-debugging-port=0",
      "--remote-debugging-address=127.0.0.1",
      "--no-first-run",
      "--no-default-browser-check",
      "--app=about:blank",
    ],
    { stdin: "ignore", stdout: "ignore", stderr: "pipe" },
  );
  job.assign(child);
  let cdp: ChromiumConnection | undefined;
  let inspector: Inspector | undefined;
  try {
    const endpoint = await waitEndpoint(child);
    cdp = await connect(endpoint);
    inspector = new Inspector(cdp, directory);
    const { targetInfos } = await cdp.send<{ targetInfos: RecordJSON[] }>("Target.getTargets");
    const target = targetInfos.find(t => t.type === "page");
    if (!target) throw new Error("Fenêtre Chrome absente.");
    const { sessionId } = await cdp.send<{ sessionId: string }>("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: true,
    });
    inspector.mainSession = sessionId;
    inspector.mainTarget = target.targetId;
    const app = inspector;
    cdp.on("Runtime.executionContextCreated", (p, s) => {
      const context = p.context as RecordJSON;
      if (context.name === "bun-inspector" && s) app.contexts.set(s, context.id);
    });
    cdp.on("Runtime.executionContextsCleared", (_p, s) => {
      if (s) app.contexts.delete(s);
    });
    cdp.on("Runtime.bindingCalled", (p, s) => {
      if (s === app.mainSession && p.executionContextId === app.contexts.get(s)) app.run(app.action(String(p.payload)));
    });
    cdp.on("Overlay.inspectNodeRequested", (p, s) => {
      if (s) app.run(app.select(s, Number(p.backendNodeId)));
    });
    cdp.on("Target.attachedToTarget", p => {
      app.run(app.session(String(p.sessionId), p.targetInfo as RecordJSON));
    });
    cdp.on("Target.detachedFromTarget", p => {
      app.targets.delete(String(p.sessionId));
    });
    cdp.on("Target.targetDestroyed", p => {
      if (p.targetId === app.mainTarget) app.stop.resolve();
    });
    const protocolURL = new URL(endpoint);
    protocolURL.protocol = "http:";
    protocolURL.pathname = "/json/protocol";
    const protocolResponse = await fetch(protocolURL, { signal: AbortSignal.timeout(10000) });
    if (!protocolResponse.ok) throw new Error("Chrome n'a pas fourni son schéma CDP.");
    const protocol = (await protocolResponse.json()) as { domains: { domain: string; events?: { name: string }[] }[] };
    const events = protocol.domains.find(d => d.domain === "Network")?.events;
    if (!events) throw new Error("Schéma Network absent.");
    for (const event of events)
      cdp.on(`Network.${event.name}`, (p, s) => {
        if (s) app.event(`Network.${event.name}`, p, s);
      });
    await cdp.send("Target.setDiscoverTargets", { discover: true });
    await app.session(sessionId, target);
    const loaded = Promise.withResolvers<void>();
    const cancelLoad = cdp.on("Page.loadEventFired", (_p, s) => {
      if (s === sessionId) loaded.resolve();
    });
    await cdp.send("Page.navigate", { url }, sessionId);
    console.log(`Fenêtre ouverte. Exports privés : ${directory}`);
    if (selfTest) {
      let loadTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          loaded.promise,
          new Promise<never>((_, reject) => {
            loadTimer = setTimeout(() => reject(new Error("Fixture load timed out")), 15000);
          }),
        ]);
      } finally {
        clearTimeout(loadTimer);
        cancelLoad();
      }
      const { root } = await cdp.send<RecordJSON>("DOM.getDocument", {}, sessionId);
      const { nodeId } = await cdp.send<RecordJSON>(
        "DOM.querySelector",
        { nodeId: root.nodeId, selector: "#player" },
        sessionId,
      );
      const { node } = await cdp.send<RecordJSON>("DOM.describeNode", { nodeId }, sessionId);
      await app.select(sessionId, node.backendNodeId);
      await cdp.send(
        "Runtime.evaluate",
        { expression: `fetch('/stream.m3u8').then(r=>r.text())`, awaitPromise: true },
        sessionId,
      );
      const cookies = await app.export();
      if (!cookies.cookies.some((c: RecordJSON) => c.name === "fixture" && c.httpOnly))
        throw new Error("HttpOnly cookie capture failed");
      const requests = [...app.requests.values()];
      if (!requests.some(r => r.request.url.endsWith("/stream.m3u8") && mediaCandidate(r) && r.bodyFile))
        throw new Error("Manifest response capture failed");
      if (!requests.some(r => r.bodyFile?.endsWith(".js")) || !requests.some(r => r.bodyFile?.endsWith(".css")))
        throw new Error("JS/CSS capture failed");
      const network = await Bun.file(join(directory, "network.json")).json();
      if (!network.events.length || !app.selectedFrame) throw new Error("Network/DOM selection capture failed");
      const contextId = app.contexts.get(sessionId);
      const { result: panel } = await cdp.send<RecordJSON>(
        "Runtime.evaluate",
        { contextId, expression: "typeof bunInspectorUpdate", returnByValue: true },
        sessionId,
      );
      if (panel.value !== "function" || app.errors.length) throw new Error("Inspector panel initialization failed");
      await cdp.send(
        "Overlay.setInspectMode",
        { mode: "searchForNode", highlightConfig: { showInfo: true } },
        sessionId,
      );
      await cdp.send("Overlay.setInspectMode", { mode: "none", highlightConfig: {} }, sessionId);
      const { data } = await cdp.send<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
      await Bun.write(join(directory, "preview.png"), Buffer.from(data, "base64"));
      console.log(
        JSON.stringify({
          selfTest: "PASS",
          requests: requests.length,
          events: network.events.length,
          output: directory,
        }),
      );
    } else {
      cancelLoad();
      await Promise.race([app.stop.promise, child.exited]);
    }
  } finally {
    if (inspector) {
      await Promise.allSettled(inspector.bodies);
      await inspector.networkJSON();
      await inspector.sink.end();
    }
    cdp?.close();
    job.terminate();
    await child.exited;
    fixture?.stop(true);
  }
}

if (import.meta.main) await main();
