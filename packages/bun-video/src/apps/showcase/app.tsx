import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ShowcaseManifest, ShowcaseWork } from "./collection";
import "./style.css";

const engines = ["Tout", "Remotion", "HyperFrames", "FilmCraft", "Natif"] as const;
const engineId = ["all", "remotion", "hyperframes", "filmcraft", "native"];
function App() {
  const [manifest, setManifest] = useState<ShowcaseManifest>();
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ShowcaseWork>();
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const modal = useRef<HTMLDialogElement>(null);
  const preview = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/showcase.json", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(`Catalogue indisponible (${response.status})`);
      setManifest(await response.json());
    }).catch(reason => { if (!controller.signal.aborted) setError(String(reason)); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!playing || !selected) return;
    const started = performance.now(), start = frame;
    let request = 0;
    const tick = (time: number) => {
      setFrame((start + Math.floor((time - started) * selected.fps.num / selected.fps.den / 1000)) % selected.durationFrames);
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    const pause = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener("visibilitychange", pause);
    return () => { cancelAnimationFrame(request); document.removeEventListener("visibilitychange", pause); };
  }, [playing, selected]);
  useEffect(() => { preview.current?.contentWindow?.postMessage({ type: "showcase-seek", frame }, location.origin); }, [frame]);
  const open = (work: ShowcaseWork) => { setSelected(work); setFrame(0); setPlaying(false); modal.current?.showModal(); };
  const close = () => { setPlaying(false); modal.current?.close(); };
  const works = manifest?.works.filter(work => (filter === "all" || work.engine === filter) && `${work.title} ${work.features.join(" ")}`.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr"))) ?? [];
  const hero = manifest?.works.find(work => work.id === "remotion-orbital");
  return <>
    <a className="skip" href="#creations">Aller aux créations</a>
    <header><a className="wordmark" href="/">Bun Video</a><nav aria-label="Navigation principale"><a href="#creations">Créations</a><a href="#moteurs">Moteurs</a><a href="#preuves">Preuves</a></nav></header>
    <main>
      <section className="hero"><div><h1>Le mouvement,<br/>sous toutes ses formes.</h1><p>Des compositions originales. Des médias réels. Des résultats vérifiables.</p><div className="actions"><a className="primary" href="#creations">Explorer les créations <span aria-hidden="true">→</span></a><a className="button" href="#preuves">Voir les preuves</a></div></div><button className="hero-art" onClick={() => hero && open(hero)} aria-label="Ouvrir Orbital">{hero?.poster && <img src={`/${hero.poster}`} width="1280" height="720" alt="Trajectoires lumineuses autour d’une sphère bleue" fetchPriority="high"/>}<span>Orbital · ouvrir la composition <span aria-hidden="true">↗</span></span></button></section>
      <section id="creations" className="collection">
        <div className="tools"><div className="filters" role="group" aria-label="Filtrer par moteur">{engines.map((name, i) => <button key={name} aria-pressed={filter === engineId[i]} onClick={() => setFilter(engineId[i]!)}>{name}</button>)}</div><label className="search">Rechercher une création<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Titre ou technique"/></label></div>
        <div className="section-heading"><h2>Une collection en mouvement</h2><p role="status">{manifest ? `${works.length} créations affichées` : "Chargement des créations…"}</p></div>
        {error && <p role="alert">{error} <button onClick={() => location.reload()}>Réessayer</button></p>}
        {manifest && !works.length && <p>Aucune création ne correspond à ce filtre. <button onClick={() => { setFilter("all"); setQuery(""); }}>Afficher toute la collection</button></p>}
        <div className="works">{works.map(work => <article key={work.id}><button className="art" onClick={() => open(work)} aria-label={`Ouvrir ${work.title}, ${work.engine}`}>{work.poster && <img src={`/${work.poster}`} width={work.width} height={work.height} loading="lazy" alt={work.description}/>}<span className="open" aria-hidden="true">↗</span></button><div className="work-heading"><h3>{work.title}</h3><span>{work.engine}</span></div><p>{work.description}</p><button className="text-button" onClick={() => open(work)}>Ouvrir la création <span aria-hidden="true">→</span></button></article>)}</div>
      </section>
      <section id="moteurs"><div className="section-heading"><h2>Les moteurs, à découvert.</h2><p>Des propriétaires explicites, des capacités distinctes.</p></div><div className="engine-grid"><article><h3>Remotion</h3><p>Compositions React, interpolation, ressorts et cadence déterministe. Les sources sont livrées avec chaque création.</p></article><article><h3>HyperFrames</h3><p>Composition HTML, fenêtre temporelle et timeline GSAP contrôlée image par image.</p></article><article><h3>FilmCraft</h3><p>Décodage natif Rust, conteneurs et accès aux images et au son. Chaque opération conserve son propre résultat.</p></article><article><h3>Bun natif</h3><p>Transformations d’images, lots bornés, GIF, PCM et comparaison RGBA. L’encodage vidéo reste une capacité séparée.</p></article></div><details><summary>Explorer toutes les familles d’API</summary><div className="api-list">{manifest?.apis.map(api => <p key={api.id}><code>{api.id}</code><span>{api.description}</span></p>)}</div></details></section>
      <section id="preuves"><div className="section-heading"><h2>Des résultats à inspecter</h2><a href="/showcase.json" download>Télécharger le manifeste <span aria-hidden="true">↓</span></a></div><p>Chaque résultat indique sa portée. Une capture de composition ne qualifie pas l’encodage vidéo ou la lecture DRM.</p><div className="evidence">{manifest?.evidence.map(item => <details key={item.id}><summary><strong>{item.id}</strong><span className={`status ${item.status}`}>{item.status === "passed" ? "Vérifié" : item.status === "failed" ? "Échec mesuré" : "Indisponible"}</span></summary><p>{item.detail}</p><p className="scope">Portée : {item.scope}</p>{item.measurements && <pre>{JSON.stringify(item.measurements, null, 2)}</pre>}<ul>{item.assets.map(asset => <li key={asset.file}><a href={`/${asset.file}`} download>{asset.file}</a><span>{asset.bytes.toLocaleString("fr")} octets</span><code>{asset.sha256}</code></li>)}</ul></details>)}</div></section>
    </main><footer><a className="wordmark" href="/">Bun Video</a><p>Sources, compositions et résultats dans un même atelier.</p><a href="https://github.com/aphrody-labs/bun/tree/main/packages/bun-video">Code source <span aria-hidden="true">↗</span></a></footer>
    <dialog ref={modal} onClose={() => setPlaying(false)}><div className="dialog-heading"><h2>{selected?.title}</h2><button onClick={close}>Fermer <span aria-hidden="true">×</span></button></div>{selected && <>{selected.preview ? selected.mediaType === "audio" ? <audio controls preload="none" src={`/${selected.preview}`}/> : <img className="native-preview" src={`/${selected.preview}`} width={selected.width} height={selected.height} alt={selected.description}/> : <><iframe key={selected.id} ref={preview} src={`/preview.html?work=${selected.id}`} title={`Composition ${selected.title}`} onLoad={() => preview.current?.contentWindow?.postMessage({ type: "showcase-seek", frame }, location.origin)}/><div className="transport"><button className="primary" onClick={() => setPlaying(value => !value)}>{playing ? "Pause" : "Lire"}</button><label>Image {frame + 1} / {selected.durationFrames}<input type="range" min="0" max={selected.durationFrames - 1} value={frame} onChange={event => { setPlaying(false); setFrame(Number(event.target.value)); }}/></label><output>{(frame * selected.fps.den / selected.fps.num).toFixed(3)} s</output></div></>}<p>{selected.description} · {selected.width} × {selected.height} · {selected.fps.num}/{selected.fps.den} i/s</p><div className="tags">{selected.features.map(feature => <span key={feature}>{feature}</span>)}</div>{!selected.preview && <p><a href={`/sources/${selected.engine === "remotion" ? "remotion.tsx" : "preview.tsx"}`} download>Télécharger la composition</a> · <a href={`/sources/artwork.tsx`} download>Télécharger la scène</a></p>}<p className="scope">Les captures vérifiées et leur portée sont dans le manifeste.</p></>}</dialog>
  </>;
}
createRoot(document.getElementById("root")!).render(<App/>);
