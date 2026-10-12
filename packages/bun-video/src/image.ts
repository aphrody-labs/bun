export type BunImageFormat = "jpeg" | "png" | "webp" | "avif" | "heic";

export interface ImageTransformOptions {
  readonly width?: number;
  readonly height?: number;
  readonly format?: BunImageFormat;
  readonly quality?: number;
}

/** Use Bun.Image for bounded video thumbnails and frame assets. */
export async function transformImage(
  input: string | ArrayBuffer | Blob,
  options: ImageTransformOptions = {},
): Promise<Uint8Array> {
  const image = new Bun.Image(input);
  if (options.width !== undefined) image.resize(options.width, options.height);
  switch (options.format) {
    case "jpeg":
      image.jpeg(options.quality === undefined ? undefined : { quality: options.quality });
      break;
    case "png":
      image.png();
      break;
    case "webp":
      image.webp(options.quality === undefined ? undefined : { quality: options.quality });
      break;
    case "avif":
      image.avif(options.quality === undefined ? undefined : { quality: options.quality });
      break;
    case "heic":
      image.heic(options.quality === undefined ? undefined : { quality: options.quality });
      break;
  }
  return await image.bytes();
}
