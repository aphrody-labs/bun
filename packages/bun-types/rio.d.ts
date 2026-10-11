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
    /** Feed terminal output bytes or text to the screen. */
    write(data: string | BufferSource): number;
    /** Resize the visible screen. */
    resize(cols: number, rows: number): void;
    /** Clear screen state and scrollback. */
    reset(): void;
    /** Read rendered text, optionally including scrollback. */
    text(options?: { scrollback?: boolean }): string;
    /** Return the full grapheme stored at a visible, zero-based cell position. */
    cellText(col: number, row: number): string;
    /**
     * Read visible cells in row-major order as four words per cell:
     * codepoint, foreground, background, and flags. Named colors use Rio's
     * color discriminants; indexed colors are 0x01000000 | index; RGB colors
     * are 0x02000000 | 0xRRGGBB. Flags contain SGR flags in bits 0-15, cell
     * flags in bits 16-23, and display width in bits 24-25 (0 spacer, 1 narrow,
     * 2 wide).
     */
    cells(): Uint32Array;
    /** Drain responses to terminal query sequences. */
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
