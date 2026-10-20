import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { applyDynamicColor } from "@aphrody/m3-tokens/dynamic-color";
import "@aphrody/m3-tokens/m3-tokens.css";
import type { ShowcaseManifest } from "./collection";
import "./style.css";

type Work = ShowcaseManifest["works"][number];
const asset = (path: string) => new URL(path, `${location.origin}/`).href;

function Film({
  work,
  index,
  count,
  active,
  nearby,
  reduced,
}: {
  work: Work;
  index: number;
  count: number;
  active: boolean;
  nearby: boolean;
  reduced: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const preview = useRef<HTMLIFrameElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const [wantsPlay, setWantsPlay] = useState(!reduced);
  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(true);
  const [position, setPosition] = useState(0);
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(!document.hidden);
  const cursor = useRef(0);
  const duration = (work.durationFrames * work.fps.den) / work.fps.num;
  const canAnimate = !work.video && !work.preview;
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
    if (!active || !visible) audio.current?.pause();
  }, [active, visible]);
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
  const seekPreview = (seconds: number) => {
    const frame = Math.min(work.durationFrames - 1, Math.max(0, Math.floor((seconds * work.fps.num) / work.fps.den)));
    preview.current?.contentWindow?.postMessage({ type: "showcase-seek", frame }, location.origin);
  };
  useEffect(() => {
    if (!canAnimate || !playing) return;
    let request = 0;
    const start = performance.now();
    const from = cursor.current;
    const tick = (now: number) => {
      const seconds = (from + (now - start) / 1000) % duration;
      cursor.current = seconds;
      setPosition(seconds);
      seekPreview(seconds);
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [canAnimate, playing, duration]);
  const seek = (seconds: number) => {
    cursor.current = seconds;
    setPosition(seconds);
    if (video.current) video.current.currentTime = seconds;
    else seekPreview(seconds);
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
        {work.video ? (
          <video
            ref={video}
            src={nearby ? asset(work.video) : undefined}
            poster={work.poster ? asset(work.poster) : undefined}
            preload={active ? "auto" : nearby ? "metadata" : "none"}
            playsInline
            loop
            muted={muted}
            aria-label={work.title}
            onPlay={() => setRunning(true)}
            onPause={() => setRunning(false)}
            onTimeUpdate={event => {
              cursor.current = event.currentTarget.currentTime;
              setPosition(event.currentTarget.currentTime);
            }}
            onError={() => {
              setMessage("Cette vidéo n’a pas pu être chargée.");
              setWantsPlay(false);
            }}
          >
            {work.captions && (
              <track kind="captions" src={asset(work.captions)} srcLang="fr" label="Français" default />
            )}
          </video>
        ) : work.preview ? (
          work.mediaType === "audio" ? (
            <div className="audio-preview">
              <p>Aperçu audio natif</p>
              <audio
                controls
                preload={nearby ? "metadata" : "none"}
                src={nearby ? asset(work.preview) : undefined}
                aria-label={work.title}
                ref={audio}
              />
            </div>
          ) : (
            <img src={asset(work.preview)} alt={work.description} loading={nearby ? "eager" : "lazy"} />
          )
        ) : nearby ? (
          <iframe
            ref={preview}
            src={`/preview.html?work=${encodeURIComponent(work.id)}`}
            title={`Aperçu de composition : ${work.title}`}
            tabIndex={active ? 0 : -1}
            onLoad={() => seekPreview(cursor.current)}
          />
        ) : work.poster ? (
          <img src={asset(work.poster)} alt="" loading="lazy" />
        ) : null}
      </div>
      <div className="film-top">
        <span>Aphrody Video</span>
        <span className="chapter">
          {work.chapter ?? work.engine} · {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
        </span>
        <a href="https://craft.aphrody.app/film/">
          Ouvrir le montage <span aria-hidden="true">↗</span>
        </a>
      </div>
      <div className="film-bottom">
        <div className="caption">
          <p className="eyebrow">
            {work.engine} / {work.features.slice(0, 3).join(" · ")}
          </p>
          <h1>{work.title}</h1>
          <p>{work.description}</p>
          {!work.video && (
            <p className="render-state">
              {canAnimate
                ? "Aperçu interactif de la composition · vidéo en attente de rendu"
                : "Aperçu natif · aucun rendu vidéo associé"}
            </p>
          )}
        </div>
        <div className="transport">
          {(work.video || canAnimate) && (
            <>
              <button onClick={toggle} aria-label={playing && (canAnimate || running) ? "Mettre en pause" : "Lire"}>
                {playing && (canAnimate || running) ? "Pause" : "Lire"}
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
                    if (canAnimate) setWantsPlay(false);
                    seek(Number(event.target.value));
                  }}
                  aria-valuetext={`${position.toFixed(1)} sur ${duration.toFixed(1)} secondes`}
                />
              </label>
              <output>
                {position.toFixed(1)} / {duration.toFixed(1)} s
              </output>
            </>
          )}
          {work.video && (
            <button
              onClick={() => setMuted(value => !value)}
              aria-pressed={!muted}
              aria-label={muted ? "Activer le son" : "Couper le son"}
            >
              {muted ? "Son coupé" : "Son actif"}
            </button>
          )}
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
              {work.code && <a href={asset(work.code)}>Code de la démonstration</a>}
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

function App() {
  const [manifest, setManifest] = useState<ShowcaseManifest>();
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const feed = useRef<HTMLElement>(null);
  useEffect(() => {
    // Canonical Bun M3 token generator; no separate showcase palette.
    applyDynamicColor("#65558f", { dark: true });
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
        if (data.schema !== "bun-video/showcase/v1" || !Array.isArray(data.works))
          throw new Error("Catalogue invalide");
        setManifest(data);
      })
      .catch(reason => {
        if (!controller.signal.aborted) setError(String(reason));
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!manifest || !feed.current) return;
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
  const page = (event: React.KeyboardEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button, a, input, audio, summary, iframe")) return;
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
          <h1>Aucune vidéo publiée</h1>
          <a href="https://craft.aphrody.app/film/">Ouvrir Aphrody Video</a>
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
        />
      ))}
    </main>
  );
}
const root = document.getElementById("root");
if (root) createRoot(root).render(<App />);
