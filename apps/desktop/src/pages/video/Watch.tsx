// SPDX-License-Identifier: Apache-2.0
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, getRouteApi, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { M3VideoPlayer } from "@aphrody/m3-react/video";
import { MdTabs, MdPrimaryTab } from "@aphrody/m3-react/wrappers/tabs";
import { MdLinearProgress } from "@aphrody/m3-react/wrappers/progress";
import { ApiError, ENGINE_LABEL, clock, getJson, seconds, worksQuery, type VideoWork } from "../../lib/api";
import { rememberProgress, readProgress } from "../../lib/store";
import { Icon } from "../../shell/icons";
import { Card, SaveButton, mediaUrl } from "./parts";

const route = getRouteApi("/video/watch");

interface Cue {
  start: number;
  end: number;
  text: string;
}

const CUE = /(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})\s+-->\s+(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})/;

export function parseVtt(text: string): Cue[] {
  const cues: Cue[] = [];
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const at = (h: string | undefined, m: string, s: string, ms: string) => Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
  for (let i = 0; i < lines.length; i++) {
    const match = CUE.exec(lines[i]!);
    if (!match) continue;
    const body: string[] = [];
    while (++i < lines.length && lines[i] !== "") body.push(lines[i]!.replace(/<[^>]*>/g, "").trim());
    const line = body.join(" ").trim();
    if (line) cues.push({ start: at(match[1], match[2]!, match[3]!, match[4]!), end: at(match[5], match[6]!, match[7]!, match[8]!), text: line });
  }
  return cues;
}

interface WatchReport {
  durationSeconds: number;
  frameEngine: string;
  frames: { index: number; timestampSeconds: number; dataUrl: string }[];
  transcript: Cue[];
  transcriptState: string;
  warnings: string[];
}

/** Library works can be analysed by the native watch pipeline: timestamped frames and a transcript. */
function Analysis({ work, onSeek }: { work: VideoWork; onSeek: (time: number) => void }) {
  const name = work.video.startsWith("/media/") ? decodeURIComponent(work.video.slice("/media/".length)) : undefined;
  const run = useMutation({
    mutationFn: () => getJson<WatchReport>(`/api/video/watch?src=${encodeURIComponent(name!)}&detail=efficient&frames=12&width=320`),
  });
  if (!name)
    return <p className="note">L’analyse watch s’applique aux fichiers de la bibliothèque locale.</p>;
  return (
    <div className="analysis">
      <button type="button" className="btn tonal" disabled={run.isPending} onClick={() => run.mutate()}>
        <Icon name="film" /> {run.data ? "Relancer l’analyse" : "Analyser avec watch"}
      </button>
      {run.isPending && <MdLinearProgress indeterminate aria-label="Analyse en cours" />}
      {run.error && (
        <p className="note error" role="alert">
          {run.error instanceof ApiError && run.error.status === 429 ? "Une analyse est déjà en cours." : run.error.message}
        </p>
      )}
      {run.data && (
        <>
          <ol className="filmstrip" aria-label="Images extraites">
            {run.data.frames.map(frame => (
              <li key={frame.index}>
                <button type="button" onClick={() => onSeek(frame.timestampSeconds)} aria-label={`Aller à ${clock(frame.timestampSeconds)}`}>
                  <img src={frame.dataUrl} alt="" />
                  <span>{clock(frame.timestampSeconds)}</span>
                </button>
              </li>
            ))}
          </ol>
          <p className="note">
            {run.data.frames.length} images ({run.data.frameEngine}) · transcription : {run.data.transcript.length ? `${run.data.transcript.length} segments` : run.data.transcriptState}
          </p>
        </>
      )}
    </div>
  );
}

