// SPDX-License-Identifier: Apache-2.0
import React, { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MdIconButton } from "@aphrody/m3-react/wrappers/iconbutton";
import { clock, ENGINE_LABEL, seconds, type VideoWork } from "../../lib/api";
import { toggleSaved, useProgress, useSaved } from "../../lib/store";
import { Icon } from "../../shell/icons";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Same-origin media URL: absolute paths of this app only. */
export function mediaUrl(path: string): string {
  const url = new URL(path, location.origin);
  if (url.origin !== location.origin) throw new TypeError("Media must be same-origin");
  return url.pathname + url.search;
}

export function Poster({ work, eager = false }: { work: VideoWork; eager?: boolean }) {
  return (
    <div className="poster" aria-hidden="true">
      {work.poster ? (
        <img
          src={mediaUrl(work.poster)}
          alt=""
          width={work.width || 16}
          height={work.height || 9}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={eager ? "high" : "auto"}
        />
      ) : (
        <span className="poster-fallback">{work.title.slice(0, 1).toUpperCase()}</span>
      )}
    </div>
  );
}

export function SaveButton({ work }: { work: VideoWork }) {
  const saved = useSaved().includes(work.id);
  return (
    <MdIconButton
      aria-label={saved ? `Retirer « ${work.title} » de ma liste` : `Ajouter « ${work.title} » à ma liste`}
      toggle
      selected={saved}
      onClick={() => toggleSaved(work.id)}
    >
      <Icon name={saved ? "check" : "add"} />
    </MdIconButton>
  );
}

/** A poster card. The muted preview plays on pointer hover or keyboard focus, never under reduced motion. */
export function Card({ work }: { work: VideoWork }) {
  const position = useProgress()[work.id] ?? 0;
  const reduced = useReducedMotion();
  const video = useRef<HTMLVideoElement>(null);
  const timer = useRef(0);
  const [preview, setPreview] = useState(false);
  const total = seconds(work);
  const start = () => {
    if (reduced) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPreview(true), 450);
  };
  const stop = () => {
    window.clearTimeout(timer.current);
    setPreview(false);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    const element = video.current;
    if (element && preview) void element.play().catch(() => setPreview(false));
  }, [preview]);
  const percent = position > 1 && total ? Math.min(100, (position / total) * 100) : 0;
  return (
    <article className="card" onPointerEnter={event => event.pointerType === "mouse" && start()} onPointerLeave={stop} onFocus={start} onBlur={stop}>
      <Link to="/video/watch" search={{ v: work.id }} className="card-link" aria-label={`Lire ${work.title}`}>
        <Poster work={work} />
        {preview && <video ref={video} src={mediaUrl(work.video)} muted loop playsInline preload="none" aria-hidden="true" tabIndex={-1} />}
        <span className="chip duration">{clock(total)}</span>
        {percent > 0 && (
          <span className="progress" aria-hidden="true">
            <i style={{ width: `${percent}%` }} />
          </span>
        )}
      </Link>
      <div className="card-body">
        <div>
          <h3>
            <Link to="/video/watch" search={{ v: work.id }}>
              {work.title}
            </Link>
          </h3>
          <p>
            {ENGINE_LABEL[work.engine]} · {work.chapter ?? work.features.slice(0, 2).join(" · ")}
          </p>
        </div>
        <SaveButton work={work} />
      </div>
    </article>
  );
}

export interface ShelfData {
  id: string;
  title: string;
  hint?: string;
  works: VideoWork[];
  to?: { to: "/video/series"; search: { s: string } };
}

/** A horizontal shelf with edge buttons; it also scrolls by keyboard focus. */
export function Shelf({ shelf }: { shelf: ShelfData }) {
  const list = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const reduced = useReducedMotion();
  const measure = () => {
    const element = list.current;
    if (element) setEdge({ start: element.scrollLeft <= 4, end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 4 });
  };
  useEffect(() => {
    measure();
    const element = list.current;
    if (!element) return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [shelf.works.length]);
  const scroll = (direction: -1 | 1) =>
    list.current?.scrollBy({ left: direction * Math.max(240, (list.current?.clientWidth ?? 0) * 0.85), behavior: reduced ? "auto" : "smooth" });
  return (
    <section className="shelf" aria-labelledby={`shelf-${shelf.id}`}>
      <header>
        <div>
          <h2 id={`shelf-${shelf.id}`}>{shelf.title}</h2>
          {shelf.hint && <p>{shelf.hint}</p>}
        </div>
        {shelf.to && (
          <Link to={shelf.to.to} search={shelf.to.search} className="text-link">
            Tout voir
          </Link>
        )}
      </header>
      <div className="shelf-frame">
        <MdIconButton className="shelf-nav prev" aria-label={`${shelf.title} : précédents`} disabled={edge.start} onClick={() => scroll(-1)}>
          <Icon name="chevronLeft" />
        </MdIconButton>
        <div className="shelf-list" ref={list} onScroll={measure}>
          {shelf.works.map(work => (
            <Card key={work.id} work={work} />
          ))}
        </div>
        <MdIconButton className="shelf-nav next" aria-label={`${shelf.title} : suivants`} disabled={edge.end} onClick={() => scroll(1)}>
          <Icon name="chevronRight" />
        </MdIconButton>
      </div>
    </section>
  );
}

/** Shelves of a catalogue: resume, my list, one per engine. */
export function buildShelves(works: readonly VideoWork[], progress: Record<string, number>, saved: readonly string[]): ShelfData[] {
  const shelves: ShelfData[] = [];
  const resume = works
    .filter(work => (progress[work.id] ?? 0) > 1 && (progress[work.id] ?? 0) < seconds(work) - 1)
    .sort((a, b) => (progress[b.id] ?? 0) - (progress[a.id] ?? 0));
  if (resume.length) shelves.push({ id: "resume", title: "Reprendre la lecture", works: resume });
  const mine = works.filter(work => saved.includes(work.id));
  if (mine.length) shelves.push({ id: "saved", title: "Ma liste", works: mine });
  const engines = [...new Set(works.map(work => work.engine))];
  for (const engine of engines)
    shelves.push({
      id: engine,
      title: ENGINE_LABEL[engine],
      works: works.filter(work => work.engine === engine),
      to: { to: "/video/series", search: { s: engine } },
    });
  return shelves;
}
