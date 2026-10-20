import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { applyDynamicColor } from "@aphrody/m3-tokens/dynamic-color";
import "@aphrody/m3-tokens/m3-tokens.css";
import type { ShowcaseManifest } from "./collection";
import "./style.css";

type Work = ShowcaseManifest["works"][number];
type YouTubeVideo = {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string | null;
  thumbnail?: string;
};
const asset = (path: string) => {
  if (!path || path.startsWith("/") || path.split(/[\\/]/).includes(".."))
    throw new TypeError("Showcase assets must stay inside the published timeline");
  const url = new URL(path, `${location.origin}/`);
  if (url.origin !== location.origin) throw new TypeError("Showcase assets must be same-origin");
  return url.href;
};

function Film({
  work,
  index,
  count,
  active,
  nearby,
  reduced,
  fullscreen,
  toggleFullscreen,
}: {
  work: Work;
  index: number;
  count: number;
  active: boolean;
  nearby: boolean;
  reduced: boolean;
  fullscreen: boolean;
  toggleFullscreen: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [wantsPlay, setWantsPlay] = useState(!reduced);
  const [running, setRunning] = useState(false);
  const [position, setPosition] = useState(0);
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(!document.hidden);
  const duration = (work.durationFrames * work.fps.den) / work.fps.num;
  const playing = active && visible && wantsPlay;
  useEffect(() => {
    const change = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  useEffect(() => {
    if (reduced) setWantsPlay(false);
  }, [reduced]);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (!playing) {
      element.pause();
      return;
    }
    void element.play().catch(() => {
      setWantsPlay(false);
      setMessage("Appuyez sur Lire pour démarrer la vidéo.");
    });
    return () => element.pause();
  }, [playing, nearby]);
  const seek = (seconds: number) => {
    setPosition(seconds);
    if (video.current) video.current.currentTime = seconds;
  };
  const toggle = () => {
    setMessage("");
    setWantsPlay(value => !value);
  };
  return (
    <section
      className="film"
      data-index={index}
      aria-label={`${index + 1} sur ${count} : ${work.title}`}
      aria-current={active ? "true" : undefined}
    >
      <div className="screen">
        <video
          ref={video}
          src={nearby ? asset(work.video!) : undefined}
          poster={work.poster ? asset(work.poster) : undefined}
          preload={active ? "auto" : nearby ? "metadata" : "none"}
          playsInline
          loop
          muted
          aria-label={work.title}
          onPlay={() => setRunning(true)}
          onPause={() => setRunning(false)}
          onTimeUpdate={event => setPosition(event.currentTarget.currentTime)}
          onError={() => {
            setMessage("Cette vidéo n’a pas pu être chargée.");
            setWantsPlay(false);
          }}
        >
          {work.captions && <track kind="captions" src={asset(work.captions)} srcLang="fr" label="Français" default />}
        </video>
      </div>
      <div className="film-top">
        <span>Aphrody Video</span>
        <span className="chapter">
          {work.chapter ?? work.engine} · {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
        </span>
        <span className="chapter">Bun · vidéo native</span>
      </div>
      <div className="film-bottom">
        <div className="caption">
          <p className="eyebrow">
            {work.engine} / {work.features.slice(0, 3).join(" · ")}
          </p>
          <h1>{work.title}</h1>
          <p>{work.description}</p>
        </div>
        <div className="transport">
          <button onClick={toggle} aria-label={playing && running ? "Mettre en pause" : "Lire"}>
            {playing && running ? "Pause" : "Lire"}
          </button>
          <label className="seek">
            <span className="sr-only">Position dans {work.title}</span>
            <input
              type="range"
              min="0"
              max={Math.max(0, duration - work.fps.den / work.fps.num)}
              step={work.fps.den / work.fps.num}
              value={position}
              onChange={event => {
                setWantsPlay(false);
                seek(Number(event.target.value));
              }}
              aria-valuetext={`${position.toFixed(1)} sur ${duration.toFixed(1)} secondes`}
            />
          </label>
          <output>
            {position.toFixed(1)} / {duration.toFixed(1)} s
          </output>
          <button
            onClick={toggleFullscreen}
            aria-pressed={fullscreen}
            aria-label={fullscreen ? "Quitter le plein écran" : "Plein écran"}
          >
            {fullscreen ? "Quitter" : "Plein écran"}
          </button>
          <details>
            <summary>Source et preuves</summary>
            <div className="provenance">
              <p>{work.sourceRef ?? "packages/bun-video/src/apps/showcase"}</p>
              <p>
                {work.width} × {work.height} · {work.fps.num}/{work.fps.den} i/s
              </p>
              <p>
                {work.evidence.length
                  ? work.evidence.join(" · ")
                  : "Aucune qualification associée à cette composition."}
              </p>
              {work.code && (
                <pre>
                  <code>{work.code}</code>
                </pre>
              )}
              <a href="/showcase.json">Manifeste des résultats</a>
            </div>
          </details>
        </div>
        {message && (
          <p className="playback-status" role="status">
            {message}
          </p>
        )}
        <span className="scroll-hint">
          {index < count - 1 ? "Défiler pour la vidéo suivante ↓" : "Fin de la timeline"}
        </span>
      </div>
    </section>
  );
}

function Discover({ manifest }: { manifest: ShowcaseManifest }) {
  const [query, setQuery] = useState(new URLSearchParams(location.search).get("q") ?? "");
  const [searchSource, setSearchSource] = useState<"Aphrody" | "YouTube">("Aphrody");
  const [youtubeResults, setYoutubeResults] = useState<YouTubeVideo[]>([]);
  const [youtubeError, setYoutubeError] = useState("");
  const [youtubeBusy, setYoutubeBusy] = useState(false);
  const [youtubeSelected, setYoutubeSelected] = useState<YouTubeVideo | null>(null);
  const [filter, setFilter] = useState("Tout voir");
  const [selected, setSelected] = useState<Work | null>(() =>
    location.pathname === "/watch"
      ? (manifest.works.find(work => work.id === new URLSearchParams(location.search).get("v")) ?? null)
      : null,
  );
  const [saved, setSaved] = useState<string[]>(() => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem("aphrody-video:saved:v1") ?? "[]");
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    const restore = () =>
      setSelected(
        location.pathname === "/watch"
          ? (manifest.works.find(work => work.id === new URLSearchParams(location.search).get("v")) ?? null)
          : null,
      );
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [manifest]);
  const filters = ["Tout voir", "Remotion", "HyperFrames", "FilmCraft", "Bun.Image", "Material 3"];
  const works = manifest.works.filter(work => {
    const filterText = `${work.engine} ${work.features.join(" ")} ${work.chapter ?? ""}`.toLowerCase();
    const selectedFilter = filter === "Tout voir" || filterText.includes(filter.toLowerCase());
    const search = `${work.title} ${work.description} ${work.engine} ${work.features.join(" ")}`.toLowerCase();
    return (
      selectedFilter &&
      (!query || search.includes(query.toLowerCase())) &&
      (location.pathname !== "/playlist/saved" || saved.includes(work.id))
    );
  });
  const open = (work: Work) => {
    setSelected(work);
    history.pushState({}, "", `/watch?v=${encodeURIComponent(work.id)}`);
  };
  const close = () => {
    setSelected(null);
    history.pushState({}, "", query ? `/?q=${encodeURIComponent(query)}` : "/");
  };
  const toggleSaved = (id: string) =>
    setSaved(old => {
      const next = old.includes(id) ? old.filter(item => item !== id) : [...old, id];
      localStorage.setItem("aphrody-video:saved:v1", JSON.stringify(next));
      return next;
    });
  const seconds = (work: Work) => (work.durationFrames * work.fps.den) / work.fps.num;
  const stamp = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
  const view =
    location.pathname === "/studio"
      ? "studio"
      : location.pathname === "/about"
        ? "about"
        : location.pathname === "/playlist/saved"
          ? "saved"
          : "discover";
  return (
    <div className="video-app">
      <header className="video-header">
        <a className="video-brand" href="/" aria-label="Aphrody Video, accueil">
          <span className="brand-icon">B</span>
          <strong>
            aphrody<span>video</span>
          </strong>
          <small>{manifest.works.length} FILMS</small>
        </a>
        <form
          className="video-search"
          onSubmit={event => {
            event.preventDefault();
            history.pushState({}, "", `/?q=${encodeURIComponent(query)}`);
            setYoutubeSelected(null);
            setYoutubeError("");
            if (searchSource === "YouTube" && query.trim().length >= 2) {
              setYoutubeBusy(true);
              fetch(`/api/youtube/search?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" })
                .then(async response => {
                  const result = await response.json();
                  if (!response.ok) throw new Error(result.error === "youtube_search_unavailable"
                    ? "Recherche YouTube non configurée sur ce déploiement."
                    : "La recherche YouTube est momentanément indisponible.");
                  setYoutubeResults(result.videos);
                })
                .catch(error => setYoutubeError(String(error instanceof Error ? error.message : error)))
                .finally(() => setYoutubeBusy(false));
            }
          }}
        >
          <label className="sr-only" htmlFor="video-search">
            Rechercher dans le catalogue
          </label>
          <input
            id="video-search"
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Rechercher une vidéo, un moteur…"
          />
          <button aria-label="Rechercher" type="submit">
            ⌕
          </button>
          <button
            className="search-source"
            type="button"
            aria-label={`Source de recherche : ${searchSource}`}
            aria-pressed={searchSource === "YouTube"}
            onClick={() => setSearchSource(value => value === "Aphrody" ? "YouTube" : "Aphrody")}
          >
            {searchSource === "Aphrody" ? "Bun" : "▶ YouTube"}
          </button>
        </form>
        <a className="create-link" href="/studio">
          <span>＋</span> Créer
        </a>
      </header>
      <aside className="video-sidebar" aria-label="Navigation">
        <nav>
          <a href="/" className={view === "discover" ? "nav-active" : ""}>
            <b>⌂</b> Découvrir
          </a>
          <a href="/shorts">
            <b>▣</b> Shorts
          </a>
          <a href="/playlist/saved" className={view === "saved" ? "nav-active" : ""}>
            <b>♡</b> À regarder{saved.length ? ` · ${saved.length}` : ""}
          </a>
          <div className="side-divider" />
          <label>STUDIO BUN</label>
          <a href="/studio" className={view === "studio" ? "nav-active" : ""}>
            <b>✳</b> Pipeline créative
          </a>
          <a href="/about" className={view === "about" ? "nav-active" : ""}>
            <b>◉</b> À propos
          </a>
        </nav>
        <div className="sidebar-foot">
          <span className="mini-mark">B</span>
          <span>
            <strong>Propulsé par Bun</strong>
            <small>FilmCraft · Remotion · HyperFrames</small>
          </span>
        </div>
      </aside>
      <main className="video-main">
        {youtubeSelected ? (
          <div className="watch-page youtube-watch">
            <button className="watch-back" onClick={() => setYoutubeSelected(null)}>← Retour aux résultats YouTube</button>
            <div className="watch-columns">
              <section className="watch-primary">
                <div className="watch-player">
                  <iframe
                    title={youtubeSelected.title}
                    src={`https://www.youtube-nocookie.com/embed/${youtubeSelected.id}?playsinline=1&rel=0`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </div>
                <div className="watch-meta">
                  <span>YouTube · {youtubeSelected.channelTitle}</span>
                  <h1>{youtubeSelected.title}</h1>
                  <p>{youtubeSelected.description}</p>
                  <a href={`https://www.youtube.com/watch?v=${youtubeSelected.id}`} target="_blank" rel="noreferrer">Voir sur YouTube ↗</a>
                </div>
              </section>
            </div>
          </div>
        ) : selected ? (
          <div className="watch-page">
            <button className="watch-back" onClick={close}>
              ← Retour au catalogue
            </button>
            <div className="watch-columns">
              <section className="watch-primary">
                <div className="watch-player">
                  <video
                    key={selected.id}
                    src={asset(selected.video!)}
                    poster={selected.poster ? asset(selected.poster) : undefined}
                    controls
                    playsInline
                    autoPlay
                    preload="auto"
                    aria-label={selected.title}
                  >
                    {selected.captions && (
                      <track kind="captions" src={asset(selected.captions)} srcLang="fr" label="Français" default />
                    )}
                  </video>
                </div>
                <div className="watch-meta">
                  <span>
                    {selected.engine} · {selected.chapter ?? "Démonstration Bun Video"} · {stamp(seconds(selected))}
                  </span>
                  <h1>{selected.title}</h1>
                  <p>{selected.description}</p>
                  <div className="watch-buttons">
                    <b>
                      Aphrody <small>Le média, côté Bun</small>
                    </b>
                    <button onClick={() => toggleSaved(selected.id)} aria-pressed={saved.includes(selected.id)}>
                      {saved.includes(selected.id) ? "♥ Enregistré" : "♡ Enregistrer"}
                    </button>
                    <button onClick={() => navigator.clipboard?.writeText(location.href)}>↗ Partager</button>
                    <a href={`/shorts?v=${encodeURIComponent(selected.id)}`}>Plein écran · Shorts ↗</a>
                  </div>
                </div>
                <details className="work-proof">
                  <summary>Voir la source et les preuves</summary>
                  <p>
                    {selected.width} × {selected.height} · {selected.fps.num}/{selected.fps.den} i/s ·{" "}
                    {selected.features.join(" · ")}
                  </p>
                  <p>{selected.sourceRef ?? "packages/bun-video/src/apps/showcase"}</p>
                  <p>{selected.evidence.join(" · ") || "Aucune preuve associée."}</p>
                  {selected.code && <pre>{selected.code}</pre>}
                </details>
              </section>
              <aside className="watch-related">
                <h2>À suivre</h2>
                {manifest.works
                  .filter(work => work.id !== selected.id)
                  .slice(0, 7)
                  .map(work => (
                    <button key={work.id} onClick={() => open(work)} className="related-video">
                      <span>
                        {(work.poster ?? work.preview) && <img src={asset((work.poster ?? work.preview)!)} alt="" />}
                        <i>{stamp(seconds(work))}</i>
                      </span>
                      <b>
                        {work.title}
                        <small>Aphrody · {work.engine}</small>
                        <small>{work.chapter ?? work.features.slice(0, 2).join(" · ")}</small>
                      </b>
                    </button>
                  ))}
              </aside>
            </div>
          </div>
        ) : view === "studio" || view === "about" ? (
          <section className="studio-page">
            <p className="kicker">{view === "studio" ? "BUN VIDEO / WORKSPACE" : "APHRODY × BUN"}</p>
            <h1>
              {view === "studio" ? (
                <>
                  Une source.
                  <br />
                  <em>Tout un studio.</em>
                </>
              ) : (
                <>
                  Le runtime
                  <br />
                  <em>devient studio.</em>
                </>
              )}
            </h1>
            <p className="studio-intro">
              Un pipeline pour comprendre, éditer, composer et publier la vidéo — du décodage natif aux scènes Remotion
              et HyperFrames.
            </p>
            <div className="pipeline-row">
              {[
                ["01", "Source", "Fichier · URL · HLS · DASH"],
                ["02", "Lire", "Bun.Video · MediaBunny · lecteurs web"],
                ["03", "Transformer", "FilmCraft · Bun.Image · coupe · audio"],
                ["04", "Composer", "Remotion + HyperFrames · M3"],
                ["05", "Exporter", "MP4 · WebM · MOV · MKV · GIF · HLS"],
              ].map(([number, title, body]) => (
                <article key={number}>
                  <span>{number}</span>
                  <h2>{title}</h2>
                  <p>{body}</p>
                </article>
              ))}
            </div>
            <div className="studio-proof">
              <strong>Une seule pipeline créative. Plusieurs moteurs.</strong>
              <p>
                Formats et codecs disponibles selon la source, le navigateur et le backend qualifié. FilmCraft,
                Bun.Video et Bun.Image partagent le média natif; Remotion et HyperFrames apportent deux moteurs de
                composition.
              </p>
              <a href="/showcase.json">Catalogue de {manifest.works.length} œuvres et preuves →</a>
            </div>
          </section>
        ) : (
          <>
            <section className="video-hero">
              <div>
                <p className="kicker">LE LABORATOIRE VIDÉO DE BUN</p>
                <h1>
                  Chaque frame.
                  <br />
                  <em>Une nouvelle idée.</em>
                </h1>
                <p>Des films générés avec Remotion, HyperFrames, FilmCraft et les APIs natives de Bun.</p>
                <a href="/studio">
                  Entrer dans le studio <span>→</span>
                </a>
              </div>
              <div className="hero-symbol" aria-hidden="true">
                <i />
                <i />
                <i />
                <b>B</b>
                <small>BUN VIDEO</small>
              </div>
            </section>
            <div className="category-strip" role="group" aria-label="Filtrer les vidéos">
              {filters.map(item => (
                <button
                  key={item}
                  className={filter === item ? "category-current" : ""}
                  onClick={() => setFilter(item)}
                  aria-pressed={filter === item}
                >
                  {item}
                </button>
              ))}
            </div>
            {searchSource === "YouTube" && query.trim().length >= 2 && (
              <section className="catalog-section youtube-results" aria-live="polite">
                <div className="catalog-heading"><div><p className="kicker">SOURCE EXTERNE ATTRIBUÉE</p><h2>Résultats YouTube</h2></div></div>
                {youtubeBusy ? <p>Recherche des vidéos publiques…</p> : youtubeError ? <p role="status">{youtubeError}</p> : (
                  <>
                    <p className="youtube-attribution">Résultats et miniatures fournis par YouTube. Lecture via le lecteur officiel YouTube.</p>
                    <div className="catalog-grid">
                      {youtubeResults.map(video => (
                        <article className="catalog-card" key={video.id}>
                          <button className="catalog-poster" onClick={() => setYoutubeSelected(video)} aria-label={`Lire ${video.title} avec YouTube`}>
                            {video.thumbnail && <img src={video.thumbnail} loading="lazy" alt="" />}
                            <i>▶</i>
                          </button>
                          <div className="catalog-copy"><b><button className="youtube-title" onClick={() => setYoutubeSelected(video)}>{video.title}</button></b><small>YouTube · {video.channelTitle}</small><small>{video.publishedAt ? new Date(video.publishedAt).toLocaleDateString() : ""}</small></div>
                        </article>
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}
            <section className="catalog-section">
              <div className="catalog-heading">
                <div>
                  <p className="kicker">
                    {view === "saved" ? "VOTRE SÉLECTION" : query ? "RECHERCHE" : "LES FILMS DU LAB"}
                  </p>
                  <h2>
                    {view === "saved"
                      ? "À regarder plus tard"
                      : query
                        ? `Résultats pour « ${query} »`
                        : "Une idée. Plusieurs moteurs."}
                  </h2>
                </div>
                <a href="/shorts">Parcourir en Shorts ↗</a>
              </div>
              {works.length ? (
                <div className="catalog-grid">
                  {works.map(work => (
                    <article className="catalog-card" key={work.id}>
                      <button className="catalog-poster" onClick={() => open(work)} aria-label={`Lire ${work.title}`}>
                        {(work.poster ?? work.preview) && (
                          <img src={asset((work.poster ?? work.preview)!)} loading="lazy" alt="" />
                        )}
                        <span>{stamp(seconds(work))}</span>
                        <i>▶</i>
                      </button>
                      <div className="catalog-copy">
                        <b>
                          <a
                            href={`/watch?v=${encodeURIComponent(work.id)}`}
                            onClick={event => {
                              event.preventDefault();
                              open(work);
                            }}
                          >
                            {work.title}
                          </a>
                        </b>
                        <small>Aphrody · {work.engine}</small>
                        <small>
                          {work.chapter ?? work.features.slice(0, 2).join(" · ")} · {work.width} × {work.height}
                        </small>
                        <button
                          className="catalog-save"
                          aria-label={`${saved.includes(work.id) ? "Retirer" : "Enregistrer"} ${work.title}`}
                          aria-pressed={saved.includes(work.id)}
                          onClick={() => toggleSaved(work.id)}
                        >
                          {saved.includes(work.id) ? "♥" : "♡"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="catalog-empty">
                  <b>◌</b>
                  <h3>Aucun film dans cette sélection</h3>
                  <p>Essayez un autre moteur ou une recherche différente.</p>
                  <button
                    onClick={() => {
                      setFilter("Tout voir");
                      setQuery("");
                    }}
                  >
                    Tout explorer
                  </button>
                </div>
              )}
            </section>
            <footer className="video-footer">
              <b>
                <span className="mini-mark">B</span> aphrodyvideo
              </b>
              <span>Un site. Une pipeline. Des possibilités infinies.</span>
              <a href="/showcase.json">Manifeste & preuves</a>
              <small>Bun {manifest.runtime.version}</small>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

function App() {
  const [manifest, setManifest] = useState<ShowcaseManifest>();
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const feed = useRef<HTMLElement>(null);
  useEffect(() => {
    // Canonical Bun M3 token generator; no separate showcase palette.
    applyDynamicColor("#f4722b", { dark: true });
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(preference.matches);
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/showcase.json", { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(`Catalogue indisponible (${response.status})`);
        const data: ShowcaseManifest = await response.json();
        if (
          data.schema !== "bun-video/showcase/v1" ||
          !Array.isArray(data.works) ||
          data.works.some(work => typeof work.video !== "string" || !work.video || work.video.startsWith("/"))
        )
          throw new Error("La timeline n’accepte que des vidéos réellement rendues et publiées.");
        setManifest(data);
      })
      .catch(reason => {
        if (!controller.signal.aborted) setError(String(reason));
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!manifest || !feed.current || !location.pathname.startsWith("/shorts")) return;
    const workId = new URLSearchParams(location.search).get("v");
    const initial = workId ? manifest.works.findIndex(work => work.id === workId) : 0;
    if (initial >= 0) setActive(initial);
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries)
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6)
            setActive(Number((entry.target as HTMLElement).dataset.index));
      },
      { root: feed.current, threshold: [0.6] },
    );
    for (const film of feed.current.querySelectorAll(".film")) observer.observe(film);
    return () => observer.disconnect();
  }, [manifest]);
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === feed.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void feed.current?.requestFullscreen();
  };
  const page = (event: React.KeyboardEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button, a, input, audio, summary, iframe")) return;
    if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      toggleFullscreen();
      return;
    }
    const direction =
      event.key === "ArrowDown" || event.key === "PageDown"
        ? 1
        : event.key === "ArrowUp" || event.key === "PageUp"
          ? -1
          : 0;
    if (!direction || !manifest) return;
    event.preventDefault();
    feed.current
      ?.querySelectorAll<HTMLElement>(".film")
      [Math.max(0, Math.min(manifest.works.length - 1, active + direction))]?.scrollIntoView({
        behavior: reduced ? "instant" : "smooth",
        block: "start",
      });
  };
  if (manifest && !location.pathname.startsWith("/shorts")) return <Discover manifest={manifest} />;
  return (
    <main ref={feed} className="timeline" aria-label="Timeline des vidéos Aphrody" tabIndex={0} onKeyDown={page}>
      {!manifest && (
        <div className="empty" role={error ? "alert" : "status"}>
          <h1>Aphrody Video</h1>
          <p>{error || "Chargement de la timeline…"}</p>
          {error && <button onClick={() => location.reload()}>Réessayer</button>}
        </div>
      )}
      {manifest?.works.length === 0 && (
        <div className="empty">
          <h1>Aucune vidéo dans la timeline</h1>
          <p>Les vidéos qualifiées apparaîtront ici.</p>
        </div>
      )}
      {manifest?.works.map((work, index) => (
        <Film
          key={work.id}
          work={work}
          index={index}
          count={manifest.works.length}
          active={index === active}
          nearby={Math.abs(index - active) <= 1}
          reduced={reduced}
          fullscreen={fullscreen}
          toggleFullscreen={toggleFullscreen}
        />
      ))}
    </main>
  );
}
const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
