import { lstat, mkdir, open, readdir, realpath } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, sep } from "node:path";
import windows from "bun:windows";

const requestedRoot = "C:/Windows/System32";
const stagePath = "C:/SSH/omar/server/var/index/system32-pe-artifacts.ndjson";
const provenancePath = "C:/SSH/omar/server/var/index/system32-pe-index-provenance.json";
const scanId = new Date().toISOString();
const root = await realpath(requestedRoot);
const rows: string[] = [];
const errors: Array<{ path: string; phase: string; code?: string; message: string }> = [];
let dirs = 0, candidates = 0, parsed = 0, parseErrors = 0, readErrors = 0, symlinksSkipped = 0, escapedSkipped = 0, bytesTotal = 0;
const stageHasher = new Bun.CryptoHasher("sha256");
const within = (candidate: string) => {
  const rel = relative(root, candidate);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(".." + sep));
};
const recordError = (p: string, phase: string, e: unknown) => {
  const error = e as NodeJS.ErrnoException;
  errors.push({ path: relative(root, p).replaceAll("\\", "/"), phase, code: error.code, message: String(error.message ?? e).slice(0, 300) });
};
await mkdir(dirname(stagePath), { recursive: true });
const stageFile = await open(stagePath, "w");
async function emit(row: Record<string, unknown>) {
  const line = JSON.stringify(row) + "\n";
  rows.push(line);
  stageHasher.update(line);
  if (rows.length >= 64) {
    await stageFile.write(rows.join(""));
    rows.length = 0;
  }
}
async function scanFile(p: string, rel: string) {
  candidates++;
  let fileStat;
  let bytes: Uint8Array | undefined;
  let digest: string | null = null;
  let parseError: string | null = null;
  let pe: any = null;
  try {
    fileStat = await lstat(p);
    if (fileStat.isSymbolicLink()) { symlinksSkipped++; return; }
    const canonical = await realpath(p);
    if (!within(canonical)) { escapedSkipped++; return; }
    bytes = await Bun.file(canonical).bytes();
    bytesTotal += bytes.byteLength;
    digest = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    try { pe = windows.pe.parse(bytes, canonical); parsed++; }
    catch (e) { parseErrors++; parseError = String((e as Error).message ?? e).slice(0, 500); }
  } catch (e) {
    readErrors++;
    parseError = String((e as Error).message ?? e).slice(0, 500);
    recordError(p, "read_or_hash", e);
  }
  const imports = Array.isArray(pe?.imports) ? pe.imports : [];
  const exports = Array.isArray(pe?.exports) ? pe.exports : [];
  const sections = Array.isArray(pe?.sections) ? pe.sections : [];
  const row = {
    scan_id: scanId,
    path: p,
    relative_path: rel,
    extension: extname(p).slice(1).toLowerCase(),
    bytes: fileStat?.size ?? null,
    sha256: digest,
    pe_kind: pe?.kind ?? null,
    machine: pe?.machine ?? null,
    bits: pe?.bits ?? null,
    subsystem: pe?.subsystem ?? null,
    characteristics: pe?.characteristics ?? null,
    dll_characteristics: pe?.dllCharacteristics ?? null,
    timestamp: pe?.timestamp ?? null,
    image_base: pe?.imageBase === undefined ? null : String(pe.imageBase),
    image_size: pe?.imageSize ?? null,
    entry_rva: pe?.entryRva ?? null,
    checksum: pe?.checksum ?? null,
    is_dotnet: pe?.isDotnet === undefined ? null : Number(Boolean(pe.isDotnet)),
    section_count: sections.length,
    import_module_count: imports.length,
    import_symbol_count: imports.reduce((n: number, m: any) => n + (Array.isArray(m.functions) ? m.functions.length : 0), 0),
    delay_import_count: imports.filter((m: any) => Boolean(m.delay)).length,
    export_count: exports.length,
    sections_json: JSON.stringify(sections),
    imports_json: JSON.stringify(imports),
    exports_json: JSON.stringify(exports),
    export_name: pe?.exportName ?? null,
    version_json: JSON.stringify(pe?.version ?? null),
    warnings_json: JSON.stringify(pe?.warnings ?? []),
    parse_error: parseError,
    scanned_at: scanId,
  };
  await emit(row);
  if (candidates % 200 === 0) console.log(JSON.stringify({ processed: candidates, parsed, parseErrors, readErrors, bytesTotal }));
}
async function walk(dir: string) {
  dirs++;
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch (e) { recordError(dir, "readdir", e); return; }
  for (const ent of entries) {
    const p = join(dir, ent.name);
    if (ent.isSymbolicLink()) { symlinksSkipped++; continue; }
    try {
      const s = await lstat(p);
      if (s.isSymbolicLink()) { symlinksSkipped++; continue; }
      const canonical = await realpath(p);
      if (!within(canonical)) { escapedSkipped++; continue; }
      if (s.isDirectory()) await walk(p);
      else if (s.isFile() && /\.(exe|dll)$/i.test(ent.name)) await scanFile(p, relative(root, p).replaceAll("\\", "/"));
    } catch (e) { recordError(p, "stat_or_realpath", e); }
  }
}
await walk(root);
if (rows.length) await stageFile.write(rows.join(""));
await stageFile.close();
const stageSha256 = stageHasher.digest("hex");
const summary = { scanId, sourceRoot: root, bunVersion: Bun.version, parser: "bun:windows -> windows.pe.parse", hash: "Bun.CryptoHasher sha256", traversal: "recursive; lstat+realpath containment; skip symlink/reparse targets outside root", directories: dirs, candidatesSeen: candidates, parsed, parseErrors, readErrors, symlinksSkipped, escapedSkipped, bytesRead: bytesTotal, stagePath, stageSha256, errorCount: errors.length, errors };
await Bun.write(provenancePath, JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify({ scanId, directories: dirs, candidatesSeen: candidates, parsed, parseErrors, readErrors, symlinksSkipped, escapedSkipped, bytesRead: bytesTotal, stagePath, stageSha256, errorCount: errors.length, provenancePath }));

