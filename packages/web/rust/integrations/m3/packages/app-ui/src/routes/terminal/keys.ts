// SPDX-License-Identifier: Apache-2.0

const controlKeys: Record<string, string> = {
  ArrowDown: "\x1b[B",
  ArrowLeft: "\x1b[D",
  ArrowRight: "\x1b[C",
  ArrowUp: "\x1b[A",
  Backspace: "\x7f",
  Delete: "\x1b[3~",
  End: "\x1b[F",
  Enter: "\r",
  Escape: "\x1b",
  Home: "\x1b[H",
  PageDown: "\x1b[6~",
  PageUp: "\x1b[5~",
  Tab: "\t",
};

/** Convert a browser key event to the byte-oriented input expected by the WebOS terminal. */
export function keyToInput(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">): string | null {
  if (event.metaKey) return null;
  if (event.ctrlKey) {
    if (event.key.length !== 1) return null;
    const code = event.key.toUpperCase().charCodeAt(0);
    return code >= 64 && code <= 95 ? String.fromCharCode(code - 64) : null;
  }
  if (event.altKey) return event.key.length === 1 ? `\x1b${event.key}` : null;
  return controlKeys[event.key] ?? (event.key.length === 1 ? event.key : null);
}
