// SPDX-License-Identifier: Apache-2.0
import React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { DesktopOS } from "../os/DesktopOS";
import { hostAccessQuery } from "../lib/api";

/** The windowed Bun WebOS, shown full screen over the shell; its main menu leads back to the hub. */
export function OsPage() {
  const navigate = useNavigate();
  const access = useQuery(hostAccessQuery);
  if (access.data?.hostAccess === false)
    return (
      <section className="page" aria-labelledby="os-title">
        <h1 id="os-title">Bureau désactivé</h1>
        <p className="lede">
          Ce serveur est public : le terminal, les fichiers, les processus et l’évaluation de code ne sont ouverts qu’à la page locale de
          celui qui l’exécute.
        </p>
        <Link to="/" className="btn filled">
          Retour à l’accueil
        </Link>
      </section>
    );
  return (
    <div className="os-host">
      <DesktopOS onExit={() => void navigate({ to: "/" })} />
    </div>
  );
}
