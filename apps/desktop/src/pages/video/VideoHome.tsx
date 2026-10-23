// SPDX-License-Identifier: Apache-2.0
import React, { useEffect, useRef, useState } from "react";
import { Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { MdFilterChip } from "@aphrody/m3-react/wrappers/chips";
import { MdIconButton } from "@aphrody/m3-react/wrappers/iconbutton";
import { ENGINE_LABEL, clock, seconds, worksQuery, type VideoWork } from "../../lib/api";
import { useProgress, useSaved } from "../../lib/store";
import { Icon } from "../../shell/icons";
import { Card, Poster, SaveButton, Shelf, buildShelves, mediaUrl, useReducedMotion } from "./parts";

const route = getRouteApi("/video");

function Billboard({ work }: { work: VideoWork }) {
  const reduced = useReducedMotion();
  const video = useRef<HTMLVideoElement>(null);
  const section = useRef<HTMLElement>(null);
  const [paused, setPaused] = useState(reduced);
  const [visible, setVisible] = useState(true);
  const position = useProgress()[work.id] ?? 0;
  useEffect(() => setPaused(reduced), [reduced]);
  useEffect(() => {
    const element = section.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry!.isIntersecting), { threshold: 0.25 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (paused || !visible || document.hidden) element.pause();
    else void element.play().catch(() => setPaused(true));
  }, [paused, visible, work.id]);
  const resuming = position > 1 && position < seconds(work) - 1;
  return (
    <section className="billboard" ref={section} aria-labelledby="billboard-title">
      <div className="billboard-media" aria-hidden="true">
        <Poster work={work} eager />
        <video ref={video} src={mediaUrl(work.video)} muted loop playsInline preload="metadata" tabIndex={-1} />
      </div>
      <div className="billboard-copy">
        <p className="eyebrow">
          {ENGINE_LABEL[work.engine]} · {work.chapter ?? "Vidéo native"}
        </p>
        <h1 id="billboard-title">{work.title}</h1>
        <p className="lede">{work.description}</p>
        <div className="actions">
          <Link className="btn filled" to="/video/watch" search={{ v: work.id }}>
            <Icon name="play" /> {resuming ? `Reprendre à ${clock(position)}` : "Lire"}
          </Link>
          <Link className="btn tonal" to="/video/studio" search={{ v: work.id }}>
            <Icon name="film" /> Studio
          </Link>
        </div>
      </div>
      <MdIconButton
        className="billboard-pause"
        toggle
        selected={paused}
        aria-label={paused ? "Lire l’aperçu animé" : "Mettre en pause l’aperçu animé"}
        onClick={() => setPaused(value => !value)}
      >
        <Icon name={paused ? "play" : "pause"} />
      </MdIconButton>
    </section>
  );
}

export function VideoHome() {
  const { data: works } = useSuspenseQuery(worksQuery);
  const { q, e } = route.useSearch();
  const navigate = useNavigate();
  const progress = useProgress();
  const saved = useSaved();
  const needle = q?.trim().toLowerCase() ?? "";
  const engines = [...new Set(works.map(work => work.engine))];
  if (!works.length)
    return (
      <section className="page">
        <h1>Vidéo</h1>
        <div className="empty-state">
          <h2>Aucun film pour l’instant</h2>
          <p>Déposez des fichiers .mp4, .webm, .mov ou .mkv dans le dossier Vidéos du bureau pour les voir ici.</p>
          <Link to="/os" className="btn filled">
            Ouvrir le bureau
          </Link>
        </div>
      </section>
    );
  const filtering = !!needle || !!e;
  const matches = works.filter(
    work =>
      (!e || work.engine === e) &&
      (!needle || `${work.title} ${work.description} ${ENGINE_LABEL[work.engine]} ${work.features.join(" ")}`.toLowerCase().includes(needle)),
  );
  const featured = works.find(work => (progress[work.id] ?? 0) > 1) ?? works[0]!;
  return (
    <>
      {!filtering && <Billboard work={featured} />}
      <section className="page" aria-labelledby="video-title">
        <header className="page-head">
          <p className="eyebrow">Vidéo</p>
          <h1 id="video-title">{needle ? `Résultats pour « ${q} »` : "Catalogue"}</h1>
          <div className="actions">
            <Link to="/video/shorts" className="btn tonal">
              <Icon name="film" /> Shorts
            </Link>
          </div>
        </header>
        <div className="chips" role="group" aria-label="Filtrer par moteur">
          <MdFilterChip label="Tous" selected={!e} onClick={() => void navigate({ to: "/video", search: { q, e: undefined } })} />
          {engines.map(engine => (
            <MdFilterChip key={engine} label={ENGINE_LABEL[engine]} selected={e === engine} onClick={() => void navigate({ to: "/video", search: { q, e: e === engine ? undefined : engine } })} />
          ))}
        </div>
        {filtering ? (
          matches.length ? (
            <div className="grid">
              {matches.map(work => (
                <Card key={work.id} work={work} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h2>Aucun film ne correspond</h2>
              <Link to="/video" className="btn filled">
                Tout afficher
              </Link>
            </div>
          )
        ) : (
          buildShelves(works, progress, saved).map(shelf => <Shelf key={shelf.id} shelf={shelf} />)
        )}
      </section>
    </>
  );
}

void SaveButton;
