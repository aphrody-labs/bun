// Bibliothèque du client apk Windows natif (remplace pacman de MSYS2).
// Formats : APKINDEX v2 (apk index + abuild-sign, C:\aports\aphrody\scripts\publish.ts) et paquets .apk v2
// (trois flux gzip concaténés : signature, contrôle, données). Le format v3 (adb, `apk mkndx`) n'est pas lu :
// le dépôt aphrody 3.24 publie du v2.
import { createHash, createPublicKey, verify as rsaVerify } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, posix } from "node:path";
import zlib from "node:zlib";

export class ApkError extends Error {}

// ---------------------------------------------------------------------------------------------------------------
// gzip multi-membres

export interface GzipMember {
  /** Octets compressés du membre (en-tête et trailer compris). */
  raw: Uint8Array;
  /** Contenu décompressé. */
  data: Uint8Array;
}

function gzipHeaderLength(buf: Uint8Array, off: number): number {
  if (buf[off] !== 0x1f || buf[off + 1] !== 0x8b || buf[off + 2] !== 8) {
    throw new ApkError(`flux gzip invalide à l'octet ${off}`);
  }
  const flg = buf[off + 3];
  let p = off + 10;
  if (flg & 4) p += 2 + (buf[p] | (buf[p + 1] << 8));
  if (flg & 8) while (buf[p++] !== 0 && p < buf.length);
  if (flg & 16) while (buf[p++] !== 0 && p < buf.length);
  if (flg & 2) p += 2;
  if (p > buf.length) throw new ApkError("en-tête gzip tronqué");
  return p - off;
}

/** Découpe un fichier fait de membres gzip concaténés et vérifie CRC32/ISIZE de chacun. */
export function splitGzipMembers(input: Uint8Array): GzipMember[] {
  const buf = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  const members: GzipMember[] = [];
  let off = 0;
  while (off < buf.length) {
    const hlen = gzipHeaderLength(buf, off);
    const res = zlib.inflateRawSync(buf.subarray(off + hlen), { info: true } as zlib.ZlibOptions) as unknown as {
      buffer: Buffer;
      engine: { bytesWritten: number };
    };
    const end = off + hlen + res.engine.bytesWritten + 8;
    if (end > buf.length) throw new ApkError("membre gzip tronqué");
    const crc = buf.readUInt32LE(end - 8);
    const isize = buf.readUInt32LE(end - 4);
    if (crc !== zlib.crc32(res.buffer) >>> 0 || isize !== res.buffer.length >>> 0) {
      throw new ApkError(`CRC32/ISIZE gzip invalide (membre ${members.length})`);
    }
    members.push({ raw: buf.subarray(off, end), data: res.buffer });
    off = end;
  }
  return members;
}

// ---------------------------------------------------------------------------------------------------------------
// tar (ustar, pax, GNU longname). Les segments apk n'ont pas toujours de blocs de fin.

export type TarType = "file" | "dir" | "symlink" | "hardlink" | "other";
export interface TarEntry {
  name: string;
  type: TarType;
  mode: number;
  mtime: number;
  linkname: string;
  data: Uint8Array;
  pax: Record<string, string>;
}

const dec = new TextDecoder();
function cstr(b: Uint8Array, s: number, n: number): string {
  let e = s;
  while (e < s + n && b[e] !== 0) e++;
  return dec.decode(b.subarray(s, e));
}
function octal(b: Uint8Array, s: number, n: number): number {
  if (b[s] & 0x80) {
    let v = b[s] & 0x7f;
    for (let i = s + 1; i < s + n; i++) v = v * 256 + b[i];
    return v;
  }
  const t = cstr(b, s, n).trim();
  return t ? parseInt(t, 8) : 0;
}
function parsePax(b: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  let p = 0;
  while (p < b.length) {
    let sp = p;
    while (sp < b.length && b[sp] !== 0x20) sp++;
    const len = parseInt(dec.decode(b.subarray(p, sp)), 10);
    if (!len) break;
    const rec = dec.decode(b.subarray(sp + 1, p + len - 1));
    const eq = rec.indexOf("=");
    if (eq > 0) out[rec.slice(0, eq)] = rec.slice(eq + 1);
    p += len;
  }
  return out;
}

