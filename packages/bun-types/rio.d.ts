declare module "bun" {
  interface RioTerminalOptions {
    /** Number of columns, from 1 to 4096. Defaults to 80. */
    cols?: number;
    /** Number of rows, from 1 to 4096. Defaults to 24. */
    rows?: number;
    /** Number of rows retained above the visible screen, from 0 to 1,000,000. Defaults to 1000. */
    scrollback?: number;
  }

  /** Rio-backed virtual terminal screen. It does not spawn a process. */
  class RioTerminal {
    constructor(options?: RioTerminalOptions);
    /** Consume UTF-8 terminal output and return its byte count. Partial UTF-8 and escape sequences survive between writes. */
    write(data: string | BufferSource): number;
    /** Resize to integer dimensions from 1 to 4096, preserving and reflowing existing content. */
    resize(cols: number, rows: number): void;
    /** Clear both screens, scrollback, title, pending replies and partial input; preserve dimensions and scrollback limit. */
    reset(): void;
    /** Read rows joined by LF, optionally including retained scrollback. Does not drain replies or consume screen content. */
    text(options?: { scrollback?: boolean }): string;
    /** Return the complete grapheme at integer coordinates inside the visible screen; wide-character spacer cells return an empty string. */
    cellText(col: number, row: number): string;
    /**
     * Return an independent snapshot of cols * rows * 4 words in row-major order:
     * codepoint, foreground, background, and flags. Named colors use Rio's
     * color discriminants; indexed colors are 0x01000000 | index; RGB colors
     * are 0x02000000 | 0xRRGGBB. Flags contain SGR flags in bits 0-15, cell
     * flags in bits 16-23, and display width in bits 24-25 (0 spacer, 1 narrow,
     * 2 wide).
     */
    cells(): Uint32Array;
    /** Return and clear queued terminal query responses. Returns an empty string when no responses are queued. */
    takeReplies(): string;

    readonly cols: number;
    readonly rows: number;
    readonly cursor: { col: number; row: number; visible: boolean };
    readonly title: string;
    readonly alternateScreen: boolean;
  }
}

declare module "bun:rio" {
  export { RioTerminal as Terminal } from "bun";
  export type { RioTerminalOptions as TerminalOptions } from "bun";
}
