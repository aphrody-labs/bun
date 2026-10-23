// SPDX-License-Identifier: Apache-2.0
import type { IconName } from "./icons";

export interface Destination {
  to: string;
  label: string;
  icon: IconName;
  /** Server-rendered site section (full page load) rather than a client route. */
  external?: boolean;
}

/** Top-level destinations of the unified app, in navigation order. */
export const DESTINATIONS: readonly Destination[] = [
  { to: "/", label: "Accueil", icon: "home" },
  { to: "/video", label: "Vidéo", icon: "video" },
  { to: "/os", label: "Bureau", icon: "os" },
  { to: "/tools", label: "Outils", icon: "tools" },
  { to: "/m3", label: "Material 3", icon: "m3" },
  { to: "https://aphrody.app/docs", label: "Docs", icon: "docs", external: true },
];

/** The destination a path belongs to ("/video/watch" belongs to "/video"). */
export function activeDestination(pathname: string): string {
  if (pathname === "/") return "/";
  return DESTINATIONS.find(item => item.to !== "/" && (pathname === item.to || pathname.startsWith(`${item.to}/`)))?.to ?? "";
}
