// SPDX-License-Identifier: Apache-2.0
import React, { useEffect, useMemo, useState } from "react";
import { useM3Theme } from "@aphrody/m3-theme/react";
import { platformState } from "@aphrody/m3-tokens/platform-contract";
import { MdFilledButton, MdFilledTonalButton, MdOutlinedButton, MdTextButton, MdElevatedButton } from "@aphrody/m3-react/wrappers/button";
import { MdAssistChip, MdFilterChip, MdInputChip, MdSuggestionChip, MdChipSet } from "@aphrody/m3-react/wrappers/chips";
import { MdSwitch } from "@aphrody/m3-react/wrappers/switch";
import { MdCheckbox } from "@aphrody/m3-react/wrappers/checkbox";
import { MdRadio } from "@aphrody/m3-react/wrappers/radio";
import { MdSlider } from "@aphrody/m3-react/wrappers/slider";
import { MdOutlinedTextField, MdFilledTextField } from "@aphrody/m3-react/wrappers/textfield";
import { MdLinearProgress, MdCircularProgress } from "@aphrody/m3-react/wrappers/progress";
import { MdElevatedCard, MdFilledCard, MdOutlinedCard } from "@aphrody/m3-react/wrappers/labs";
import { MdList, MdListItem } from "@aphrody/m3-react/wrappers/list";
import { MdDivider } from "@aphrody/m3-react/wrappers/divider";
import { MdIconButton } from "@aphrody/m3-react/wrappers/iconbutton";
import { MdFab } from "@aphrody/m3-react/wrappers/fab";
import { MdTabs, MdPrimaryTab } from "@aphrody/m3-react/wrappers/tabs";
import { Icon } from "../shell/icons";
// The authoritative list of the 120 md-* elements wrapped by @aphrody/m3-react.
import elementList from "../../../../packages/aphrody-migrated/m3/aphrody-m3/packages/m3-react/md-elements.txt" with { type: "text" };

const TAGS = elementList
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(line => line.startsWith("md-"));

function Demo({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="demo" aria-label={title}>
      <h3>{title}</h3>
      <div className="demo-row">{children}</div>
    </section>
  );
}

