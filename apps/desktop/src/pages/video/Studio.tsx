// SPDX-License-Identifier: Apache-2.0
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { MdIconButton } from "@aphrody/m3-react/wrappers/iconbutton";
import { ENGINE_LABEL, clock, seconds, worksQuery, type VideoWork } from "../../lib/api";
import { Icon } from "../../shell/icons";
import { mediaUrl } from "./parts";
import { parseVtt } from "./Watch";

const route = getRouteApi("/video/studio");

/** SMPTE-style HH:MM:SS:FF. */
const timecode = (value: number, fps: number) => {
  const whole = Math.floor(value);
  const frames = Math.min(Math.ceil(fps) - 1, Math.floor((value - whole) * fps + 1e-6));
  const pair = (n: number) => String(n).padStart(2, "0");
  return `${pair(Math.floor(whole / 3600))}:${pair(Math.floor((whole % 3600) / 60))}:${pair(whole % 60)}:${pair(frames)}`;
};

/** A shell-safe, quoted argument for the commands shown to the user. */
const quote = (value: string) => (/^[\w./:@%+=,-]+$/.test(value) ? value : `"${value.replace(/(["\\$`])/g, "\\$1")}"`);

/**
 * Montage view of a film: source monitor, timeline with a captions track, in/out marks and a command panel. The browser
 * previews and prepares the edit; cutting and analysis run through bun-video, whose commands are generated here.
 */
