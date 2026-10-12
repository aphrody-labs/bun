import { useMemo, useState } from "react";

export interface StudioAsset { readonly id: string; readonly title: string; readonly src: string; readonly type?: string; }
export interface VideoStudioProps { readonly assets: readonly StudioAsset[]; readonly initialAssetId?: string; readonly className?: string; }

/** Compact React studio surface for browsing assets and driving the Bun Video pipeline. */
export function VideoStudio({ assets, initialAssetId, className }: VideoStudioProps) {
  const [localAssets, setLocalAssets] = useState<readonly StudioAsset[]>(assets);
  const first = initialAssetId ?? localAssets[0]?.id;
  const [selectedId, setSelectedId] = useState(first);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const selected = useMemo(() => localAssets.find(asset => asset.id === selectedId) ?? localAssets[0], [localAssets, selectedId]);
  const addUrl = () => {
    try {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error("URL HTTP(S) requise");
      const asset = { id: `url-${Date.now()}`, title: parsed.hostname + parsed.pathname, src: parsed.href };
      setLocalAssets(current => [...current, asset]); setSelectedId(asset.id); setUrl(""); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "URL invalide"); }
  };
  const addFile = (file: File) => {
    const asset = { id: `file-${Date.now()}`, title: file.name, src: URL.createObjectURL(file), type: file.type };
    setLocalAssets(current => [...current, asset]); setSelectedId(asset.id); setError(null);
  };
  return (
    <section className={className} aria-label="Bun Video Studio">
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
          <video key={selected.id} controls playsInline preload="metadata" src={selected.src} onError={() => setError(`Lecture impossible : ${selected.title}`)} />
        ) : <p>Aucun média sélectionné.</p>}
        {selected && <p>{selected.title}{selected.type ? ` · ${selected.type}` : ""}</p>}
        {error && <p role="alert">{error}</p>}
      </main>
    </section>
  );
}
