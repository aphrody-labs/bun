// SPDX-License-Identifier: Apache-2.0
import React, { useState } from "react";
import {
  CAPABILITY_LABELS,
  browserCapabilityAvailable,
  requestBrowserCapability,
  type BrowserCapability,
} from "../browser-capabilities";
import { useReadyOnMount } from "../ready";
import { errorText } from "../api";

export const BrowserAccessApp: React.FC = () => {
  useReadyOnMount();
  const [results, setResults] = useState<Partial<Record<BrowserCapability, string>>>({});
  const [busy, setBusy] = useState<BrowserCapability | null>(null);
  const request = (id: BrowserCapability) => {
    const pending = requestBrowserCapability(id);
    setBusy(id);
    void pending
      .then(
        (result) => setResults((previous) => ({ ...previous, [id]: result })),
        (error) => setResults((previous) => ({ ...previous, [id]: errorText(error) })),
      )
      .finally(() => setBusy(null));
  };
  return (
    <div className="h-full overflow-auto bg-[#0e1017] p-5 text-gray-200">
      <h2 className="text-lg font-semibold">Accès de ce navigateur</h2>
      <p className="my-3 text-sm text-gray-400">
        Chaque bouton demande une capacité précise. Les fichiers importés restent sur cet appareil,
        dans le stockage du site. Aucun envoi au serveur.
      </p>
      <p className="mb-4 text-sm text-gray-400">
        Le terminal et les API Windows/Linux nécessitent votre agent Bun local. Les permissions
        Chrome ne donnent pas accès au système entier.
      </p>
      <div className="grid gap-3">
        {(Object.keys(CAPABILITY_LABELS) as BrowserCapability[]).map((id) => (
          <div key={id} className="rounded border border-gray-700 p-3">
            <button
              type="button"
              data-browser-capability={id}
              disabled={busy !== null || !browserCapabilityAvailable(id)}
              onClick={() => request(id)}
              className="rounded bg-indigo-700 px-3 py-2 text-sm disabled:opacity-40"
            >
              {CAPABILITY_LABELS[id]}
            </button>
            <p role="status" className="mt-2 text-xs text-gray-400">
              {results[id] ??
                (browserCapabilityAvailable(id)
                  ? "Disponible, non demandé"
                  : "Indisponible dans ce navigateur")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};
