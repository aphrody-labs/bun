// SPDX-License-Identifier: Apache-2.0
import React, { useEffect, useRef, useState } from "react";
import { Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MdIconButton } from "@aphrody/m3-react/wrappers/iconbutton";
import { MdLinearProgress } from "@aphrody/m3-react/wrappers/progress";
import { ApiError, capabilitiesQuery, getJson, worksQuery, type ApiFamily } from "../lib/api";
import { Icon } from "../shell/icons";

const route = getRouteApi("/tools");

const STAGES = [
  { id: "source", scope: "acquisition", title: "Source", blurb: "Fichier, URL, archive, HAR ou compte autorisé : tout média entre par une source vérifiée." },
  { id: "decode", scope: "native", title: "Décoder", blurb: "Le moteur natif en Rust lit, analyse et transforme les images sans FFmpeg ni Deno." },
  { id: "play", scope: "protocol", title: "Lire", blurb: "HLS, DASH, WebCodecs et lecteurs : la lecture respecte chaque protocole." },
  { id: "compose", scope: "render", title: "Composer", blurb: "Remotion, HyperFrames et Material 3 composent, rendent et vérifient image par image." },
  { id: "catalog", scope: "catalog", title: "Cataloguer", blurb: "Chaque source, image et transcription est enregistrée avec ses preuves." },
  { id: "publish", scope: "service", title: "Publier", blurb: "Sites de données, MCP, OAuth et automatisation : le résultat sort du studio." },
] as const;

type Panel = "media" | "probe" | "discover" | "extract" | "webgpu" | "compositions" | "capabilities";
interface Info {
  cli?: string;
  lab?: { href: string; label: string };
  panel?: Panel;
}

/** What a family offers beyond its import: a command, a mounted lab, or a live panel. */
const INFO: Record<string, Info> = {
  watch: { cli: "bun-video watch <fichier-ou-url> --detail balanced", panel: "media" },
  media: { cli: "bun-video media <inspect|extract-frames|extract-audio|gif|remux|cut>", panel: "media" },
  pipeline: { panel: "media" },
  image: { panel: "media" },
  source: { panel: "probe" },
  cache: { panel: "discover" },
  har: { cli: "bun-video har <fichier.har>", panel: "discover" },
  ytdlp: { cli: "bun-video ytdlp <url>", panel: "extract" },
  webgpu: { cli: "bun-video webgpu probe", lab: { href: "/webgpu", label: "Sonde WebGPU" }, panel: "webgpu" },
  remotion: { cli: "bun-video remotion <commande>", panel: "compositions" },
  hyperframes: { cli: "bun-video hyperframes <commande>", panel: "compositions" },
  "render-runtime": { panel: "compositions" },
  capabilities: { cli: "bun-video capabilities", panel: "capabilities" },
  mcp: { cli: "bun-video mcp", panel: "capabilities" },
  hls: { cli: "bun-video hls", lab: { href: "/labs/hls/", label: "Laboratoire HLS" } },
  dash: { cli: "bun-video dash", lab: { href: "/labs/dash/", label: "Laboratoire DASH" } },
  "data-site": { cli: "bun-video site", lab: { href: "/site/", label: "Site de données" } },
  "watch-catalogue": { cli: "bun-video watch --catalogue <dossier> --out <dossier>" },
  "video-verify": { cli: "pipeline.verifyRender({ watchJobId, render })" },
  crunchyroll: { cli: "bun-video crunchyroll <commande>" },
  encode: { cli: "bun-video encode <plan.json> <sortie.mkv>" },
};

/** Package entry points import directly; source-only owners go through the lazy registry. */
const importLine = (family: ApiFamily) =>
  !family.module
    ? undefined
    : family.module.startsWith("@aphrody/")
      ? `import * as api from "${family.module}";`
      : `import { loadVideoAPI } from "@aphrody/bun-video/api";\nconst api = await loadVideoAPI("${family.id}");`;

