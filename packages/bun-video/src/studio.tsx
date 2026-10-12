import { useMemo, useState } from "react";
import { extractYtDlp, type YtDlpResult } from "./ytdlp";
import type { CrawlerCache } from "./cache";

export interface StudioAsset { readonly id: string; readonly title: string; readonly src: string; readonly type?: string; }
export interface VideoStudioProps { readonly assets: readonly StudioAsset[]; readonly initialAssetId?: string; readonly className?: string; readonly cache?: CrawlerCache; }

/** Compact React studio surface for browsing assets and driving the Bun Video pipeline. */
export function VideoStudio({ assets, initialAssetId, className, cache }: VideoStudioProps) {
  const [localAssets, setLocalAssets] = useState<readonly StudioAsset[]>(assets);
  const first = initialAssetId ?? localAssets[0]?.id;
  const [selectedId, setSelectedId] = useState(first);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [metadata, setMetadata] = useState<YtDlpResult | null>(null);
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const selected = useMemo(() => localAssets.find(asset => asset.id === selectedId) ?? localAssets[0], [localAssets, selectedId]);
  const selectedIndex = selected ? localAssets.findIndex(asset => asset.id === selected.id) : -1;
  const selectRelative = (delta: number) => {
    if (selectedIndex < 0 || localAssets.length === 0) return;
    const next = localAssets[(selectedIndex + delta + localAssets.length) % localAssets.length];
    setSelectedId(next.id); setMetadata(null); setError(null);
  };
  const addUrl = () => {
    try {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error("URL HTTP(S) requise");
      const asset = { id: `url-${Date.now()}`, title: parsed.hostname + parsed.pathname, src: parsed.href };
      setLocalAssets(current => [...current, asset]); setSelectedId(asset.id); setUrl(""); setMetadata(null); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "URL invalide"); }
  };
  const inspectSelected = async () => {
    if (!selected || !/^https?:$/.test(new URL(selected.src).protocol)) return;
    setLoadingMetadata(true); setError(null);
    try {
      const key = `yt-dlp:${selected.src}`;
      const cached = await cache?.get<YtDlpResult>(key);
      const result = cached ?? await extractYtDlp(selected.src);
      if (!cached) await cache?.set(key, result);
      setMetadata(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setLoadingMetadata(false); }
  };
  const addFile = (file: File) => {
    const asset = { id: `file-${Date.now()}`, title: file.name, src: URL.createObjectURL(file), type: file.type };
    setLocalAssets(current => [...current, asset]); setSelectedId(asset.id); setError(null);
  };
  const addDropped = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && (file.type.startsWith("video/") || file.type.startsWith("audio/"))) addFile(file);
    else if (file) setError("Le fichier doit être vidéo ou audio");
  };
  return (
    <section className={className} aria-label="Bun Video Studio" onDragOver={event => event.preventDefault()} onDrop={addDropped}>
      <aside>
        <strong>Bibliothèque</strong>
        <input type="file" accept="video/*,audio/*" onChange={event => { const file = event.target.files?.[0]; if (file) addFile(file); }} />
        <form onSubmit={event => { event.preventDefault(); addUrl(); }}>
          <input value={url} onChange={event => setUrl(event.target.value)} placeholder="URL vidéo HTTPS" type="url" />
          <button type="submit">Ajouter</button>
        </form>
        {localAssets.map(asset => (
          <button key={asset.id} type="button" aria-pressed={asset.id === selected?.id} onClick={() => { setError(null); setSelectedId(asset.id); }}>
            {asset.title}
          </button>
        ))}
      </aside>
      <main>
        {selected ? (
          <video key={selected.id} controls playsInline preload="metadata" src={selected.src} onEnded={() => selectRelative(1)} onError={() => setError(`Lecture impossible : ${selected.title}`)} />
        ) : <p>Aucun média sélectionné.</p>}
        {selected && <p>{selected.title}{selected.type ? ` · ${selected.type}` : ""}</p>}
        {selected && <nav aria-label="Contrôles de file"><button type="button" onClick={() => selectRelative(-1)}>Précédent</button><button type="button" onClick={() => selectRelative(1)}>Suivant</button></nav>}
        {selected && /^https?:$/.test(new URL(selected.src).protocol) && <button type="button" onClick={() => void inspectSelected()} disabled={loadingMetadata}>{loadingMetadata ? "Analyse…" : "Analyser avec yt-dlp"}</button>}
        {metadata && <pre>{JSON.stringify({ title: metadata.title, id: metadata.id, formats: metadata.formats?.length ?? 0 }, null, 2)}</pre>}
        {error && <p role="alert">{error}</p>}
      </main>
    </section>
  );
}
