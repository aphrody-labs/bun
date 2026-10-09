declare module "symbol:*" {
  /** SVG markup of the Material Symbol. */
  const svg: string;
  export default svg;
  /** The CDN URL the SVG came from. */
  export const url: string;
}

declare module "*.ico" {
  /** The largest entry as a `data:image/png;base64,…` URL. */
  const src: string;
  export default src;
  export const entries: { width: number; height: number; bits: number; png: boolean }[];
  /** Data URL of the smallest entry covering `px`, else the largest. */
  export function best(px: number): string;
}

declare module "*.cur" {
  const src: string;
  export default src;
  export const entries: { width: number; height: number; bits: number; png: boolean }[];
  export function best(px: number): string;
}