function Json({ value }: { value: unknown }) {
  return (
    <pre className="json" tabIndex={0}>
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function Run({ path, label }: { path: string; label: string }) {
  const run = useMutation({ mutationFn: () => getJson<unknown>(path) });
  return (
    <div className="panel">
      <button type="button" className="btn filled" disabled={run.isPending} onClick={() => run.mutate()}>
        {label}
      </button>
      {run.isPending && <MdLinearProgress indeterminate aria-label="Exécution" />}
      {run.error && (
        <p className="note error" role="alert">
          {run.error instanceof ApiError ? run.error.message : String(run.error)}
        </p>
      )}
      {run.data !== undefined && <Json value={run.data} />}
    </div>
  );
}

function UrlPanel({ kind }: { kind: "probe" | "discover" | "extract" }) {
  const [value, setValue] = useState("");
  const config = {
    probe: { label: "URL à sonder", path: (v: string) => `/api/probe?url=${encodeURIComponent(v)}`, cta: "Sonder" },
    discover: { label: "URL de départ", path: (v: string) => `/api/discover?seed=${encodeURIComponent(v)}`, cta: "Découvrir les sources" },
    extract: { label: "URL d’un site pris en charge", path: (v: string) => `/api/video/extract?src=${encodeURIComponent(v)}`, cta: "Extraire les métadonnées" },
  }[kind];
  const run = useMutation({ mutationFn: () => getJson<unknown>(config.path(value)) });
  return (
    <form
      className="panel"
      onSubmit={event => {
        event.preventDefault();
        run.mutate();
      }}
    >
      <label className="field">
        <span>{config.label}</span>
        <input type="url" required placeholder="https://" value={value} onChange={event => setValue(event.target.value)} />
        <small>https:// uniquement. Les liens YouTube passent par le lecteur officiel.</small>
      </label>
      <button className="btn filled" type="submit" disabled={run.isPending}>
        {config.cta}
      </button>
      {run.isPending && <MdLinearProgress indeterminate aria-label="Exécution" />}
      {run.error && (
        <p className="note error" role="alert">
          {run.error.message}
        </p>
      )}
      {run.data !== undefined && <Json value={run.data} />}
    </form>
  );
}

function MediaPanel() {
  const works = useQuery(worksQuery);
  const library = (works.data ?? []).filter(work => work.video.startsWith("/media/"));
  return (
    <div className="panel">
      {library.length ? (
        <p className="note">
          {library.length} film{library.length > 1 ? "s" : ""} dans la bibliothèque. Ouvrez-en un dans le lecteur et choisissez l’onglet « Analyse watch ».
        </p>
      ) : (
        <p className="note">Aucun fichier dans la bibliothèque : déposez des vidéos dans le dossier Vidéos du bureau.</p>
      )}
      <div className="actions">
        {library.slice(0, 6).map(work => (
          <Link key={work.id} className="btn tonal" to="/video/watch" search={{ v: work.id }}>
            {work.title}
          </Link>
        ))}
      </div>
    </div>
  );
}

function LivePanel({ id }: { id: string }) {
  const panel = INFO[id]?.panel;
  if (panel === "media") return <MediaPanel />;
  if (panel === "probe" || panel === "discover" || panel === "extract") return <UrlPanel kind={panel} />;
  if (panel === "webgpu") return <Run path="/api/webgpu/probe" label="Sonder WebGPU" />;
  if (panel === "compositions") return <Run path="/api/compositions" label="État des moteurs de composition" />;
  if (panel === "capabilities") return <Run path="/api/capabilities" label="Lire les capacités du serveur" />;
  return null;
}

/** A modal sheet for one module. The native dialog supplies the focus trap and Escape. */
function Sheet({ family, onClose }: { family: ApiFamily | undefined; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => element?.close();
  }, []);
  const info = family ? INFO[family.id] : undefined;
  const stage = STAGES.find(item => item.scope === family?.scope);
  return (
    <dialog ref={dialog} className="sheet" aria-labelledby="sheet-title" onClose={onClose} onClick={event => event.target === dialog.current && dialog.current?.close()}>
      <div className="sheet-body">
        <header>
          <div>
            <p className="eyebrow">{stage ? `${stage.title} · ${family?.scope}` : "Outil"}</p>
            <h2 id="sheet-title">{family?.id ?? "Introuvable"}</h2>
          </div>
          <MdIconButton aria-label="Fermer" onClick={() => dialog.current?.close()}>
            <Icon name="close" />
          </MdIconButton>
        </header>
        {family ? (
          <>
            <p className="lede">{family.description}</p>
            {family.module && (
              <p className="note">
                Module : <code>{family.module}</code>
              </p>
            )}
            {importLine(family) && <pre className="snippet">{importLine(family)}</pre>}
            {info?.cli && (
              <p className="note">
                Ligne de commande : <code>{info.cli}</code>
              </p>
            )}
            {info?.lab && (
              <p>
                <a className="btn tonal" href={info.lab.href}>
                  <Icon name="docs" /> {info.lab.label}
                </a>
              </p>
            )}
            <LivePanel id={family.id} />
            {!info?.panel && !info?.lab && <p className="note">Ce module s’utilise depuis le code ou la ligne de commande ; il n’expose pas de surface HTTP.</p>}
          </>
        ) : (
          <p>Aucune famille ne porte ce nom.</p>
        )}
      </div>
    </dialog>
  );
}

export function ToolsPage() {
  const capabilities = useQuery(capabilitiesQuery);
  const { f } = route.useSearch();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "/" && !(document.activeElement instanceof HTMLInputElement) && !document.querySelector("dialog[open]")) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const families = capabilities.data?.apiFamilies ?? [];
  const needle = filter.trim().toLowerCase();
  return (
    <section className="page" aria-labelledby="tools-title">
      <header className="page-head">
        <p className="eyebrow">{families.length ? `${families.length} modules` : "Modules"}</p>
        <h1 id="tools-title">Tous les outils de Bun Video</h1>
        <p className="lede">Natif en Rust, protocoles, composition, catalogue, publication. Appuyez sur « / » pour filtrer.</p>
      </header>
      <label className="search wide">
        <Icon name="search" />
        <span className="sr-only">Filtrer les outils</span>
        <input ref={input} type="search" value={filter} onChange={event => setFilter(event.target.value)} placeholder="watch, hls, remotion, catalogue…" />
      </label>
      {capabilities.isPending && <MdLinearProgress indeterminate aria-label="Chargement des modules" />}
      {capabilities.isError && (
        <p className="note error" role="alert">
          {capabilities.error instanceof ApiError && capabilities.error.status === 403 ? capabilities.error.message : "Les modules ne sont pas disponibles : le serveur n’a pas répondu."}
        </p>
      )}
      {STAGES.map(stage => {
        const items = families.filter(family => family.scope === stage.scope && (!needle || `${family.id} ${family.description}`.toLowerCase().includes(needle)));
        return items.length ? (
          <section key={stage.id} className="tool-group" aria-labelledby={`group-${stage.id}`}>
            <h2 id={`group-${stage.id}`}>
              {stage.title} <small>{items.length}</small>
            </h2>
            <p>{stage.blurb}</p>
            <ul className="nodes">
              {items.map(family => (
                <li key={family.id}>
                  <Link className="node" to="/tools" search={{ f: family.id }}>
                    <b>{family.id}</b>
                    <small>{family.description}</small>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null;
      })}
      {f && <Sheet key={f} family={families.find(family => family.id === f)} onClose={() => void navigate({ to: "/tools", search: {} })} />}
    </section>
  );
}
