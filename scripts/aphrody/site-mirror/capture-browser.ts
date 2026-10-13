import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

type Reply = {
  id?: number;
  result?: Record<string, any>;
  error?: { message: string };
  method?: string;
  params?: Record<string, any>;
};
export async function capturePage(
  endpoint: string,
  url: string,
  output: string,
  width = 1280,
  height = 900,
  dark = false,
) {
  if (!/^ws:\/\/127\.0\.0\.1:\d+\//.test(endpoint)) throw new Error("Use the isolated local Aphrody Web CDP endpoint");
  if (!/^https?:\/\//.test(url)) throw new Error("Only HTTP(S) pages can be captured");
  const socket = new WebSocket(endpoint);
  const pending = new Map<
    number,
    {
      resolve: (value: Record<string, any>) => void;
      reject: (reason: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  let id = 0;
  const network: { event: string; url?: string; status?: number; error?: string }[] = [];
  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve();
    socket.onerror = () => reject(new Error("Native CDP connection failed"));
  });
  socket.onmessage = event => {
    const reply = JSON.parse(String(event.data)) as Reply;
    if (reply.method?.startsWith("Network.") && network.length < 2000) {
      const params = reply.params ?? {};
      const raw = params.request?.url ?? params.response?.url;
      let url: string | undefined;
      try {
        const resource = new URL(raw);
        if (["http:", "https:"].includes(resource.protocol)) url = resource.origin + resource.pathname;
      } catch {}
      if (url || params.errorText)
        network.push({
          event: reply.method,
          ...(url ? { url } : {}),
          ...(typeof params.response?.status === "number" ? { status: params.response.status } : {}),
          ...(params.errorText ? { error: params.errorText } : {}),
        });
    }
    if (!reply.id) return;
    const request = pending.get(reply.id);
    if (!request) return;
    pending.delete(reply.id);
    clearTimeout(request.timer);
    if (reply.error) request.reject(new Error(reply.error.message));
    else request.resolve(reply.result ?? {});
  };
  const command = (method: string, params: Record<string, unknown> = {}, sessionId?: string) =>
    new Promise<Record<string, any>>((resolve, reject) => {
      const current = ++id;
      const timer = setTimeout(() => {
        pending.delete(current);
        reject(new Error(`Native CDP timeout: ${method}`));
      }, 30000);
      pending.set(current, { resolve, reject, timer });
      socket.send(JSON.stringify({ id: current, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  let target: string | undefined;
  try {
    const created = await command("Target.createTarget", { url: "about:blank" });
    target = String(created.targetId);
    const attached = await command("Target.attachToTarget", { targetId: target, flatten: true });
    const session = String(attached.sessionId);
    await command("Network.enable", {}, session);
    await command(
      "Emulation.setDeviceMetricsOverride",
      { width, height, deviceScaleFactor: 1, mobile: width < 600 },
      session,
    );
    await command(
      "Emulation.setEmulatedMedia",
      {
        features: [
          { name: "prefers-color-scheme", value: dark ? "dark" : "light" },
          { name: "prefers-reduced-motion", value: "reduce" },
        ],
      },
      session,
    );
    await command("Page.navigate", { url }, session);
    await command(
      "Runtime.evaluate",
      {
        expression:
          "document.fonts.ready.then(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))",
        awaitPromise: true,
      },
      session,
    );
    const themeState = await command(
      "Runtime.evaluate",
      {
        expression:
          "JSON.stringify({dark:matchMedia('(prefers-color-scheme:dark)').matches,background:getComputedStyle(document.documentElement).backgroundColor})",
        returnByValue: true,
      },
      session,
    );
    const geometry = await command(
      "Runtime.evaluate",
      {
        expression: `JSON.stringify(['.site-header','main','h1','[data-install-link="posix"]','[data-install-link="windows"]','#tab-install'].map(selector=>{const element=document.querySelector(selector);if(!element)return {selector,found:false};const box=element.getBoundingClientRect(),style=getComputedStyle(element);return {selector,found:true,x:box.x,y:box.y,width:box.width,height:box.height,font:style.fontFamily,fontSize:style.fontSize,lineHeight:style.lineHeight}}))`,
        returnByValue: true,
      },
      session,
    );
    const state = await command(
      "Runtime.evaluate",
      {
        expression: `JSON.stringify({url:location.href,title:document.title,readyState:document.readyState,symbolFonts:Array.from(document.fonts).filter(f=>f.family.includes("Symbols")).map(f=>({family:f.family,status:f.status})),symbols:Array.from(document.querySelectorAll(".fusion-symbol")).slice(0,8).map(e=>({name:e.textContent,font:getComputedStyle(e).fontFamily,features:getComputedStyle(e).fontFeatureSettings,width:e.getBoundingClientRect().width})),width:innerWidth,height:innerHeight,links:Array.from(document.querySelectorAll('a[href]')).map(a=>({text:a.textContent.trim().slice(0,160),href:a.href})),buttons:Array.from(document.querySelectorAll('button')).map(b=>({text:b.textContent.trim().slice(0,160),label:b.getAttribute('aria-label')})),scripts:Array.from(document.scripts).filter(s=>s.src).map(s=>s.src),text:document.body.innerText.slice(0,60000)})`,
        returnByValue: true,
      },
      session,
    );
    const screenshot = await command(
      "Page.captureScreenshot",
      { format: "png", captureBeyondViewport: false },
      session,
    );
    const root = resolve(output);
    mkdirSync(root, { recursive: true });
    const bytes = Buffer.from(String(screenshot.data), "base64");
    if (!bytes.length || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
      throw new Error("Native renderer returned no PNG");
    writeFileSync(join(root, "page.png"), bytes);
    const interactions: { selector: string; found: boolean; selected: string | null; visible: string | null }[] = [];
    for (const selector of [
      'button[data-install-link="posix"]',
      'button[data-install-link="windows"]',
      "button#tab-react",
      "button#tab-sqlite",
      "button#tab-install",
    ]) {
      const clicked = await command(
        "Runtime.evaluate",
        {
          expression: `(()=>{const b=document.querySelector(${JSON.stringify(selector)});if(!b)return false;b.click();return true;})()`,
          returnByValue: true,
        },
        session,
      );
      const observed = await command(
        "Runtime.evaluate",
        {
          expression: `(()=>{const b=document.querySelector(${JSON.stringify(selector)});if(!b)return JSON.stringify({found:false,selected:null,visible:null});const panel=b.getAttribute('aria-controls');return JSON.stringify({found:true,selected:b.getAttribute('aria-selected'),visible:panel?document.getElementById(panel)?.getAttribute('aria-hidden'):null});})()`,
          returnByValue: true,
        },
        session,
      );
      interactions.push({
        selector,
        ...(JSON.parse(String(observed.result?.value)) as Omit<(typeof interactions)[number], "selector">),
        found: clicked.result?.value === true,
      });
    }
    const report = {
      url,
      endpointOwner: "aphrody-web launch",
      capturedAt: new Date().toISOString(),
      viewport: { width, height, dark },
      observedTheme: JSON.parse(String(themeState.result?.value)),
      geometry: JSON.parse(String(geometry.result?.value)),
      screenshot: { bytes: bytes.length, sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") },
      snapshot: JSON.parse(String(state.result?.value)),
      interactions,
      network,
      qualification: { nativeRenderer: true, interactiveParity: false, pixelEquality: false },
    };
    const controls = await command(
      "Runtime.evaluate",
      {
        expression: `(()=>{const theme=Array.from(document.querySelectorAll('button')).filter(b=>/theme|dark|light/i.test((b.textContent||'')+' '+(b.getAttribute('aria-label')||'')));const clipboard={writeText:async(value)=>{globalThis.__mirrorCopied=String(value)}};try{Object.defineProperty(navigator,'clipboard',{value:clipboard,configurable:true});const b=Array.from(document.querySelectorAll('button[aria-label="Copy install command"]')).find(e=>e.getBoundingClientRect().width>0);b?.click();}catch(error){globalThis.__mirrorCopyError=String(error)}return JSON.stringify({themeControls:theme.length,copyError:globalThis.__mirrorCopyError||null});})()`,
        returnByValue: true,
      },
      session,
    );
    const copied = await command(
      "Runtime.evaluate",
      { expression: "JSON.stringify({value:globalThis.__mirrorCopied||null})", returnByValue: true },
      session,
    );
    const menus: Record<string, unknown>[] = [];
    for (const label of ["Open menu", "Close menu", "Search"]) {
      const observed = await command(
        "Runtime.evaluate",
        {
          expression: `(()=>{const b=Array.from(document.querySelectorAll('button')).find(e=>e.getAttribute('aria-label')===${JSON.stringify(label)}&&e.getBoundingClientRect().width>0);if(!b)return JSON.stringify({label:${JSON.stringify(label)},found:false});b.click();return JSON.stringify({label:${JSON.stringify(label)},found:true,expanded:b.getAttribute('aria-expanded'),controls:b.getAttribute('aria-controls')});})()`,
          returnByValue: true,
        },
        session,
      );
      menus.push(JSON.parse(String(observed.result?.value)));
    }
    const searchInput = await command(
      "Runtime.evaluate",
      {
        expression: `(()=>{const inputs=Array.from(document.querySelectorAll('input')).filter(e=>e.getBoundingClientRect().width>0);const input=inputs.find(e=>e.type==='search'||/search/i.test(e.placeholder));if(!input)return false;input.value='Bun.serve';input.dispatchEvent(new Event('input',{bubbles:true}));return true})()`,
        returnByValue: true,
      },
      session,
    );
    let searchLinks: { text: string; href: string }[] = [];
    if (searchInput.result?.value === true) {
      const deadline = Date.now() + 2000;
      do {
        const observed = await command(
          "Runtime.evaluate",
          {
            expression: `JSON.stringify(Array.from(document.querySelectorAll('[role="dialog"] a[href],dialog a[href]')).map(a=>({text:a.textContent.trim().slice(0,120),href:a.href})).slice(0,20))`,
            returnByValue: true,
          },
          session,
        );
        searchLinks = JSON.parse(String(observed.result?.value));
        if (searchLinks.length) break;
        await Bun.sleep(25);
      } while (Date.now() < deadline);
    }
    const keyboard = await command(
      "Runtime.evaluate",
      {
        expression: `(()=>{const input=document.querySelector('#fusion-search #q');if(!input)return JSON.stringify({available:false});input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));const selected=document.querySelector('#results .sel')?.getAttribute('href')||null;input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return JSON.stringify({available:true,selected,searchClosed:document.getElementById('fusion-search').hidden,menuClosed:document.getElementById('fusion-menu')?.hidden,expanded:document.querySelector('button[aria-label="Open menu"]')?.getAttribute('aria-expanded')});})()`,
        returnByValue: true,
      },
      session,
    );
    Object.assign(report, {
      keyboard: JSON.parse(String(keyboard.result?.value)),
      controls: JSON.parse(String(controls.result?.value)),
      copyCollector: JSON.parse(String(copied.result?.value)),
      menus,
      search: { query: "Bun.serve", inputFound: searchInput.result?.value === true, links: searchLinks },
    });
    writeFileSync(join(root, "browser-evidence.json"), JSON.stringify(report, null, 2));
    return report;
  } finally {
    if (target) await command("Target.closeTarget", { targetId: target }).catch(() => {});
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error("Capture closed"));
    }
    socket.close();
  }
}
if (import.meta.main) {
  const [url, output, width, height, theme] = process.argv.slice(2);
  if (!url || !output) throw new Error("Usage: capture-browser.ts <url> <output-dir> [width] [height] [light|dark]");
  const report = await capturePage(
    process.env.BUN_MIRROR_CDP_URL ?? "ws://127.0.0.1:9298/devtools/browser",
    url,
    output,
    Number(width ?? 1280),
    Number(height ?? 900),
    theme === "dark",
  );
  console.log(JSON.stringify({ screenshot: report.screenshot, qualification: report.qualification }));
}