export function parseTar(b: Uint8Array): TarEntry[] {
  const out: TarEntry[] = [];
  let p = 0;
  let pax: Record<string, string> = {};
  let global: Record<string, string> = {};
  let longName: string | undefined;
  let longLink: string | undefined;
  while (p + 512 <= b.length) {
    const h = b.subarray(p, p + 512);
    if (h.every(x => x === 0)) break;
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
    if (sum !== octal(h, 148, 8)) throw new ApkError(`somme d'en-tête tar invalide à l'octet ${p}`);
    const size = octal(h, 124, 12);
    const flag = String.fromCharCode(h[156] || 0x30);
    const data = b.subarray(p + 512, p + 512 + size);
    if (data.length !== size) throw new ApkError("entrée tar tronquée");
    p += 512 + Math.ceil(size / 512) * 512;
    if (flag === "x") {
      pax = parsePax(data);
      continue;
    }
    if (flag === "g") {
      global = { ...global, ...parsePax(data) };
      continue;
    }
    if (flag === "L") {
      longName = cstr(data, 0, data.length);
      continue;
    }
    if (flag === "K") {
      longLink = cstr(data, 0, data.length);
      continue;
    }
    const prefix = dec.decode(h.subarray(257, 262)) === "ustar" ? cstr(h, 345, 155) : "";
    const attrs = { ...global, ...pax };
    let name = attrs.path ?? longName ?? (prefix ? `${prefix}/${cstr(h, 0, 100)}` : cstr(h, 0, 100));
    const linkname = attrs.linkpath ?? longLink ?? cstr(h, 157, 100);
    const type: TarType =
      flag === "0" || flag === "7"
        ? "file"
        : flag === "5"
          ? "dir"
          : flag === "2"
            ? "symlink"
            : flag === "1"
              ? "hardlink"
              : "other";
    if (type === "dir") name = name.replace(/\/+$/, "");
    out.push({
      name,
      type,
      mode: octal(h, 100, 8),
      mtime: attrs.mtime ? Math.floor(Number(attrs.mtime)) : octal(h, 136, 12),
      linkname,
      data,
      pax: attrs,
    });
    pax = {};
    longName = longLink = undefined;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Versions et dépendances (port de apk-tools src/version.c)

const V_EQUAL = 1,
  V_LESS = 2,
  V_GREATER = 4,
  V_FUZZY = 8;
const T = { INITIAL: 0, DIGIT: 1, LETTER: 2, SUFFIX: 3, SUFFIX_NO: 4, HASH: 5, REV: 6, END: 7, INVALID: 8 };
const SUFFIXES = ["alpha", "beta", "pre", "rc", "", "cvs", "svn", "git", "hg", "p"];
const SUFFIX_NONE = 4;

interface Tok {
  token: number;
  suffix: number;
  number: bigint;
  value: string;
}
class VerReader {
  t: Tok = { token: T.INITIAL, suffix: -1, number: 0n, value: "" };
  constructor(private s: string) {
    this.digits();
  }
  private digits() {
    const m = /^\d+/.exec(this.s);
    this.t.value = m ? m[0] : "";
    this.t.number = m ? BigInt(m[0]) : 0n;
    this.s = this.s.slice(this.t.value.length);
    if (!m) this.t.token = T.INVALID;
  }
  next() {
    const t = this.t;
    if (this.s.length === 0) return void (t.token = T.END);
    const c = this.s[0];
    if (c >= "a" && c <= "z") {
      if (t.token > T.DIGIT) return void (t.token = T.INVALID);
      t.value = c;
      t.token = T.LETTER;
      this.s = this.s.slice(1);
    } else if (c === "." || (c >= "0" && c <= "9")) {
      if (c === ".") {
        if (t.token > T.DIGIT) return void (t.token = T.INVALID);
        this.s = this.s.slice(1);
      }
      if (t.token === T.INITIAL || t.token === T.DIGIT) t.token = T.DIGIT;
      else if (t.token === T.SUFFIX) t.token = T.SUFFIX_NO;
      else return void (t.token = T.INVALID);
      this.digits();
    } else if (c === "_") {
      if (t.token > T.SUFFIX_NO) return void (t.token = T.INVALID);
      const m = /^[a-z]*/.exec(this.s.slice(1))![0];
      this.s = this.s.slice(1 + m.length);
      t.value = m;
      t.suffix = m ? SUFFIXES.indexOf(m) : -1;
      if (t.suffix < 0 || t.suffix === SUFFIX_NONE) return void (t.token = T.INVALID);
      t.token = T.SUFFIX;
    } else if (c === "~") {
      if (t.token >= T.HASH) return void (t.token = T.INVALID);
      const m = /^[0-9a-f]*/.exec(this.s.slice(1))![0];
      if (!m) return void (t.token = T.INVALID);
      this.s = this.s.slice(1 + m.length);
      t.value = m;
      t.token = T.HASH;
    } else if (c === "-") {
      if (t.token >= T.REV || !this.s.startsWith("-r")) return void (t.token = T.INVALID);
      this.s = this.s.slice(2);
      t.token = T.REV;
      this.digits();
    } else t.token = T.INVALID;
  }
}

function strSort(a: string, b: string): number {
  return a < b ? V_LESS : a > b ? V_GREATER : V_EQUAL;
}
function tokCmp(a: Tok, b: Tok): number {
  let x: bigint | number, y: bigint | number;
  switch (a.token) {
    case T.DIGIT:
    case T.INITIAL:
    case T.SUFFIX_NO:
    case T.REV:
      if (a.token === T.DIGIT && (a.value[0] === "0" || b.value[0] === "0")) return strSort(a.value, b.value);
      x = a.number;
      y = b.number;
      break;
    case T.LETTER:
      x = a.value.charCodeAt(0);
      y = b.value.charCodeAt(0);
      break;
    case T.SUFFIX:
      x = a.suffix;
      y = b.suffix;
      break;
    default:
      return strSort(a.value, b.value);
  }
  return x < y ? V_LESS : x > y ? V_GREATER : V_EQUAL;
}

function compareFuzzy(a: string, b: string, fuzzy: boolean): number {
  const ra = new VerReader(a),
    rb = new VerReader(b);
  for (; ra.t.token === rb.t.token && ra.t.token < T.END; ra.next(), rb.next()) {
    const r = tokCmp(ra.t, rb.t);
    if (r !== V_EQUAL) return r;
  }
  const ta = ra.t,
    tb = rb.t;
  if (ta.token === tb.token) return V_EQUAL;
  if (tb.token === T.END && fuzzy) return V_EQUAL;
  if (ta.token === T.SUFFIX && ta.suffix < SUFFIX_NONE) return V_LESS;
  if (tb.token === T.SUFFIX && tb.suffix < SUFFIX_NONE) return V_GREATER;
  if (ta.token > tb.token) return V_LESS;
  if (tb.token > ta.token) return V_GREATER;
  return V_EQUAL;
}

/** -1, 0, 1 comme un comparateur de tri. */
export function compareVersions(a: string, b: string): number {
  const r = compareFuzzy(a, b, false);
  return r === V_LESS ? -1 : r === V_GREATER ? 1 : 0;
}

export interface Dep {
  name: string;
  conflict: boolean;
  /** Masque V_* ; 0 = n'importe quelle version. */
  op: number;
  version?: string;
  raw: string;
}

export function parseDep(raw: string): Dep {
  const m = /^(!?)([^<>=~!\s]+)(?:([<>=~]+)(\S+))?$/.exec(raw);
  if (!m) throw new ApkError(`dépendance invalide : ${raw}`);
  let op = 0;
  for (const c of m[3] ?? "")
    op |= c === "<" ? V_LESS : c === ">" ? V_GREATER : c === "=" ? V_EQUAL : V_FUZZY | V_EQUAL;
  return { name: m[2], conflict: m[1] === "!", op, version: m[4], raw };
}

export function versionMatches(have: string | undefined, dep: Dep): boolean {
  if (dep.op === 0 || dep.version === undefined || dep.version.startsWith("Q")) return true;
  if (have === undefined) return false;
  return (compareFuzzy(have, dep.version, (dep.op & V_FUZZY) !== 0) & dep.op) !== 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Index et paquets

export interface Repo {
  /** Ligne telle qu'écrite par l'utilisateur. */
  spec: string;
  /** URL ou chemin de APKINDEX.tar.gz. */
  index: string;
  /** Préfixe des .apk. */
  base: string;
}

export interface Pkg {
  name: string;
  version: string;
  arch: string;
  size: number;
  installedSize: number;
  description: string;
  url: string;
  license: string;
  origin: string;
  maintainer: string;
  buildTime: number;
  commit: string;
  checksum: string;
  depends: string[];
  provides: string[];
  installIf: string[];
  providerPriority: number;
  repo?: Repo;
}

const FIELD: Record<string, keyof Pkg> = {
  C: "checksum",
  P: "name",
  V: "version",
  A: "arch",
  S: "size",
  I: "installedSize",
  T: "description",
  U: "url",
  L: "license",
  o: "origin",
  m: "maintainer",
  t: "buildTime",
  c: "commit",
  D: "depends",
  p: "provides",
  i: "installIf",
  k: "providerPriority",
};

export function emptyPkg(): Pkg {
  return {
    name: "",
    version: "",
    arch: "",
    size: 0,
    installedSize: 0,
    description: "",
    url: "",
    license: "",
    origin: "",
    maintainer: "",
    buildTime: 0,
    commit: "",
    checksum: "",
    depends: [],
    provides: [],
    installIf: [],
    providerPriority: 0,
  };
}

function setField(p: Pkg, k: string, v: string): boolean {
  const f = FIELD[k];
  if (!f) return false;
  const cur = p[f];
  if (Array.isArray(cur)) (p[f] as string[]) = v.split(/\s+/).filter(Boolean);
  else if (typeof cur === "number") (p[f] as number) = Number(v) || 0;
  else (p[f] as string) = v;
  return true;
}

export function pkgFields(p: Pkg): string[] {
  const out: string[] = [];
  for (const [k, f] of Object.entries(FIELD)) {
    const v = p[f];
    if (Array.isArray(v)) {
      if (v.length) out.push(`${k}:${v.join(" ")}`);
    } else if (v !== "" && v !== 0) out.push(`${k}:${v}`);
  }
  return out;
}

export function parseIndexText(text: string, repo?: Repo): Pkg[] {
  const pkgs: Pkg[] = [];
  for (const block of text.split(/\n\s*\n/)) {
    const p = emptyPkg();
    for (const line of block.split("\n")) {
      if (line.length > 2 && line[1] === ":") setField(p, line[0], line.slice(2));
    }
    if (p.name && p.version) {
      p.repo = repo;
      pkgs.push(p);
    }
  }
  return pkgs;
}

/** Vérifie la signature du premier membre gzip sur `signed` ; renvoie le nom de clé utilisé. */
export function verifySignature(
  sigMember: GzipMember,
  signed: Uint8Array,
  keysDir: string,
  what: string,
  allowUntrusted = false,
): string | undefined {
  const entries = parseTar(sigMember.data).filter(e => e.name.startsWith(".SIGN."));
  if (!entries.length) {
    if (allowUntrusted) return undefined;
    throw new ApkError(`${what} : aucune signature (.SIGN.*)`);
  }
  const algs: Record<string, string> = { RSA512: "sha512", RSA256: "sha256", RSA: "sha1" };
  const tried: string[] = [];
  for (const e of entries) {
    const m = /^\.SIGN\.(RSA512|RSA256|RSA)\.(.+)$/.exec(e.name);
    if (!m) continue;
    const keyFile = join(keysDir, m[2]);
    tried.push(m[2]);
    if (!existsSync(keyFile)) continue;
    const key = createPublicKey(readFileSync(keyFile));
    if (rsaVerify(algs[m[1]], signed, key, e.data)) return m[2];
    throw new ApkError(`${what} : signature ${m[1]} invalide pour la clé ${m[2]}`);
  }
  if (allowUntrusted) return undefined;
  throw new ApkError(`${what} : clé de signature inconnue (${tried.join(", ") || "aucune"}) dans ${keysDir}`);
}

export function readIndex(bytes: Uint8Array, keysDir: string, repo?: Repo, allowUntrusted = false): Pkg[] {
  const members = splitGzipMembers(bytes);
  const what = `index ${repo?.index ?? ""}`.trim();
  let body = members;
  const hasSig = parseTar(members[0].data).some(e => e.name.startsWith(".SIGN."));
  if (hasSig) {
    verifySignature(members[0], Buffer.concat(members.slice(1).map(m => m.raw)), keysDir, what, allowUntrusted);
    body = members.slice(1);
  } else if (!allowUntrusted) throw new ApkError(`${what} : non signé`);
  const entries = parseTar(Buffer.concat(body.map(m => m.data)));
  const idx = entries.find(e => e.name === "APKINDEX");
  if (!idx) throw new ApkError(`${what} : entrée APKINDEX absente`);
  return parseIndexText(dec.decode(idx.data), repo);
}

/** Décode C:/Z: (Q1/Q2 base64, X1/X2 hexadécimal) en { algorithme, octets }. */
export function decodeDigest(s: string): { alg: "sha1" | "sha256"; bytes: Buffer } | undefined {
  if (s.length < 3) return undefined;
  const bytes =
    s[0] === "Q" ? Buffer.from(s.slice(2), "base64") : s[0] === "X" ? Buffer.from(s.slice(2), "hex") : undefined;
  if (!bytes) return undefined;
  if (bytes.length === 20) return { alg: "sha1", bytes };
  if (bytes.length === 32) return { alg: "sha256", bytes };
  return undefined;
}

export function q1(data: Uint8Array): string {
  return "Q1" + createHash("sha1").update(data).digest("base64");
}

export interface OpenedPkg {
  pkginfo: Record<string, string[]>;
  scripts: Record<string, Uint8Array>;
  files: TarEntry[];
  signer?: string;
}

/** Vérifie (signature, C:, datahash, sommes par fichier) et ouvre un .apk v2. */
export function openApk(bytes: Uint8Array, keysDir: string, expected?: Pkg, allowUntrusted = false): OpenedPkg {
  const what = expected ? `${expected.name}-${expected.version}` : "paquet";
  if (expected?.size && bytes.length !== expected.size) {
    throw new ApkError(`${what} : taille ${bytes.length} ≠ ${expected.size} annoncée par l'index`);
  }
  const members = splitGzipMembers(bytes);
  let i = 0;
  let signer: string | undefined;
  if (parseTar(members[0].data).some(e => e.name.startsWith(".SIGN."))) {
    if (members.length < 3) throw new ApkError(`${what} : flux de contrôle ou de données absent`);
    signer = verifySignature(members[0], members[1].raw, keysDir, what, allowUntrusted);
    i = 1;
  } else if (!allowUntrusted) throw new ApkError(`${what} : non signé`);
  const control = members[i];
  if (expected?.checksum) {
    const d = decodeDigest(expected.checksum);
    if (!d) throw new ApkError(`${what} : somme C: illisible (${expected.checksum})`);
    if (!createHash(d.alg).update(control.raw).digest().equals(d.bytes)) {
      throw new ApkError(`${what} : somme de contrôle C: différente de l'index`);
    }
  }
  const pkginfo: Record<string, string[]> = {};
  const scripts: Record<string, Uint8Array> = {};
  for (const e of parseTar(control.data)) {
    if (e.name === ".PKGINFO") {
      for (const line of dec.decode(e.data).split("\n")) {
        const m = /^([a-z_]+) = (.*)$/.exec(line);
        if (m) (pkginfo[m[1]] ??= []).push(m[2]);
      }
    } else if (e.name.startsWith(".") && e.type === "file") scripts[e.name] = e.data;
  }
  const dataMembers = members.slice(i + 1);
  const dataRaw = Buffer.concat(dataMembers.map(m => m.raw));
  const datahash = pkginfo.datahash?.[0];
  if (datahash) {
    if (createHash("sha256").update(dataRaw).digest("hex") !== datahash) {
      throw new ApkError(`${what} : datahash sha256 du flux de données différent de .PKGINFO`);
    }
  } else if (!allowUntrusted) throw new ApkError(`${what} : .PKGINFO sans datahash`);
  const files = parseTar(Buffer.concat(dataMembers.map(m => m.data)));
  for (const f of files) {
    if (f.type !== "file") continue;
    const sha1 = f.pax["APK-TOOLS.checksum.SHA1"];
    const sha256 = f.pax["APK-TOOLS.checksum.SHA256"];
    if (sha1 && createHash("sha1").update(f.data).digest("hex") !== sha1.toLowerCase()) {
      throw new ApkError(`${what} : somme SHA1 de ${f.name} invalide`);
    }
    if (sha256 && createHash("sha256").update(f.data).digest("hex") !== sha256.toLowerCase()) {
      throw new ApkError(`${what} : somme SHA256 de ${f.name} invalide`);
    }
  }
  return { pkginfo, scripts, files, signer };
}

// ---------------------------------------------------------------------------------------------------------------
// Résolution

export interface Resolution {
  /** État final : nom → paquet. */
  selected: Map<string, Pkg>;
}

function provided(p: Pkg, name: string): { ok: boolean; version?: string } {
  if (p.name === name) return { ok: true, version: p.version };
  for (const pr of p.provides) {
    const eq = pr.indexOf("=");
    if ((eq < 0 ? pr : pr.slice(0, eq)) === name) return { ok: true, version: eq < 0 ? undefined : pr.slice(eq + 1) };
  }
  return { ok: false };
}

export function satisfies(p: Pkg, dep: Dep): boolean {
  const r = provided(p, dep.name);
  return r.ok && versionMatches(r.version, dep);
}

/**
 * Calcule l'état final à partir du monde (world). Préfère le paquet installé s'il satisfait la contrainte
 * (sauf `upgrade`), puis le nom exact, puis provider_priority, puis la version la plus haute.
 */
export function resolve(world: string[], installed: Pkg[], available: Pkg[], upgrade = false): Resolution {
  const selected = new Map<string, Pkg>();
  const conflicts: { dep: Dep; from: string }[] = [];
  const installedByName = new Map(installed.map(p => [p.name, p]));
  const pool = [...available];
  for (const p of installed) {
    if (!available.some(a => a.name === p.name && a.version === p.version)) pool.push(p);
  }

  const visit = (raw: string, from: string) => {
    const dep = parseDep(raw);
    if (dep.conflict) return void conflicts.push({ dep, from });
    for (const s of selected.values()) if (satisfies(s, dep)) return;
    let cands = pool.filter(p => satisfies(p, dep));
    if (!cands.length) {
      const near = pool.filter(p => provided(p, dep.name).ok).map(p => `${p.name}-${p.version}`);
      throw new ApkError(
        `impossible de satisfaire ${raw}${from ? ` (requis par ${from})` : ""}${near.length ? ` ; disponibles : ${near.join(", ")}` : ""}`,
      );
    }
    const exact = cands.filter(p => p.name === dep.name);
    if (exact.length) cands = exact;
    cands.sort((a, b) => {
      const ia = installedByName.get(a.name)?.version === a.version ? 1 : 0;
      const ib = installedByName.get(b.name)?.version === b.version ? 1 : 0;
      if (!upgrade && ia !== ib) return ib - ia;
      if (a.providerPriority !== b.providerPriority) return b.providerPriority - a.providerPriority;
      return compareVersions(b.version, a.version);
    });
    const pick = cands.find(p => !selected.has(p.name));
    if (!pick) {
      const s = selected.get(cands[0].name)!;
      throw new ApkError(
        `${raw}${from ? ` (requis par ${from})` : ""} incompatible avec ${s.name}-${s.version} déjà retenu`,
      );
    }
    selected.set(pick.name, pick);
    for (const d of pick.depends) visit(d, `${pick.name}-${pick.version}`);
  };

  for (const w of world) visit(w, "world");
  // install_if : point fixe.
  for (let changed = true; changed; ) {
    changed = false;
    for (const p of pool) {
      if (!p.installIf.length || selected.has(p.name)) continue;
      const deps = p.installIf.map(parseDep);
      if (deps.every(d => [...selected.values()].some(s => satisfies(s, d)))) {
        const before = selected.size;
        visit(`${p.name}=${p.version}`, "install_if");
        changed = selected.size !== before;
      }
    }
  }
  for (const { dep, from } of conflicts) {
    for (const s of selected.values()) {
      if (satisfies(s, { ...dep, conflict: false })) {
        throw new ApkError(`${s.name}-${s.version} est en conflit avec ${dep.raw} (${from})`);
      }
    }
  }
  return { selected };
}

// ---------------------------------------------------------------------------------------------------------------
// Base installée (format de /lib/apk/db/installed : blocs P:/V:/… + F:/R:/Z:)

export interface InstalledPkg extends Pkg {
  files: { path: string; checksum?: string }[];
  dirs: string[];
}

export function parseInstalledDb(text: string): InstalledPkg[] {
  const out: InstalledPkg[] = [];
  for (const block of text.split(/\n\s*\n/)) {
    const p: InstalledPkg = { ...emptyPkg(), files: [], dirs: [] };
    let dir = "";
    for (const line of block.split("\n")) {
      if (line.length < 2 || line[1] !== ":") continue;
      const k = line[0],
        v = line.slice(2);
      if (k === "F") {
        dir = v;
        p.dirs.push(v);
      } else if (k === "R") p.files.push({ path: dir ? `${dir}/${v}` : v });
      else if (k === "Z" && p.files.length) p.files[p.files.length - 1].checksum = v;
      else setField(p, k, v);
    }
    if (p.name) out.push(p);
  }
  return out;
}

export function formatInstalledDb(pkgs: InstalledPkg[]): string {
  const blocks = pkgs.map(p => {
    const lines = pkgFields(p);
    const byDir = new Map<string, { name: string; checksum?: string }[]>();
    for (const d of p.dirs) byDir.set(d, []);
    for (const f of p.files) {
      const d = posix.dirname(f.path) === "." ? "" : posix.dirname(f.path);
      if (!byDir.has(d)) byDir.set(d, []);
      byDir.get(d)!.push({ name: posix.basename(f.path), checksum: f.checksum });
    }
    for (const [d, files] of byDir) {
      if (d) lines.push(`F:${d}`);
      for (const f of files) {
        lines.push(`R:${f.name}`);
        if (f.checksum) lines.push(`Z:${f.checksum}`);
      }
    }
    return lines.join("\n") + "\n";
  });
  return blocks.join("\n");
}

// ---------------------------------------------------------------------------------------------------------------
// Système de fichiers de la racine

/** Chemin tar → chemin sûr sous la racine (refuse absolu, `..`, lecteur). */
export function safeJoin(root: string, rel: string): string {
  const norm = posix.normalize(rel.replace(/\\/g, "/")).replace(/^\.\/+/, "");
  if (!norm || norm === "." || isAbsolute(norm) || /^[a-zA-Z]:/.test(norm) || norm.split("/").includes("..")) {
    throw new ApkError(`chemin refusé dans l'archive : ${rel}`);
  }
  return join(root, ...norm.split("/"));
}

export function atomicWrite(path: string, data: string | Uint8Array) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.apk-new`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

export interface ExtractResult {
  files: { path: string; checksum?: string }[];
  dirs: string[];
  warnings: string[];
}

/** Extrait les entrées dans `root`. Liens symboliques : vrai lien si permis, sinon copie de la cible. */
export function extractEntries(root: string, entries: TarEntry[]): ExtractResult {
  const res: ExtractResult = { files: [], dirs: [], warnings: [] };
  const deferred: TarEntry[] = [];
  for (const e of entries) {
    const rel = posix.normalize(e.name).replace(/^\.\/+/, "");
    const dest = safeJoin(root, rel);
    if (e.type === "dir") {
      mkdirSync(dest, { recursive: true });
      res.dirs.push(rel);
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    if (e.type === "file") {
      atomicWrite(dest, e.data);
      const sha1 = e.pax["APK-TOOLS.checksum.SHA1"];
      res.files.push({ path: rel, checksum: sha1 ? "Q1" + Buffer.from(sha1, "hex").toString("base64") : q1(e.data) });
    } else if (e.type === "symlink" || e.type === "hardlink") {
      deferred.push(e);
      res.files.push({ path: rel });
    } else res.warnings.push(`${rel} : type d'entrée ignoré (périphérique ou fifo)`);
  }
  for (const e of deferred) {
    const rel = posix.normalize(e.name);
    const dest = safeJoin(root, rel);
    const target =
      e.type === "hardlink"
        ? safeJoin(root, e.linkname)
        : e.linkname.startsWith("/")
          ? safeJoin(root, e.linkname.slice(1))
          : safeJoin(root, posix.join(posix.dirname(rel), e.linkname));
    rmSync(dest, { force: true });
    try {
      if (e.type === "hardlink") linkSync(target, dest);
      else {
        const isDir = existsSync(target) && lstatSync(target).isDirectory();
        if (isDir) symlinkSync(target, dest, "junction");
        else symlinkSync(e.linkname.startsWith("/") ? target : e.linkname.replace(/\//g, "\\"), dest, "file");
      }
      continue;
    } catch {}
    if (existsSync(target) && lstatSync(target).isFile()) {
      copyFileSync(target, dest);
      res.warnings.push(`${rel} : lien remplacé par une copie de ${e.linkname}`);
    } else res.warnings.push(`${rel} : lien vers ${e.linkname} non créé (cible absente ou répertoire)`);
  }
  return res;
}

/** Supprime les fichiers puis les répertoires devenus vides (du plus profond au plus haut). */
export function removeFiles(root: string, files: string[], dirs: string[]) {
  for (const f of files) rmSync(safeJoin(root, f), { force: true });
  const all = new Set<string>(dirs);
  for (const f of files) for (let d = posix.dirname(f); d && d !== "."; d = posix.dirname(d)) all.add(d);
  for (const d of [...all].sort((a, b) => b.length - a.length)) {
    const p = safeJoin(root, d);
    try {
      if (readdirSync(p).length === 0) rmdirSync(p);
    } catch {}
  }
}
