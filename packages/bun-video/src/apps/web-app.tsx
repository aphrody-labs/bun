// SPDX-License-Identifier: Apache-2.0
import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { VideoStudio, type StudioAsset } from "../studio";

type Section = "library" | "episode" | "data" | "labs" | "shortcuts" | "compositions";

interface Health {
  readonly status: string;
  readonly video: { readonly available: boolean; readonly decoder: string };
}

const sections: ReadonlyArray<{ id: Section; label: string; hint: string }> = [
  { id: "library", label: "Bibliothèque", hint: "Lecture et métadonnées" },
  { id: "episode", label: "Atelier épisode", hint: "Analyse d’images" },
  { id: "data", label: "Données", hint: "Catalogue et exports" },
  { id: "labs", label: "Labs", hint: "DASH et HLS" },
  { id: "shortcuts", label: "Crunchyroll", hint: "PWA et extension" },
  { id: "compositions", label: "Compositions", hint: "Remotion et HyperFrames" },
];

function useSection(): [Section, (section: Section) => void] {
  const read = (): Section => {
    const value = location.hash.slice(1) as Section;
    return sections.some(section => section.id === value) ? value : "library";
  };
  const [current, setCurrent] = useState<Section>(read);
  useEffect(() => {
    const onChange = () => setCurrent(read());
    addEventListener("hashchange", onChange);
    return () => removeEventListener("hashchange", onChange);
  }, []);
  return [current, (section: Section) => (location.hash = section)];
}

function Library() {
  const [assets, setAssets] = useState<StudioAsset[]>([]);
  const [error, setError] = useState<string>();
  useEffect(() => {
    fetch("/api/video/library", { cache: "no-store" })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{ assets: StudioAsset[] }>;
      })
      .then(body => setAssets(body.assets))
      .catch(() => setError("Bibliothèque indisponible."));
  }, []);
  if (error) return <p role="alert" className="notice">{error}</p>;
  if (assets.length === 0) return <p className="notice">Aucun média dans la racine configurée.</p>;
  return <VideoStudio assets={assets} storageKey="bun-video-web-app" />;
}

function Embedded({ src, title }: { readonly src: string; readonly title: string }) {
  return <iframe className="embedded" src={src} title={title} loading="lazy" />;
}

function Compositions() {
  const [status, setStatus] = useState<string>("Vérification…");
  useEffect(() => {
    fetch("/api/compositions", { cache: "no-store" })
      .then(response => response.json() as Promise<{ remotion: { loaded: boolean }; hyperframes: { loaded: boolean } }>)
      .then(body =>
        setStatus(
          `Remotion : ${body.remotion.loaded ? "chargé" : "indisponible"} · HyperFrames : ${body.hyperframes.loaded ? "chargé" : "indisponible"}`,
        ),
      )
      .catch(() => setStatus("État des compositions indisponible."));
  }, []);
  return <p className="notice">{status}</p>;
}

const views: Record<Section, () => ReactNode> = {
  library: () => <Library />,
  episode: () => <Embedded src="/episode/" title="Atelier épisode" />,
  data: () => <Embedded src="/site/" title="Données vidéo" />,
  labs: () => <Embedded src="/labs/hls/" title="Labs HLS" />,
  shortcuts: () => <Embedded src="/pwa/" title="Crunchyroll" />,
  compositions: () => <Compositions />,
};

function App() {
  const [section, go] = useSection();
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    main.current?.focus();
  }, [section]);
  const [health, setHealth] = useState<Health>();
  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then(response => response.json() as Promise<Health>)
      .then(setHealth)
      .catch(() => setHealth(undefined));
  }, []);
  const current = sections.find(item => item.id === section)!;
  return (
    <div className="shell">
      <a className="skip" href="#content">Aller au contenu</a>
      <nav aria-label="Sections">
        <div className="brand">Bun Video</div>
        <ul>
          {sections.map(item => (
            <li key={item.id}>
              <button
                type="button"
                aria-current={item.id === section ? "page" : undefined}
                onClick={() => go(item.id)}
              >
                <span>{item.label}</span>
                <small>{item.hint}</small>
              </button>
            </li>
          ))}
        </ul>
        <footer role="status" aria-live="polite">
          {health ? (health.video.available ? "Fournisseur vidéo actif" : "Fournisseur vidéo indisponible") : "Hors ligne"}
        </footer>
      </nav>
      <main id="content" tabIndex={-1} ref={main}>
        <header>
          <h1>{current.label}</h1>
          <p>{current.hint}</p>
        </header>
        <section aria-labelledby="page-title">{views[section]()}</section>
      </main>
    </div>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