/** Which of the 120 elements the browser has registered, so the list tells the truth about this build. */
function Registry() {
  const [defined, setDefined] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  useEffect(() => {
    let cancelled = false;
    // The barrel registers every element as a side effect; it is large, so it loads only on this page.
    void import("@aphrody/m3-react").then(() => {
      if (!cancelled) setDefined(new Set(TAGS.filter(tag => customElements.get(tag))));
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const needle = filter.trim().toLowerCase();
  return (
    <section aria-labelledby="registry-title">
      <h2 id="registry-title">
        Les {TAGS.length} éléments <small>{defined.size ? `${defined.size} enregistrés dans ce navigateur` : "chargement…"}</small>
      </h2>
      <label className="search wide">
        <Icon name="search" />
        <span className="sr-only">Filtrer les éléments</span>
        <input type="search" value={filter} onChange={event => setFilter(event.target.value)} placeholder="navigation, slider, card…" />
      </label>
      <ul className="tag-grid">
        {TAGS.filter(tag => !needle || tag.includes(needle)).map(tag => (
          <li key={tag} data-defined={defined.has(tag) ? "yes" : defined.size ? "no" : "pending"}>
            <code>&lt;{tag}&gt;</code>
            <span>{defined.has(tag) ? "enregistré" : defined.size ? "non enregistré" : "…"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function M3Gallery() {
  const theme = useM3Theme();
  const [width, setWidth] = useState(() => innerWidth);
  useEffect(() => {
    const update = () => setWidth(innerWidth);
    addEventListener("resize", update);
    return () => removeEventListener("resize", update);
  }, []);
  const state = useMemo(() => platformState(width), [width]);
  const [tab, setTab] = useState(0);
  const [text, setText] = useState("");
  const [volume, setVolume] = useState(40);
  return (
    <section className="page gallery" aria-labelledby="m3-title">
      <header className="page-head">
        <p className="eyebrow">Material 3</p>
        <h1 id="m3-title">Composants, thème et mise en page adaptative</h1>
        <p className="lede">
          Chaque contrôle ci-dessous est un élément <code>md-*</code> de <code>@aphrody/m3-react</code>, coloré par le thème courant ({theme.seedColor}, {theme.resolvedTheme}, contraste {theme.contrastLevel}).
        </p>
      </header>
      <dl className="facts" aria-label="Contrat de plateforme">
        <dt>Largeur</dt>
        <dd>{width} dp</dd>
        <dt>Classe de fenêtre</dt>
        <dd>{state.sizeClass}</dd>
        <dt>Navigation</dt>
        <dd>{state.navigation}</dd>
        <dt>Panneaux</dt>
        <dd>{state.panes}</dd>
        <dt>Marge</dt>
        <dd>{state.marginDp} dp</dd>
      </dl>
      <Demo title="Boutons">
        <MdFilledButton>Rempli</MdFilledButton>
        <MdFilledTonalButton>Tonal</MdFilledTonalButton>
        <MdOutlinedButton>Contour</MdOutlinedButton>
        <MdElevatedButton>Élevé</MdElevatedButton>
        <MdTextButton>Texte</MdTextButton>
        <MdIconButton aria-label="Ajouter">
          <Icon name="add" />
        </MdIconButton>
        <MdFab aria-label="Lire">
          <span slot="icon">
            <Icon name="play" />
          </span>
        </MdFab>
      </Demo>
      <Demo title="Puces">
        <MdChipSet>
          <MdAssistChip label="Assistance" />
          <MdFilterChip label="Filtre" />
          <MdInputChip label="Saisie" />
          <MdSuggestionChip label="Suggestion" />
        </MdChipSet>
      </Demo>
      <Demo title="Sélection">
        <label className="inline">
          <MdSwitch aria-label="Interrupteur" /> Interrupteur
        </label>
        <label className="inline">
          <MdCheckbox aria-label="Case à cocher" /> Case
        </label>
        <label className="inline">
          <MdRadio name="demo" aria-label="Option A" /> A
        </label>
        <label className="inline">
          <MdRadio name="demo" aria-label="Option B" /> B
        </label>
      </Demo>
      <Demo title="Curseur et progression">
        <MdSlider className="demo-slider" min={0} max={100} value={volume} labeled aria-label="Volume" onInput={(event: Event) => setVolume(Number((event.target as HTMLInputElement).value))} />
        <output>{volume}</output>
        <MdCircularProgress indeterminate aria-label="Chargement" />
        <MdLinearProgress className="demo-progress" value={volume / 100} aria-label="Progression" />
      </Demo>
      <Demo title="Champs de texte">
        <MdOutlinedTextField label="Contour" value={text} onInput={(event: Event) => setText((event.target as HTMLInputElement).value)} />
        <MdFilledTextField label="Rempli" supportingText="Texte d’aide" />
      </Demo>
      <Demo title="Cartes">
        <MdElevatedCard className="demo-card">
          <p>Élevée</p>
        </MdElevatedCard>
        <MdFilledCard className="demo-card">
          <p>Remplie</p>
        </MdFilledCard>
        <MdOutlinedCard className="demo-card">
          <p>Contour</p>
        </MdOutlinedCard>
      </Demo>
      <Demo title="Liste et onglets">
        <MdList className="demo-list">
          <MdListItem>
            <div slot="headline">Premier élément</div>
            <div slot="supporting-text">Ligne d’appui</div>
          </MdListItem>
          <MdDivider />
          <MdListItem>
            <div slot="headline">Deuxième élément</div>
            <div slot="supporting-text">Ligne d’appui</div>
          </MdListItem>
        </MdList>
        <MdTabs activeTabIndex={tab} onChange={(event: Event) => setTab((event.target as unknown as { activeTabIndex: number }).activeTabIndex)}>
          <MdPrimaryTab>Un</MdPrimaryTab>
          <MdPrimaryTab>Deux</MdPrimaryTab>
          <MdPrimaryTab>Trois</MdPrimaryTab>
        </MdTabs>
      </Demo>
      <Registry />
    </section>
  );
}
