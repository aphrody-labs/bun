import { useMemo, useState } from "react";

export interface StudioAsset { readonly id: string; readonly title: string; readonly src: string; readonly type?: string; }
export interface VideoStudioProps { readonly assets: readonly StudioAsset[]; readonly initialAssetId?: string; readonly className?: string; }

/** Compact React studio surface for browsing assets and driving the Bun Video pipeline. */
export function VideoStudio({ assets, initialAssetId, className }: VideoStudioProps) {
  const first = initialAssetId ?? assets[0]?.id;
  const [selectedId, setSelectedId] = useState(first);
  const [error, setError] = useState<string | null>(null);
  const selected = useMemo(() => assets.find(asset => asset.id === selectedId) ?? assets[0], [assets, selectedId]);
  return (
    <section className={className} aria-label="Bun Video Studio">
      <aside>
        <strong>Bibliothèque</strong>
        {assets.map(asset => (
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