export function StudioPage() {
  const { data: works } = useSuspenseQuery(worksQuery);
  const { v, vs } = route.useSearch();
  const navigate = useNavigate();
  const work = works.find(item => item.id === v) ?? works[0];
  const other = works.find(item => item.id === vs);
  const video = useRef<HTMLVideoElement>(null);
  const second = useRef<HTMLVideoElement>(null);
  const lane = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [marks, setMarks] = useState<{ in?: number; out?: number }>({});
  const [zoom, setZoom] = useState(1);
  const captions = useQuery({
    queryKey: ["captions", work?.captions],
    enabled: !!work?.captions,
    queryFn: async ({ signal }) => parseVtt(await (await fetch(mediaUrl(work!.captions!), { signal })).text()),
  });
  const fps = work ? work.fps.num / work.fps.den : 24;
  const duration = work ? seconds(work) : 0;
  const frame = 1 / fps;

  const seek = useCallback(
    (target: number) => {
      const clamped = Math.max(0, Math.min(duration, target));
      for (const element of [video.current, second.current]) if (element) element.currentTime = clamped;
      setTime(clamped);
    },
    [duration],
  );
  const toggle = useCallback(() => {
    const elements = [video.current, second.current].filter((element): element is HTMLVideoElement => !!element);
    if (!elements.length) return;
    if (elements[0]!.paused) for (const element of elements) void element.play().catch(() => undefined);
    else for (const element of elements) element.pause();
  }, []);
  useEffect(() => {
    for (const element of [video.current, second.current]) if (element) element.playbackRate = rate;
  }, [rate, other?.id]);
  // The second monitor follows the first, so a comparison stays frame-aligned.
  useEffect(() => {
    const first = video.current;
    const follower = second.current;
    if (!first || !follower) return;
    const sync = () => {
      if (Math.abs(follower.currentTime - first.currentTime) > frame * 1.5) follower.currentTime = first.currentTime;
    };
    const id = window.setInterval(sync, 250);
    return () => window.clearInterval(id);
  }, [other?.id, frame]);

  const shuttle = useRef(0);
  const onKey = (event: React.KeyboardEvent) => {
    if ((event.target as HTMLElement).closest("input, select, textarea")) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key.toLowerCase();
    const run = (action: () => void) => {
      event.preventDefault();
      action();
    };
    if (key === " " || key === "k") run(() => (shuttle.current = 0, setRate(1), toggle()));
    else if (key === "l") run(() => ((shuttle.current = Math.min(4, shuttle.current + 1)), setRate([1, 1.5, 2, 3, 4][shuttle.current]!), video.current?.paused && toggle()));
    else if (key === "j") run(() => seek((video.current?.currentTime ?? time) - 10 * (event.shiftKey ? 3 : 1)));
    else if (key === "arrowleft") run(() => seek((video.current?.currentTime ?? time) - (event.shiftKey ? frame * 5 : frame)));
    else if (key === "arrowright") run(() => seek((video.current?.currentTime ?? time) + (event.shiftKey ? frame * 5 : frame)));
    else if (key === "i") run(() => setMarks(current => ({ ...current, in: video.current?.currentTime ?? time })));
    else if (key === "o") run(() => setMarks(current => ({ ...current, out: video.current?.currentTime ?? time })));
    else if (key === "x") run(() => setMarks({}));
    else if (key === "home") run(() => seek(0));
    else if (key === "end") run(() => seek(duration));
    else if (key === "+" || key === "=") run(() => setZoom(value => Math.min(16, value * 2)));
    else if (key === "-") run(() => setZoom(value => Math.max(1, value / 2)));
    else if (key === "\\") run(() => setZoom(1));
  };

  // Keep the playhead visible while zoomed.
  useEffect(() => {
    const element = lane.current;
    if (!element || zoom === 1) return;
    const x = (time / duration) * element.scrollWidth;
    if (x < element.scrollLeft || x > element.scrollLeft + element.clientWidth) element.scrollLeft = x - element.clientWidth / 2;
  }, [time, zoom, duration]);

  const commands = useMemo(() => {
    if (!work) return [];
    const input = work.video.startsWith("/media/") ? decodeURIComponent(work.video.slice("/media/".length)) : `${work.id}.mp4`;
    const start = marks.in ?? 0;
    const end = marks.out ?? duration;
    const range = end > start;
    return [
      range && `bun-video media cut ${quote(input)} ${quote(`${work.id}-cut.mp4`)} --start ${start.toFixed(3)} --duration ${(end - start).toFixed(3)}`,
      `bun-video watch ${quote(input)} --detail balanced${range ? ` --start ${start.toFixed(3)} --end ${end.toFixed(3)}` : ""}`,
      `bun-video media extract-frames ${quote(input)} ${quote(`${work.id}-frames`)} --start ${start.toFixed(3)} --end ${Math.max(end, start + frame).toFixed(3)} --step ${Math.max(frame, (end - start) / 12 || 1).toFixed(3)}`,
    ].filter((line): line is string => !!line);
  }, [work, marks, duration, frame]);

  if (!work)
    return (
      <section className="page">
        <h1>Studio</h1>
        <Link to="/video" className="btn filled">
          Retour au catalogue
        </Link>
      </section>
    );
  const pick = (item: VideoWork) => void navigate({ to: "/video/studio", search: { v: item.id, vs: other?.id === item.id ? undefined : vs } });
  const left = (time / duration) * 100;
  const cues = captions.data ?? [];
  // More ticks as the timeline is zoomed or the film is long, never fewer than two.
  const rulerSteps = Math.max(2, duration * zoom > 120 ? 12 : duration * zoom > 30 ? 30 : 10);
  return (
    <section className="studio" aria-label="Studio de montage" onKeyDown={onKey}>
      <aside className="studio-bin" aria-label="Projet">
        <h2>Projet</h2>
        <ul>
          {works.map(item => (
            <li key={item.id}>
              <button type="button" aria-current={item.id === work.id ? "true" : undefined} onClick={() => pick(item)}>
                <span>{item.title}</span>
                <small>
                  {ENGINE_LABEL[item.engine]} · {clock(seconds(item))}
                </small>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="studio-monitors" tabIndex={0} aria-label="Moniteurs">
        <figure>
          <video ref={video} src={mediaUrl(work.video)} muted playsInline preload="auto" onTimeUpdate={event => setTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} aria-label={`Moniteur : ${work.title}`} />
          <figcaption>
            {work.title} · {ENGINE_LABEL[work.engine]}
          </figcaption>
        </figure>
        {other && (
          <figure>
            <video ref={second} src={mediaUrl(other.video)} muted playsInline preload="auto" aria-label={`Moniteur de comparaison : ${other.title}`} />
            <figcaption>
              {other.title} · {ENGINE_LABEL[other.engine]}
            </figcaption>
          </figure>
        )}
      </div>
      <aside className="studio-props" aria-label="Propriétés">
        <h2>Propriétés</h2>
        <dl className="facts">
          <dt>Taille</dt>
          <dd>
            {work.width}×{work.height}
          </dd>
          <dt>Cadence</dt>
          <dd>{fps.toFixed(3).replace(/\.?0+$/, "")} i/s</dd>
          <dt>Durée</dt>
          <dd>{timecode(duration, fps)}</dd>
          <dt>Entrée / sortie</dt>
          <dd>
            {marks.in === undefined ? "—" : timecode(marks.in, fps)} / {marks.out === undefined ? "—" : timecode(marks.out, fps)}
          </dd>
        </dl>
        <h2>Commandes</h2>
        <p className="note">Le navigateur prépare la coupe ; l’export se fait avec bun-video.</p>
        {commands.map(line => (
          <div className="command" key={line}>
            <code>{line}</code>
            <button type="button" className="btn text" onClick={() => void navigator.clipboard?.writeText(line)}>
              Copier
            </button>
          </div>
        ))}
        <p className="note">
          Comparer :{" "}
          {other ? (
            <Link to="/video/studio" search={{ v: work.id }}>
              fermer le deuxième moniteur
            </Link>
          ) : (
            "ouvrez une série et choisissez « comparer côte à côte »."
          )}
        </p>
      </aside>
      <div className="studio-timeline">
        <div className="transport" role="group" aria-label="Transport">
          <MdIconButton aria-label="Image précédente (←)" onClick={() => seek(time - frame)}>
            <Icon name="chevronLeft" />
          </MdIconButton>
          <MdIconButton aria-label={playing ? "Pause (K)" : "Lire (Espace)"} onClick={toggle}>
            <Icon name={playing ? "pause" : "play"} />
          </MdIconButton>
          <MdIconButton aria-label="Image suivante (→)" onClick={() => seek(time + frame)}>
            <Icon name="chevronRight" />
          </MdIconButton>
          <output className="timecode" aria-label="Position">
            {timecode(time, fps)}
          </output>
          <span className="spacer" />
          <label>
            <span className="sr-only">Vitesse</span>
            <select value={rate} onChange={event => setRate(Number(event.target.value))}>
              {[0.25, 0.5, 1, 1.5, 2, 3, 4].map(value => (
                <option key={value} value={value}>
                  {value}×
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn text" onClick={() => setMarks(current => ({ ...current, in: time }))}>
            Entrée (I)
          </button>
          <button type="button" className="btn text" onClick={() => setMarks(current => ({ ...current, out: time }))}>
            Sortie (O)
          </button>
          <button type="button" className="btn text" onClick={() => setZoom(value => Math.min(16, value * 2))} aria-label="Zoom avant (+)">
            +
          </button>
          <button type="button" className="btn text" onClick={() => setZoom(value => Math.max(1, value / 2))} aria-label="Zoom arrière (-)">
            −
          </button>
        </div>
        <div className="lane-scroll" ref={lane}>
          <div className="lanes" style={{ width: `${zoom * 100}%` }}>
            <div className="ruler" aria-hidden="true">
              {Array.from({ length: rulerSteps + 1 }, (_, index) => (
                <span key={index} style={{ left: `${(index / rulerSteps) * 100}%` }}>
                  {clock((duration * index) / rulerSteps)}
                </span>
              ))}
            </div>
            <div className="track">
              <span className="track-name">V1</span>
              <div className="clip">{work.title}</div>
            </div>
            <div className="track">
              <span className="track-name">A1</span>
              <div className="clip silent">Aucune forme d’onde publiée</div>
            </div>
            <div className="track">
              <span className="track-name">CC</span>
              {cues.map((cue, index) => (
                <div key={index} className="cue" title={cue.text} style={{ left: `${(cue.start / duration) * 100}%`, width: `${Math.max(0.5, ((cue.end - cue.start) / duration) * 100)}%` }}>
                  {cue.text}
                </div>
              ))}
            </div>
            {marks.in !== undefined && marks.out !== undefined && marks.out > marks.in && (
              <div className="range" aria-hidden="true" style={{ left: `${(marks.in / duration) * 100}%`, width: `${((marks.out - marks.in) / duration) * 100}%` }} />
            )}
            <input
              className="scrubber"
              type="range"
              min={0}
              max={duration}
              step={frame}
              value={Math.min(time, duration)}
              aria-label="Position de la tête de lecture"
              aria-valuetext={timecode(time, fps)}
              onChange={event => seek(Number(event.target.value))}
            />
            <div className="playhead" aria-hidden="true" style={{ left: `${left}%` }} />
          </div>
        </div>
        <p className="note shortcuts">Espace/K lecture · J/L recul/avance rapide · ←/→ image · I/O marques · X effacer · +/− zoom · Début/Fin</p>
      </div>
    </section>
  );
}
