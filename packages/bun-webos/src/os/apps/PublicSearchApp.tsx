// SPDX-License-Identifier: Apache-2.0
import React, { useEffect, useRef, useState } from "react";
import { useReadyOnMount } from "../ready";
import { errorText } from "../api";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}
interface SearchPage {
  query: string;
  organic: SearchResult[];
  source: "public-crawl-cache";
  collection: string;
  generatedAt: string;
}

export async function readPublicSearch(response: Response): Promise<SearchPage> {
  if (!response.ok) throw new Error(`Recherche publique indisponible (HTTP ${response.status}).`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Réponse de recherche vide.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 1024 * 1024) throw new Error("Réponse de recherche trop grande.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const page = JSON.parse(new TextDecoder().decode(bytes)) as SearchPage;
  if (
    !page ||
    typeof page !== "object" ||
    page.source !== "public-crawl-cache" ||
    typeof page.query !== "string" ||
    typeof page.collection !== "string" ||
    typeof page.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(page.generatedAt)) ||
    !Array.isArray(page.organic) ||
    page.organic.length > 20
  )
    throw new Error("Contrat de recherche publique invalide.");
  for (const result of page.organic) {
    if (
      !result ||
      typeof result !== "object" ||
      typeof result.title !== "string" ||
      typeof result.url !== "string" ||
      typeof result.snippet !== "string"
    )
      throw new Error("Résultat de recherche invalide.");
    const url = new URL(result.url);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error("Le résultat ne contient pas une URL HTTPS publique.");
  }
  return page;
}

export const PublicSearchApp: React.FC = () => {
  useReadyOnMount();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<SearchPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = query.trim();
    if (!text || text.length > 1024 || busy) return;
    const request = new AbortController();
    controller.current?.abort();
    controller.current = request;
    setBusy(true);
    setError(null);
    setPage(null);
    try {
      const parameters = new URLSearchParams({
        query: text,
        num: "10",
        start: "0",
        safe: "active",
        vertical: "web",
      });
      const response = await fetch(`/api/search?${parameters}`, {
        credentials: "omit",
        redirect: "error",
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(10000)]),
      });
      const result = await readPublicSearch(response);
      if (!request.signal.aborted) setPage(result);
    } catch (failure) {
      if (!request.signal.aborted) setError(errorText(failure));
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  };
  return (
    <div className="h-full overflow-auto bg-[#0e1017] p-5 text-gray-200">
      <h2 className="text-lg font-semibold">Recherche publique Bun</h2>
      <p className="my-3 text-sm text-gray-400">
        Interroge les pages publiques indexées. Aucun accès aux fichiers ou sessions de votre
        appareil.
      </p>
      <form
        onSubmit={(event) => {
          void search(event);
        }}
        className="flex gap-2"
      >
        <input
          aria-label="Recherche publique"
          value={query}
          maxLength={1024}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-0 flex-1 rounded bg-gray-800 px-3 py-2"
        />
        <button
          type="submit"
          disabled={busy || !query.trim()}
          className="rounded bg-indigo-700 px-3 py-2 disabled:opacity-40"
        >
          {busy ? "Recherche…" : "Rechercher"}
        </button>
      </form>
      {error && (
        <p role="alert" className="my-3 text-sm text-amber-300">
          {error}
        </p>
      )}
      {page && (
        <>
          <p className="my-3 text-xs text-gray-400">
            Collection {page.collection} · {page.generatedAt}
          </p>
          {page.organic.length === 0 && <p>Aucun résultat dans cette collection.</p>}
          {page.organic.map((result, index) => (
            <article key={`${index}:${result.url}`} className="my-4">
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-300 underline"
              >
                {result.title}
              </a>
              <p className="mt-1 text-sm text-gray-400">{result.snippet}</p>
            </article>
          ))}
        </>
      )}
    </div>
  );
};
