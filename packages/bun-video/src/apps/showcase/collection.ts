export type ShowcaseEngine = "remotion" | "hyperframes" | "filmcraft" | "native";
export type Artwork = "orbit" | "type" | "terrain" | "wave" | "grid" | "bloom";
export interface ShowcaseWork {
  id: string;
  title: string;
  description: string;
  engine: ShowcaseEngine;
  artwork: Artwork;
  palette: readonly [string, string, string];
  features: readonly string[];
  durationFrames: number;
  fps: { num: number; den: number };
  width: number;
  height: number;
  preview?: string;
  mediaType?: "image" | "audio";
  video?: string;
  captions?: string;
  seed?: string;
  code?: string;
  sourceRef?: string;
  chapter?: string;
}

const palettes = {
  blue: ["#080f27", "#4268ff", "#a1f2ff"],
  coral: ["#2b1018", "#ff675e", "#ffdfb5"],
  green: ["#091e1a", "#48dca0", "#e7ffc3"],
  violet: ["#1d1236", "#b898ff", "#ffcfeb"],
  gold: ["#211a0b", "#e9b74d", "#fff1bb"],
  ice: ["#071c25", "#3dd3dc", "#daf9fa"],
} as const;
type Brief = readonly [string, string, string, Artwork, keyof typeof palettes, readonly string[]];
const briefs: readonly Brief[] = [
  [
    "orbital",
    "Orbital",
    "Une chorégraphie de trajectoires et de lumière.",
    "orbit",
    "blue",
    ["interpolation", "easing", "SVG", "rational-fps"],
  ],
  [
    "mot-mouvement",
    "Le mot devient mouvement",
    "Une affiche typographique qui se déploie dans le temps.",
    "type",
    "coral",
    ["typography", "spring", "layering"],
  ],
  [
    "relief",
    "Relief",
    "Des lignes de niveau dessinent un paysage en évolution.",
    "terrain",
    "green",
    ["paths", "stagger", "deterministic-seek"],
  ],
  [
    "frequences",
    "Fréquences",
    "Un paysage de signaux, composé sans hasard.",
    "wave",
    "ice",
    ["waveform", "procedural", "frame-timing"],
  ],
  [
    "architecture",
    "Architecture du rythme",
    "Des modules géométriques composent une partition visuelle.",
    "grid",
    "gold",
    ["sequences", "transforms", "repetition"],
  ],
  [
    "floraison",
    "Floraison",
    "Une étude de symétrie, de rotation et de profondeur.",
    "bloom",
    "violet",
    ["opacity", "rotation", "compositing"],
  ],
];

/** Each engine gets the same authored scene and cadence for measured comparisons. */
export const collection: readonly ShowcaseWork[] = (["remotion", "hyperframes"] as const).flatMap(engine =>
  briefs.map(([id, title, description, artwork, palette, features]) => ({
    id: `${engine}-${id}`,
    title,
    description,
    engine,
    artwork,
    palette: palettes[palette],
    features,
    durationFrames: 144,
    fps: { num: 24, den: 1 },
    width: 1280,
    height: 720,
  })),
);

export interface ShowcaseAsset {
  file: string;
  bytes: number;
  sha256: string;
  mime: string;
}
export interface ShowcaseEvidence {
  id: string;
  status: "passed" | "failed" | "unavailable";
  scope: string;
  detail: string;
  assets: ShowcaseAsset[];
  measurements?: Record<string, unknown>;
}
export interface ShowcaseManifest {
  schema: "bun-video/showcase/v1";
  generatedAt: string;
  sourceRevision: string;
  runtime: { version: string; revision: string; platform: string };
  works: Array<ShowcaseWork & { poster?: string; frames?: string[]; evidence: string[] }>;
  evidence: ShowcaseEvidence[];
  apis: Array<{ id: string; description: string; scope: string }>;
}
