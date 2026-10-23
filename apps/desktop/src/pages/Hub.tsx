// SPDX-License-Identifier: Apache-2.0
import React from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { capabilitiesQuery, hostAccessQuery, worksQuery } from "../lib/api";
import { Icon, type IconName } from "../shell/icons";
import { Shelf } from "./video/parts";

interface Surface {
  to: "/video" | "/os" | "/tools" | "/m3";
  title: string;
  body: string;
  icon: IconName;
}

const SURFACES: readonly Surface[] = [
  { to: "/video", title: "Vidéo", body: "Catalogue, lecteur M3, séries, shorts et studio de montage pour vos films et ceux de Remotion, HyperFrames et FilmCraft.", icon: "video" },
  { to: "/os", title: "Bureau", body: "Le WebOS de Bun : fichiers, terminal, REPL, moniteur du noyau, FFI, benchmarks et gestionnaire de paquets.", icon: "os" },
  { to: "/tools", title: "Outils", body: "Chaque module de Bun Video avec son import, sa commande et un panneau pour l’essayer en direct.", icon: "tools" },
  { to: "/m3", title: "Material 3", body: "Tous les composants M3, le thème dynamique, les contrastes et la navigation adaptative.", icon: "m3" },
];

export function Hub() {
  const capabilities = useQuery(capabilitiesQuery);
  const works = useQuery(worksQuery);
  const hostAccess = useQuery(hostAccessQuery).data?.hostAccess ?? true;
  const caps = capabilities.data;
  const stats: [string, string][] = [
    ["Runtime Bun", caps?.runtime?.version ?? "—"],
    ["Décodeur", caps?.integrations?.filmcraft?.decoder ?? "—"],
    ["Remotion", caps?.integrations?.remotion?.version ?? "—"],
    ["HyperFrames", caps?.integrations?.hyperframes?.version ?? "—"],
    ["Modules", caps ? String(caps.apiFamilies.length) : "—"],
    ["Films", works.data ? String(works.data.length) : "—"],
  ];
  return (
    <>
      <section className="hero" aria-labelledby="hub-title">
        <p className="eyebrow">Un seul site pour tout le dépôt</p>
        <h1 id="hub-title">
          Bun, de la vidéo native
          <br />
          au bureau complet.
        </h1>
        <p className="lede">
          Le runtime, ses modules, son lecteur, son studio et son design system Material 3 réunis dans une seule application Bun.
        </p>
        <div className="actions">
          <Link className="btn filled" to="/video">
            <Icon name="play" /> Regarder
          </Link>
          <Link className="btn tonal" to="/tools">
            <Icon name="tools" /> Explorer les outils
          </Link>
        </div>
      </section>
      <section className="surfaces" aria-label="Espaces">
        <ul>
          {SURFACES.filter(surface => surface.to !== "/os" || hostAccess).map(surface => (
            <li key={surface.to}>
              <Link to={surface.to} className="surface-card">
                <Icon name={surface.icon} size={32} />
                <h2>{surface.title}</h2>
                <p>{surface.body}</p>
              </Link>
            </li>
          ))}
          <li>
            <a href="https://aphrody.app/docs" className="surface-card" rel="noopener">
              <Icon name="docs" size={32} />
              <h2>Docs</h2>
              <p>La documentation du runtime, des guides et des notes de version.</p>
            </a>
          </li>
        </ul>
      </section>
      <section className="status-strip" aria-label="État du serveur">
        <dl>
          {stats.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p>{capabilities.isError ? "Les capacités du serveur ne sont accessibles que depuis la page locale." : capabilities.isPending ? "Lecture des capacités…" : "Données en direct du serveur."}</p>
      </section>
      {works.data && works.data.length > 0 && (
        <div className="shelves">
          <Shelf shelf={{ id: "hub", title: "Dans le catalogue", works: works.data.slice(0, 12), hint: "Aperçu des films disponibles." }} />
        </div>
      )}
    </>
  );
}
