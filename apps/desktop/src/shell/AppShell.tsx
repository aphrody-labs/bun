// SPDX-License-Identifier: Apache-2.0
import React, { useEffect, useRef, useState } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { hostAccessQuery } from "../lib/api";
import { classifyWidth, navigationFor } from "@aphrody/m3-tokens/breakpoints";
import { useM3Theme, type SchemeVariant, type ThemeMode } from "@aphrody/m3-theme/react";
import { useWindowSizeClass } from "@aphrody/m3-react/adaptive";
import { MdNavigationRail, MdNavigationRailItem } from "@aphrody/m3-react/wrappers/navigationrail";
import { MdNavigationBar, MdNavigationTab } from "@aphrody/m3-react/wrappers/labs";
import { MdIconButton } from "@aphrody/m3-react/wrappers/iconbutton";
import { activeDestination, DESTINATIONS } from "./destinations";
import { Icon } from "./icons";

const SEEDS: readonly { name: string; seed: string }[] = [
  { name: "Aphrody", seed: "#3186ff" },
  { name: "Bun", seed: "#f4722b" },
  { name: "Baseline", seed: "#6750a4" },
  { name: "Rose", seed: "#e91e63" },
  { name: "Forêt", seed: "#2e7d32" },
];
const MODES: readonly { value: ThemeMode; label: string }[] = [
  { value: "system", label: "Système" },
  { value: "dark", label: "Sombre" },
  { value: "light", label: "Clair" },
];
const VARIANTS: readonly { value: SchemeVariant; label: string }[] = [
  { value: "tonalSpot", label: "Équilibré" },
  { value: "vibrant", label: "Vibrant" },
  { value: "expressive", label: "Expressif" },
  { value: "neutral", label: "Neutre" },
];
const CONTRASTS: readonly { value: number; label: string }[] = [
  { value: 0, label: "Standard" },
  { value: 0.5, label: "Moyen" },
  { value: 1, label: "Élevé" },
];

function ThemePanel() {
  const theme = useM3Theme();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setOpen(false);
      } else if (panel.current && !panel.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const group = <T extends string | number>(
    legend: string,
    items: readonly { value: T; label: string }[],
    current: T,
    set: (value: T) => void,
  ) => (
    <fieldset>
      <legend>{legend}</legend>
      {items.map(item => (
        <button key={String(item.value)} type="button" className="choice" aria-pressed={item.value === current} onClick={() => set(item.value)}>
          {item.label}
        </button>
      ))}
    </fieldset>
  );
  return (
    <div className="theme-panel" ref={panel}>
      <MdIconButton aria-label="Thème et couleurs" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        <Icon name="contrast" />
      </MdIconButton>
      {open && (
        <div className="theme-card" role="dialog" aria-label="Thème et couleurs">
          {group("Mode", MODES, theme.themeMode, theme.setThemeMode)}
          <fieldset>
            <legend>Couleur d’accent</legend>
            {SEEDS.map(item => (
              <button
                key={item.seed}
                type="button"
                className="swatch"
                style={{ "--swatch": item.seed } as React.CSSProperties}
                aria-pressed={theme.seedColor.toLowerCase() === item.seed}
                aria-label={item.name}
                title={item.name}
                onClick={() => theme.setSeedColor(item.seed)}
              />
            ))}
          </fieldset>
          {group("Palette", VARIANTS, theme.variant, theme.setVariant)}
          {group("Contraste", CONTRASTS, theme.contrastLevel, theme.setContrastLevel)}
        </div>
      )}
    </div>
  );
}

/** Adaptive M3 shell: rail from 600 dp, bottom bar below, a skip link, and focus moved to the content on navigation. */
export function AppShell() {
  // The real width from the first render: the default size class would mount the compact bar first.
  const sizeClass = useWindowSizeClass(classifyWidth(window.innerWidth));
  const navigation = navigationFor(sizeClass);
  const pathname = useRouterState({ select: state => state.location.pathname });
  const search = useRouterState({ select: state => state.location.searchStr });
  const navigate = useNavigate();
  const main = useRef<HTMLElement>(null);
  const [query, setQuery] = useState("");
  const hostAccess = useQuery(hostAccessQuery).data?.hostAccess ?? true;
  const destinations = DESTINATIONS.filter(item => item.to !== "/os" || hostAccess);
  const current = activeDestination(pathname);
  const index = Math.max(
    0,
    destinations.findIndex(item => item.to === current),
  );

  // After a route change, put focus on the content so keyboard and screen-reader users land on it.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    main.current?.focus({ preventScroll: true });
    main.current?.scrollTo({ top: 0 });
  }, [pathname]);

  // Navigation elements also announce programmatic selection (their value and index are set from the route), so
  // only a pointer or key press on them counts as the user choosing a destination.
  const intent = useRef(false);
  const markIntent = () => {
    intent.current = true;
    window.setTimeout(() => (intent.current = false), 600);
  };
  const go = (to: string) => {
    if (!intent.current) return;
    const destination = destinations.find(item => item.to === to);
    if (!destination) return;
    if (destination.external) location.assign(to);
    else void navigate({ to });
  };
  void search;

  return (
    <div className="shell" data-nav={navigation} data-size={sizeClass}>
      <a className="skip-link" href="#main">
        Passer au contenu
      </a>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Aphrody, accueil">
          <span className="brand-mark" aria-hidden="true">
            A
          </span>
          <span className="brand-name">Aphrody</span>
        </Link>
        <form
          className="search"
          role="search"
          onSubmit={event => {
            event.preventDefault();
            void navigate({ to: "/video", search: { q: query || undefined } });
          }}
        >
          <Icon name="search" />
          <label className="sr-only" htmlFor="shell-search">
            Rechercher un film
          </label>
          <input id="shell-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher un film, un moteur…" />
        </form>
        <ThemePanel />
      </header>
      {navigation !== "bar" && (
        <MdNavigationRail className="rail" onPointerDown={markIntent} onKeyDown={markIntent} expanded={navigation === "rail-expanded"} value={current} onChange={(event: Event) => go((event as CustomEvent<{ value: string }>).detail.value)}>
          {destinations.map(item => (
            <MdNavigationRailItem key={item.to} value={item.to} label={item.label} aria-label={item.label}>
              <Icon name={item.icon} />
            </MdNavigationRailItem>
          ))}
        </MdNavigationRail>
      )}
      <main id="main" className="content" ref={main} tabIndex={-1}>
        <Outlet />
      </main>
      {navigation === "bar" && (
        <MdNavigationBar
          className="bottom-bar"
          onPointerDown={markIntent}
          onKeyDown={markIntent}
          activeIndex={index}
          onActivated={(event: Event) => go(destinations[(event as CustomEvent<{ activeIndex: number }>).detail.activeIndex]?.to ?? "/")}
        >
          {destinations.slice(0, 5).map(item => (
            <MdNavigationTab key={item.to} label={item.label}>
              <Icon name={item.icon} />
            </MdNavigationTab>
          ))}
        </MdNavigationBar>
      )}
    </div>
  );
}
