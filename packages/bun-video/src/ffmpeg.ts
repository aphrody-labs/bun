import { CString, dlopen, ptr, type FFIFunction } from "bun:ffi";
import { dirname, isAbsolute, join } from "node:path";

const functionABI = <
  const A extends NonNullable<FFIFunction["args"]>,
  const R extends NonNullable<FFIFunction["returns"]>,
>(
  args: A,
  returns: R,
) => ({ args, returns });
const p = "ptr";
const i = "i32";
const v = "void";

export const ffmpegABI = {
  avutil: {
    avutil_version: functionABI([], "u32"),
    av_version_info: functionABI([], p),
    av_strerror: functionABI([i, p, "u64"], i),
    av_malloc: functionABI(["u64"], p),
    av_free: functionABI([p], v),
    av_frame_alloc: functionABI([], p),
    av_frame_free: functionABI([p], v),
    av_frame_unref: functionABI([p], v),
    av_frame_get_buffer: functionABI([p, i], i),
    av_frame_make_writable: functionABI([p], i),
    av_dict_set: functionABI([p, p, p, i], i),
    av_dict_free: functionABI([p], v),
    av_opt_set: functionABI([p, p, p, i], i),
    av_opt_set_int: functionABI([p, p, "i64", i], i),
    av_hwdevice_ctx_create: functionABI([p, i, p, p, i], i),
    av_hwframe_transfer_data: functionABI([p, p, i], i),
  },
  avcodec: {
    avcodec_version: functionABI([], "u32"),
    avcodec_find_decoder: functionABI([i], p),
    avcodec_find_encoder: functionABI([i], p),
    avcodec_find_decoder_by_name: functionABI([p], p),
    avcodec_find_encoder_by_name: functionABI([p], p),
    avcodec_alloc_context3: functionABI([p], p),
    avcodec_free_context: functionABI([p], v),
    avcodec_open2: functionABI([p, p, p], i),
    avcodec_parameters_to_context: functionABI([p, p], i),
    avcodec_parameters_from_context: functionABI([p, p], i),
    avcodec_send_packet: functionABI([p, p], i),
    avcodec_receive_frame: functionABI([p, p], i),
    avcodec_send_frame: functionABI([p, p], i),
    avcodec_receive_packet: functionABI([p, p], i),
    avcodec_flush_buffers: functionABI([p], v),
    av_packet_alloc: functionABI([], p),
    av_packet_free: functionABI([p], v),
    av_packet_unref: functionABI([p], v),
    av_codec_iterate: functionABI([p], p),
  },
  avformat: {
    avformat_version: functionABI([], "u32"),
    avformat_network_init: functionABI([], i),
    avformat_open_input: functionABI([p, p, p, p], i),
    avformat_find_stream_info: functionABI([p, p], i),
    avformat_close_input: functionABI([p], v),
    av_read_frame: functionABI([p, p], i),
    av_seek_frame: functionABI([p, i, "i64", i], i),
    avformat_alloc_output_context2: functionABI([p, p, p, p], i),
    avformat_new_stream: functionABI([p, p], p),
    avformat_write_header: functionABI([p, p], i),
    av_interleaved_write_frame: functionABI([p, p], i),
    av_write_trailer: functionABI([p], i),
    avformat_free_context: functionABI([p], v),
    avio_open: functionABI([p, p, i], i),
    avio_closep: functionABI([p], i),
  },
  avfilter: {
    avfilter_version: functionABI([], "u32"),
    avfilter_graph_alloc: functionABI([], p),
    avfilter_graph_free: functionABI([p], v),
    avfilter_graph_parse_ptr: functionABI([p, p, p, p, p], i),
    avfilter_graph_config: functionABI([p, p], i),
    av_buffersrc_add_frame_flags: functionABI([p, p, i], i),
    av_buffersink_get_frame: functionABI([p, p], i),
  },
  swscale: {
    swscale_version: functionABI([], "u32"),
    sws_getContext: functionABI([i, i, i, i, i, i, i, p, p, p], p),
    sws_scale: functionABI([p, p, p, i, i, p, p], i),
    sws_freeContext: functionABI([p], v),
  },
  swresample: {
    swresample_version: functionABI([], "u32"),
    swr_alloc: functionABI([], p),
    swr_alloc_set_opts2: functionABI([p, p, i, i, p, i, i, i, p], i),
    swr_init: functionABI([p], i),
    swr_convert: functionABI([p, p, i, p, i], i),
    swr_get_delay: functionABI([p, "i64"], "i64"),
    swr_free: functionABI([p], v),
  },
} as const;

export type FFmpegComponent = keyof typeof ffmpegABI;
export const ffmpegMajors = {
  avutil: 61,
  avcodec: 63,
  avformat: 63,
  avfilter: 12,
  swscale: 10,
  swresample: 7,
} as const;

export function ffmpegLibraryPath(component: FFmpegComponent, directory = dirname(process.execPath)): string {
  if (!isAbsolute(directory)) throw new TypeError("FFmpeg library directory must be absolute");
  const major = ffmpegMajors[component];
  const name =
    process.platform === "win32"
      ? `${component}-${major}.dll`
      : process.platform === "darwin"
        ? `lib${component}.${major}.dylib`
        : `lib${component}.so.${major}`;
  return join(directory, name);
}

export function openFFmpegComponent<C extends FFmpegComponent>(component: C, directory?: string) {
  return dlopen(ffmpegLibraryPath(component, directory), ffmpegABI[component]);
}

type FFmpegLibrary<C extends FFmpegComponent> = ReturnType<typeof openFFmpegComponent<C>>;
type FFmpegLibraries = { [C in FFmpegComponent]: FFmpegLibrary<C> };

export class FFmpeg {
  readonly #libraries: FFmpegLibraries;
  #closed = false;

  private constructor(libraries: FFmpegLibraries) {
    this.#libraries = libraries;
  }

  static open(directory?: string): FFmpeg {
    const libraries: Partial<FFmpegLibraries> = {};
    const owned: Array<{ close(): void }> = [];
    try {
      for (const component of Object.keys(ffmpegABI) as FFmpegComponent[]) {
        const library = openFFmpegComponent(component, directory);
        owned.push(library);
        const version = (library.symbols as Record<string, (...args: never[]) => unknown>)[`${component}_version`]();
        if (typeof version !== "number" || version >>> 16 !== ffmpegMajors[component])
          throw new Error(`FFmpeg ${component} ABI mismatch: expected major ${ffmpegMajors[component]}`);
        Object.assign(libraries, { [component]: library });
      }
      return new FFmpeg(libraries as FFmpegLibraries);
    } catch (error) {
      for (const library of owned.reverse()) library.close();
      throw error;
    }
  }

  get libraries(): Readonly<FFmpegLibraries> {
    if (this.#closed) throw new Error("FFmpeg is closed");
    return this.#libraries;
  }

  check(status: number): number {
    if (status >= 0) return status;
    const bytes = new Uint8Array(256);
    const code = this.libraries.avutil.symbols.av_strerror(status, ptr(bytes), BigInt(bytes.length));
    const detail = code < 0 ? String(status) : new CString(ptr(bytes)).toString();
    throw new Error(`FFmpeg: ${detail} (${status})`);
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const library of Object.values(this.#libraries).reverse()) library.close();
  }

  [Symbol.dispose](): void {
    this.close();
  }
}