function Transcript({ cues, time, onSeek }: { cues: Cue[]; time: number; onSeek: (time: number) => void }) {
  const [filter, setFilter] = useState("");
  const list = useRef<HTMLUListElement>(null);
  const manual = useRef(0);
  const activeIndex = cues.findIndex(cue => time >= cue.start && time < cue.end);
  useEffect(() => {
    if (activeIndex < 0 || filter || Date.now() - manual.current < 3000) return;
    list.current?.querySelector<HTMLElement>("[aria-current=true]")?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, filter]);
  const needle = filter.trim().toLowerCase();
  return (
    <div className="transcript">
      <label className="field">
        <span className="sr-only">Filtrer la transcription</span>
        <input type="search" placeholder="Filtrer la transcription" value={filter} onChange={event => setFilter(event.target.value)} />
      </label>
      <ul ref={list} onWheel={() => (manual.current = Date.now())} onTouchMove={() => (manual.current = Date.now())}>
        {cues.map((cue, index) =>
          needle && !cue.text.toLowerCase().includes(needle) ? null : (
            <li key={`${cue.start}-${index}`}>
              <button type="button" aria-current={index === activeIndex ? "true" : undefined} onClick={() => onSeek(cue.start)}>
                <time>{clock(cue.start)}</time> {cue.text}
              </button>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

export function WatchPage() {
  const { data: works } = useSuspenseQuery(worksQuery);
  const { v, theater } = route.useSearch();
  const navigate = useNavigate();
  const work = works.find(item => item.id === v) ?? works[0];
  const [tab, setTab] = useState(0);
  const [time, setTime] = useState(0);
  const player = useRef<HTMLDivElement>(null);
  const captions = useQuery({
    queryKey: ["captions", work?.captions],
    enabled: !!work?.captions,
    queryFn: async ({ signal }) => parseVtt(await (await fetch(mediaUrl(work!.captions!), { signal })).text()),
  });
  const next = useMemo(() => {
    if (!work) return undefined;
    const index = works.findIndex(item => item.id === work.id);
    return works[(index + 1) % works.length];
  }, [works, work]);
  useEffect(() => {
    if (work) document.title = `${work.title} — Aphrody`;
    return () => {
      document.title = "Aphrody";
    };
  }, [work]);
  if (!work)
    return (
      <section className="page">
        <h1>Aucun film</h1>
        <Link to="/video" className="btn filled">
          Retour au catalogue
        </Link>
      </section>
    );
  const seek = (target: number) => {
    const element = player.current?.querySelector("video");
    if (element) element.currentTime = target;
  };
  const cues = captions.data ?? [];
  return (
    <section className={theater ? "watch theater" : "watch"} aria-labelledby="watch-title">
      <div className="watch-main">
        <div ref={player}>
          <M3VideoPlayer
            key={work.id}
            src={mediaUrl(work.video)}
            title={work.title}
            poster={work.poster ? mediaUrl(work.poster) : undefined}
            captions={work.captions ? { src: mediaUrl(work.captions), srcLang: "fr", label: "Français" } : undefined}
            frameDuration={work.fps.den / work.fps.num}
            autoPlay={!matchMedia("(prefers-reduced-motion: reduce)").matches}
            onTime={now => {
              setTime(now);
              if (Math.abs(now - readProgress(work.id)) >= 2) rememberProgress(work.id, now);
            }}
            onTheater={() => void navigate({ to: "/video/watch", search: { v: work.id, theater: theater ? undefined : true } })}
            onEnded={() => rememberProgress(work.id, 0)}
            endScreen={
              next && next.id !== work.id ? (
                <div className="upnext">
                  <p>À suivre</p>
                  <h2>{next.title}</h2>
                  <div className="actions">
                    <Link className="btn filled" to="/video/watch" search={{ v: next.id }}>
                      <Icon name="play" /> Lire
                    </Link>
                  </div>
                </div>
              ) : undefined
            }
          />
        </div>
        <header className="watch-head">
          <p className="eyebrow">
            {ENGINE_LABEL[work.engine]} · {clock(seconds(work))} · {work.width}×{work.height}
          </p>
          <h1 id="watch-title">{work.title}</h1>
          <p>{work.description}</p>
          <div className="actions">
            <SaveButton work={work} />
            <button
              type="button"
              className="btn tonal"
              onClick={() => void navigator.clipboard?.writeText(location.href)}
            >
              <Icon name="link" /> Copier le lien
            </button>
            <Link className="btn tonal" to="/video/studio" search={{ v: work.id }}>
              <Icon name="film" /> Studio
            </Link>
          </div>
        </header>
        <MdTabs className="watch-tabs" activeTabIndex={tab} onChange={(event: Event) => setTab((event.target as unknown as { activeTabIndex: number }).activeTabIndex)}>
          <MdPrimaryTab>Transcription</MdPrimaryTab>
          <MdPrimaryTab>Analyse watch</MdPrimaryTab>
          <MdPrimaryTab>Source</MdPrimaryTab>
        </MdTabs>
        <div className="watch-panel" role="region" aria-label="Détails du film">
          {tab === 0 &&
            (cues.length ? (
              <Transcript cues={cues} time={time} onSeek={seek} />
            ) : (
              <p className="note">Ce film n’a pas de sous-titres. Lancez l’analyse watch pour obtenir des images horodatées{work.video.startsWith("/media/") ? " et une transcription si des légendes existent" : ""}.</p>
            ))}
          {tab === 1 && <Analysis work={work} onSeek={seek} />}
          {tab === 2 && (
            <dl className="facts">
              <dt>Moteur</dt>
              <dd>{ENGINE_LABEL[work.engine]}</dd>
              <dt>Cadence</dt>
              <dd>
                {work.fps.num}/{work.fps.den} i/s
              </dd>
              <dt>Techniques</dt>
              <dd>{work.features.join(" · ") || "—"}</dd>
              <dt>Preuves</dt>
              <dd>{work.evidence.join(" · ") || "Aucune preuve associée."}</dd>
            </dl>
          )}
        </div>
      </div>
      <aside className="watch-side" aria-label="À suivre">
        <h2>À suivre</h2>
        {works
          .filter(item => item.id !== work.id)
          .slice(0, 8)
          .map(item => (
            <Card key={item.id} work={item} />
          ))}
      </aside>
    </section>
  );
}
