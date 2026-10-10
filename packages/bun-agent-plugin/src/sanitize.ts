// Makes agent memory fiches safe to ship: no personal paths, hosts, addresses, accounts or tokens.
// Paths become placeholders (`~`, `<bun>`, `<name>` for a drive-root directory); lines naming a host, an address,
// an account or a credential are dropped; links to fiches that are not shipped are removed.

const DROP = [
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/, // IPv4
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/, // e-mail
  /\bdbfr\b/i,
  /\bvps\b/i,
  /\byohan/i,
  /_auth(?:Token)?\s*=/,
  /\b(?:npm|crates\.io|gh|github|api|auth|buildkite|discord|bot)[ _-]?tokens?\b/i,
  /\btoken (?:in|from|=)/i,
  /\bpassword\s*[:=]\s*["'\w]/i,
  /\bssh\s+(?:-\S+\s+)*[\w.-]+@/i,
  /\bghp_|\bgithub_pat_|\bnpm_[A-Za-z0-9]{20}/,
  /^\s*originSessionId:/,
];

/** What must never appear in shipped text; the generator refuses its output when one matches. */
export const FORBIDDEN: RegExp[] = [
  /[A-Za-z]:(?:\\\\|\\|\/)+Users(?:\\\\|\\|\/)/i,
  /\/home\/[a-z_][\w-]*\//,
  /\/Users\/[a-z_][\w-]*\//,
  /\baphro\b/i,
  /\byohan/i,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
  /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i,
  /\bghp_\w|\bgithub_pat_\w|\bnpm_[A-Za-z0-9]{20}/,
  /_auth(?:Token)?\s*=\s*\S/,
];

export type SanitizeOptions = {
  /** Fiche names that ship; links to others are removed. */
  shipped?: (name: string) => boolean;
  /** Drop the lines that name a host, an account or a credential (notes); off for files already public. */
  drop?: boolean;
};

const SEP = String.raw`(?:\\\\|\\|/)+`;

const WINDOWS_HOME_PATH = new RegExp(String.raw`(?<![\w/])[A-Za-z]:${SEP}Users${SEP}[^\\/\s"'\`)\]]+`, "g");

const WINDOWS_BUN_PATH = new RegExp(String.raw`(?<![\w/])[A-Za-z]:${SEP}bun(?![\w-])`, "gi");

const WINDOWS_ROOT_PATH = new RegExp(String.raw`(?<![\w/])[A-Za-z]:${SEP}([\w.-]+)`, "g");

export function sanitizeText(text: string, options: SanitizeOptions = {}): string {
  const { shipped, drop = true } = options;
  const out: string[] = [];
  for (let line of text.replace(/\r\n/g, "\n").split("\n")) {
    line = line
      .replace(WINDOWS_HOME_PATH, "~")
      .replace(/\/(?:home|Users)\/[a-z_][\w-]*(?=\/|\b)/g, "~")
      .replace(WINDOWS_BUN_PATH, "<bun>")
      .replace(WINDOWS_ROOT_PATH, "<$1>");
    if (shipped) {
      line = line.replace(/\[\[([\w.-]+)\]\]/g, (_, name: string) => (shipped(name) ? `\`${name}\`` : ""));
      line = line
        .replace(/\(\s*(?:voir|see|cf\.?)?\s*(?:[,;]\s*)*\)/gi, "")
        .replace(/,\s*(?:voir|see|cf\.?)?\s*\)/gi, ")")
        .replace(/\s*\b(?:voir|see|cf\.?)\s*(?=[.;,)]|$)/gi, "")
        .replace(/,\s*(?=[.;)]|$)/g, "")
        .replace(/ {2,}/g, " ");
    }
    if (drop && DROP.some(r => r.test(line))) continue;
    out.push(line);
  }
  return out.join("\n");
}

export function forbiddenIn(text: string): string | undefined {
  for (const r of FORBIDDEN) {
    const m = r.exec(text);
    if (m) {
      const lineStart = text.lastIndexOf("\n", m.index) + 1;
      const lineEnd = text.indexOf("\n", m.index);
      return `${r}: ${text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).slice(0, 160)}`;
    }
  }
  return undefined;
}
