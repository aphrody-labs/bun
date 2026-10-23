// SPDX-License-Identifier: Apache-2.0
import React, { useEffect, useRef, useState } from "react";
import { Link, getRouteApi } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { MdIconButton } from "@aphrody/m3-react/wrappers/iconbutton";
import { ENGINE_LABEL, worksQuery, type VideoWork } from "../../lib/api";
import { Icon } from "../../shell/icons";
import { SaveButton, mediaUrl, useReducedMotion } from "./parts";

const route = getRouteApi("/video/shorts");

function Short({ work, active, near, muted }: { work: VideoWork; active: boolean; near: boolean; muted: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [wantsPlay, setWantsPlay] = useState(true);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (active && wantsPlay && !document.hidden) void element.play().catch(() => setWantsPlay(false));
    else element.pause();
  }, [active, wantsPlay]);
  useEffect(() => {
    if (video.current) video.current.muted = muted;
  }, [muted]);
  return (
    <section className="short" aria-label={work.title} aria-current={active ? "true" : undefined}>
      <video
        ref={video}
        src={near ? mediaUrl(work.video) : undefined}
        poster={work.poster ? mediaUrl(work.poster) : undefined}
        loop
        muted={muted}
        playsInline
        preload={active ? "auto" : near ? "metadata" : "none"}
        aria-label={work.title}
        onClick={() => setWantsPlay(value => !value)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <div className="short-copy">
        <p className="eyebrow">{ENGINE_LABEL[work.engine]}</p>
        <h2>{work.title}</h2>
        <p>{work.description}</p>
        <div className="actions">
          <MdIconButton aria-label={playing ? "Pause" : "Lire"} onClick={() => setWantsPlay(value => !value)}>
            <Icon name={playing ? "pause" : "play"} />
          </MdIconButton>
          <SaveButton work={work} />
          <Link className="btn tonal" to="/video/watch" search={{ v: work.id }}>
            Regarder en entier
          </Link>
        </div>
      </div>
    </section>
  );
}

export function ShortsPage() {
  const { data: works } = useSuspenseQuery(worksQuery);
  const { v } = route.useSearch();
  const reduced = useReducedMotion();
  const feed = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(Math.max(0, works.findIndex(work => work.id === v)));
  const [muted, setMuted] = useState(true);
  useEffect(() => {
    const element = feed.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) if (entry.isIntersecting && entry.intersectionRatio >= 0.6) setActive(Number((entry.target as HTMLElement).dataset.index));
      },
      { root: element, threshold: [0.6] },
    );
    for (const item of element.querySelectorAll("[data-index]")) observer.observe(item);
    element.querySelectorAll<HTMLElement>("[data-index]")[active]?.scrollIntoView({ block: "start" });
    return () => observer.disconnect();
  }, [works.length]);
  const go = (delta: number) =>
    feed.current
      ?.querySelectorAll<HTMLElement>("[data-index]")
      [Math.max(0, Math.min(works.length - 1, active + delta))]?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  if (!works.length)
    return (
      <section className="page">
        <h1>Shorts</h1>
        <p className="note">Aucun film à faire défiler.</p>
      </section>
    );
  return (
    <section className="shorts" aria-label="Shorts">
      <div
        className="shorts-feed"
        ref={feed}
        tabIndex={0}
        onKeyDown={event => {
          if ((event.target as HTMLElement).closest("button, a, md-icon-button, input")) return;
          const key = event.key.toLowerCase();
          const act = (action: () => void) => {
            event.preventDefault();
            action();
          };
          if (key === "arrowdown" || key === "j" || key === "pagedown") act(() => go(1));
          else if (key === "arrowup" || key === "k" || key === "pageup") act(() => go(-1));
          else if (key === "m") act(() => setMuted(value => !value));
        }}
      >
        {works.map((work, index) => (
          <div key={work.id} data-index={index} className="short-slot">
            <Short work={work} active={index === active} near={Math.abs(index - active) <= 1} muted={muted} />
          </div>
        ))}
      </div>
      <div className="shorts-controls" role="group" aria-label="Navigation des shorts">
        <MdIconButton aria-label="Short précédent" disabled={active === 0} onClick={() => go(-1)}>
          <Icon name="chevronLeft" />
        </MdIconButton>
        <MdIconButton aria-label={muted ? "Activer le son (M)" : "Couper le son (M)"} toggle selected={!muted} onClick={() => setMuted(value => !value)}>
          <Icon name={muted ? "mute" : "volume"} />
        </MdIconButton>
        <MdIconButton aria-label="Short suivant" disabled={active === works.length - 1} onClick={() => go(1)}>
          <Icon name="chevronRight" />
        </MdIconButton>
        <output>
          {active + 1} / {works.length}
        </output>
      </div>
    </section>
  );
}
