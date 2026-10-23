// SPDX-License-Identifier: Apache-2.0
import React from "react";
import { Link, getRouteApi } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ENGINE_BLURB, ENGINE_LABEL, clock, seconds, worksQuery, type VideoWork } from "../../lib/api";
import { useProgress } from "../../lib/store";
import { Icon } from "../../shell/icons";
import { Poster, SaveButton } from "./parts";

const route = getRouteApi("/video/series");

/** The same scene rendered by another engine, matched by the id after the engine prefix. */
function counterpart(works: readonly VideoWork[], work: VideoWork): VideoWork | undefined {
  const dash = work.id.indexOf("-");
  if (dash < 0) return undefined;
  const scene = work.id.slice(dash + 1);
  return works.find(other => other.engine !== work.engine && other.id.endsWith(`-${scene}`));
}

export function SeriesPage() {
  const { data: works } = useSuspenseQuery(worksQuery);
  const { s } = route.useSearch();
  const progress = useProgress();
  const engines = [...new Set(works.map(work => work.engine))];
  const engine = engines.includes(s as VideoWork["engine"]) ? (s as VideoWork["engine"]) : engines[0];
  if (!engine)
    return (
      <section className="page">
        <h1>Aucune série</h1>
        <Link to="/video" className="btn filled">
          Retour au catalogue
        </Link>
      </section>
    );
  const episodes = works.filter(work => work.engine === engine);
  const resume = episodes.find(work => (progress[work.id] ?? 0) > 1 && (progress[work.id] ?? 0) < seconds(work) - 1) ?? episodes[0]!;
  const started = (progress[resume.id] ?? 0) > 1;
  return (
    <section className="page series" aria-labelledby="series-title">
      <header className="series-hero">
        <div className="series-art" aria-hidden="true">
          <Poster work={episodes[0]!} eager />
        </div>
        <div className="series-copy">
          <p className="eyebrow">Moteur · {episodes.length} épisodes</p>
          <h1 id="series-title">{ENGINE_LABEL[engine]}</h1>
          <p className="lede">{ENGINE_BLURB[engine]}</p>
          <div className="actions">
            <Link className="btn filled" to="/video/watch" search={{ v: resume.id }}>
              <Icon name="play" /> {started ? `Continuer : ${resume.title}` : "Commencer"}
            </Link>
            <Link className="btn tonal" to="/video/studio" search={{ v: resume.id }}>
              <Icon name="film" /> Studio
            </Link>
          </div>
        </div>
      </header>
      {engines.length > 1 && (
        <nav className="chips" aria-label="Autres moteurs">
          {engines.map(item => (
            <Link key={item} to="/video/series" search={{ s: item }} className="chip-link" aria-current={item === engine ? "page" : undefined}>
              {ENGINE_LABEL[item]}
            </Link>
          ))}
        </nav>
      )}
      <ol className="episodes">
        {episodes.map((work, index) => {
          const position = progress[work.id] ?? 0;
          const total = seconds(work);
          const other = counterpart(works, work);
          return (
            <li key={work.id}>
              <Link to="/video/watch" search={{ v: work.id }} className="episode-thumb" aria-label={`Lire l’épisode ${index + 1} : ${work.title}`}>
                <Poster work={work} />
                <span className="chip duration">{clock(total)}</span>
                {position > 1 && (
                  <span className="progress" aria-hidden="true">
                    <i style={{ width: `${Math.min(100, (position / total) * 100)}%` }} />
                  </span>
                )}
              </Link>
              <div className="episode-copy">
                <h2>
                  <span>E{index + 1}</span> {work.title}
                </h2>
                <p>{work.description}</p>
                <p className="meta">
                  {work.width}×{work.height} · {work.fps.num / work.fps.den} i/s{work.features.length ? ` · ${work.features.slice(0, 3).join(" · ")}` : ""}
                </p>
                {other && (
                  <p className="meta">
                    Même scène :{" "}
                    <Link to="/video/watch" search={{ v: other.id }}>
                      {ENGINE_LABEL[other.engine]}
                    </Link>{" "}
                    ·{" "}
                    <Link to="/video/studio" search={{ v: work.id, vs: other.id }}>
                      comparer côte à côte
                    </Link>
                  </p>
                )}
              </div>
              <SaveButton work={work} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}
