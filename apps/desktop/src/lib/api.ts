// SPDX-License-Identifier: Apache-2.0
import { queryOptions } from "@tanstack/react-query";

export interface VideoWork {
  id: string;
  title: string;
  description: string;
  engine: "remotion" | "hyperframes" | "filmcraft" | "native";
  features: string[];
  durationFrames: number;
  fps: { num: number; den: number };
  width: number;
  height: number;
  video: string;
  poster?: string;
  captions?: string;
  chapter?: string;
  evidence: string[];
}

export interface ApiFamily {
  id: string;
  module?: string;
  description: string;
  scope: "protocol" | "acquisition" | "render" | "native" | "catalog" | "service";
}

export interface Capabilities {
  runtime?: { version?: string; revision?: string; platform?: string; arch?: string };
  apiFamilies: ApiFamily[];
  integrations?: {
    filmcraft?: { providerAvailable?: boolean; decoder?: string; backend?: string };
    remotion?: { version?: string };
    hyperframes?: { version?: string };
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** GET JSON from the same origin. Host routes answer 403 outside the loopback WebOS page. */
export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  if (response.status === 403) throw new ApiError("Accès refusé : cette route n’est ouverte qu’à la page locale.", 403);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error ?? `Erreur ${response.status}`, response.status);
  }
  return (await response.json()) as T;
}

export const worksQuery = queryOptions({
  queryKey: ["video", "works"],
  queryFn: async ({ signal }) => (await getJson<{ works: VideoWork[] }>("/api/video/works", signal)).works,
  staleTime: 30_000,
});

export const capabilitiesQuery = queryOptions({
  queryKey: ["capabilities"],
  queryFn: ({ signal }) => getJson<Capabilities>("/api/capabilities", signal),
  staleTime: 60_000,
  retry: false,
});

/** Whether this server lets the page use the desktop: false on a public deployment (no terminal, files or eval). */
export const hostAccessQuery = queryOptions({
  queryKey: ["webos", "capabilities"],
  queryFn: ({ signal }) => getJson<{ hostAccess: boolean }>("/api/webos/capabilities", signal),
  staleTime: 60_000,
  retry: false,
});

export const seconds = (work: VideoWork) => (work.durationFrames * work.fps.den) / work.fps.num;

export function clock(value: number): string {
  const total = Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

export const ENGINE_LABEL: Record<VideoWork["engine"], string> = {
  remotion: "Remotion",
  hyperframes: "HyperFrames",
  filmcraft: "FilmCraft",
  native: "Bun natif",
};

export const ENGINE_BLURB: Record<VideoWork["engine"], string> = {
  remotion: "Des compositions React, rendues image par image.",
  hyperframes: "Des scènes HTML pilotées par une timeline GSAP.",
  filmcraft: "Le décodage et l’encodage natifs de Bun.",
  native: "Bun.Video et Bun.Image, sans dépendance externe.",
};
