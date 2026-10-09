#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const PACKAGE = "Microsoft.Windows.SDK.Win32Metadata";
const VERSION = "71.0.30-preview";
const API = "https://api.nuget.org/v3-flatcontainer";
const DEFAULT_OUT = "packages";
const FAMILY_DLLS: Record<string, string[]> = {
  kernel32: ["kernel32.dll", "kernelbase.dll"],
  user32: ["user32.dll"],
  advapi32: ["advapi32.dll"],
  shell32: ["shell32.dll"],
  ole32: ["ole32.dll"],
  gdi32: ["gdi32.dll"],
  ntdll: ["ntdll.dll"],
  iphlpapi: ["iphlpapi.dll"],
  setupapi: ["setupapi.dll"],
  wtsapi32: ["wtsapi32.dll"],
  dwmapi: ["dwmapi.dll"],
  "dxgi-d3d11": ["dxgi.dll", "d3d11.dll"],
};

type Heap = { strings: Uint8Array; blobs: Uint8Array; guids: Uint8Array; wide: boolean };
type Column = { kind: "u2" | "u4" | "str" | "blob" | "guid" | "table" | "coded"; id?: number; bits?: number; tags?: number[] };
type Row = Record<string, number>;
type Tables = { rows: Row[][]; heaps: Heap; tableSizes: number[] };

const T = (id: number): Column => ({ kind: "table", id });
const C = (bits: number, ...tags: number[]): Column => ({ kind: "coded", bits, tags });
const U2: Column = { kind: "u2" }, U4: Column = { kind: "u4" }, S: Column = { kind: "str" }, B: Column = { kind: "blob" }, G: Column = { kind: "guid" };
const schemas: Column[][] = [
  [U2, S, G, G, G],
  [C(2, 0, 26, 35, 1), S, S],
  [U4, S, S, C(2, 2, 1, 27), C(2, 4, 8), C(1, 4, 6)],
  [T(4)],
  [U2, S, B],
  [T(6)],
  [U4, U2, U2, S, B, T(8)],
  [T(8)],
  [U2, U2, S],
  [T(2), C(2, 2, 1, 27)],
  [C(3, 2, 1, 26, 6, 27), S, B],
  [U2, C(2, 4, 8, 23), B],
  [C(5, 6, 4, 1, 2, 8, 9, 10, 0, 14, 23, 20, 17, 26, 27, 32, 35, 38, 39, 40, 42, 44, 43), C(3, -1, -1, 6, 10, -1), B],
  [C(1, 4, 8), B],
  [U2, C(2, 2, 6, 32), B],
  [U2, U4, T(2)],
  [U4, T(4)],
  [B],
  [T(2), T(20)],
  [T(20)],
  [U2, S, C(2, 2, 1, 27)],
  [T(2), T(23)],
  [T(23)],
  [U2, S, B],
  [U2, T(6), C(1, 20, 23)],
  [T(2), C(1, 6, 10), C(1, 6, 10)],
  [S],
  [B],
  [U2, C(1, 4, 6), S, T(26)],
  [U4, T(4)],
  [U4, U4],
  [U4],
  [U2, U2, U2, U2, U4, B, S, S, B],
  [U4],
  [U4, U4, U4],
  [U2, U2, U2, U2, U4, B, S, S, B],
  [U4, T(35)],
  [U4, U4, U4, T(35)],
  [U4, S, B],
  [U4, U4, S, S, C(2, 38, 35, 39)],
  [U4, U4, S, C(2, 38, 35, 39)],
  [T(2), T(2)],
  [U2, U2, C(1, 2, 6), S],
  [C(1, 6, 10), B],
  [T(42), C(2, 2, 1, 27)],
];
const tableNames = ["Module", "TypeRef", "TypeDef", "FieldPtr", "Field", "MethodPtr", "MethodDef", "ParamPtr", "Param", "InterfaceImpl", "MemberRef", "Constant", "CustomAttribute", "FieldMarshal", "DeclSecurity", "ClassLayout", "FieldLayout", "StandAloneSig", "EventMap", "EventPtr", "Event", "PropertyMap", "PropertyPtr", "Property", "MethodSemantics", "MethodImpl", "ModuleRef", "TypeSpec", "ImplMap", "FieldRva", "ENCLog", "ENCMap", "Assembly", "AssemblyProcessor", "AssemblyOS", "AssemblyRef", "AssemblyRefProcessor", "AssemblyRefOS", "File", "ExportedType", "ManifestResource", "NestedClass", "GenericParam", "MethodSpec", "GenericParamConstraint"];
const indexIn = new Map([["Module", 0], ["TypeRef", 1], ["TypeDef", 2], ["Field", 4], ["MethodDef", 6], ["Param", 8], ["MemberRef", 10], ["Constant", 11], ["CustomAttribute", 12], ["ClassLayout", 15], ["FieldLayout", 16], ["ModuleRef", 26], ["ImplMap", 28]]);
const codedTables: Record<string, { bits: number; tags: number[] }> = {
  TypeDefOrRef: { bits: 2, tags: [2, 1, 27] }, HasConstant: { bits: 2, tags: [4, 8, 23] }, HasCustomAttribute: { bits: 5, tags: [6, 4, 1, 2, 8, 9, 10, 0, 14, 23, 20, 17, 26, 27, 32, 35, 38, 39, 40, 42, 44, 43] },
  HasFieldMarshal: { bits: 1, tags: [4, 8] }, HasDeclSecurity: { bits: 2, tags: [2, 6, 32] }, MemberRefParent: { bits: 3, tags: [2, 1, 26, 6, 27] },
  HasSemantics: { bits: 1, tags: [20, 23] }, MethodDefOrRef: { bits: 1, tags: [6, 10] }, MemberForwarded: { bits: 1, tags: [4, 6] },
  Implementation: { bits: 2, tags: [38, 35, 39] }, CustomAttributeType: { bits: 3, tags: [-1, -1, 6, 10, -1] }, ResolutionScope: { bits: 2, tags: [0, 26, 35, 1] }, TypeOrMethodDef: { bits: 1, tags: [2, 6] },
};

function readIndex(view: DataView, offset: number, width: number): number { return width === 2 ? view.getUint16(offset, true) : view.getUint32(offset, true); }
function compressed(bytes: Uint8Array, at: number): [number, number] {
  const a = bytes[at];
  if ((a & 0x80) === 0) return [a, at + 1];
  if ((a & 0xc0) === 0x80) return [((a & 0x3f) << 8) | bytes[at + 1], at + 2];
  if ((a & 0xe0) === 0xc0) return [((a & 0x1f) * 0x1000000) + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3], at + 4];
  throw new Error(`Préfixe d'entier compressé ECMA-335 invalide à ${at}`);
}
function cString(heap: Uint8Array, offset: number): string {
  if (!offset) return "";
  let end = offset;
  while (end < heap.length && heap[end]) end++;
  return new TextDecoder().decode(heap.subarray(offset, end));
}
function blob(heap: Uint8Array, offset: number): Uint8Array {
  if (!offset) return new Uint8Array();
  const [size, start] = compressed(heap, offset);
  return heap.subarray(start, start + size);
}

function parseTables(bytes: Uint8Array): Tables {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (n: number) => view.getUint16(n, true), u32 = (n: number) => view.getUint32(n, true);
  if (u32(0) !== 0x424a5342) throw new Error("Le fichier fourni n'est pas un flux de métadonnées ECMA-335.");
  let p = 12;
  const versionLength = u32(p); p += 4 + ((versionLength + 3) & ~3);
  p += 2;
  const streamCount = u16(p); p += 2;
  const streams = new Map<string, Uint8Array>();
  for (let i = 0; i < streamCount; i++) {
    const offset = u32(p), size = u32(p + 4); p += 8;
    let end = p; while (bytes[end]) end++;
    const name = new TextDecoder().decode(bytes.subarray(p, end));
    p = (end + 4) & ~3;
    streams.set(name, bytes.subarray(offset, offset + size));
  }
  const strings = streams.get("#Strings");
  const blobs = streams.get("#Blob");
  const guids = streams.get("#GUID");
  const tableStream = streams.get("#~") ?? streams.get("#-");
  if (!strings || !blobs || !guids || !tableStream) throw new Error("Flux de métadonnées incomplet (tables/heaps manquants).");
  const tView = new DataView(tableStream.buffer, tableStream.byteOffset, tableStream.byteLength);
  const heapFlags = tableStream[6];
  let q = 24;
  const valid = new DataView(tableStream.buffer, tableStream.byteOffset, tableStream.byteLength).getBigUint64(8, true);
  const counts = Array<number>(64).fill(0);
  for (let i = 0; i < 64; i++) if ((valid & (1n << BigInt(i))) !== 0n) { counts[i] = tView.getUint32(q, true); q += 4; }
  const sizes = Array<number>(64).fill(0);
  const rows = Array.from({ length: 64 }, () => [] as Row[]);
  const heapWidths = { str: heapFlags & 1 ? 4 : 2, guid: heapFlags & 2 ? 4 : 2, blob: heapFlags & 4 ? 4 : 2 };
  const tableWidth = (id: number) => counts[id] < 65536 ? 2 : 4;
  const codedWidth = (bits: number, tags: number[]) => Math.max(...tags.filter(x => x >= 0).map(x => counts[x])) < (1 << (16 - bits)) ? 2 : 4;
  const width = (column: Column) => column.kind === "u2" ? 2 : column.kind === "u4" ? 4 : column.kind === "str" ? heapWidths.str : column.kind === "guid" ? heapWidths.guid : column.kind === "blob" ? heapWidths.blob : column.kind === "table" ? tableWidth(column.id!) : codedWidth(column.bits!, column.tags!);
  for (let id = 0; id < schemas.length; id++) sizes[id] = schemas[id].reduce((sum, col) => sum + width(col), 0);
  for (let id = 0; id < schemas.length; id++) {
    const schema = schemas[id], rowSize = sizes[id];
    for (let n = 0; n < counts[id]; n++) {
      const row: Row = {};
      for (let j = 0; j < schema.length; j++) {
        const col = schema[j], w = width(col);
        if (q + w > tableStream.length) throw new Error(`Table ECMA-335 ${id} (${tableNames[id]}) : données tronquées à ${q}, largeur ${w}, fin ${tableStream.length}.`);
        const v = readIndex(tView, q, w); q += w;
        row[`c${j}`] = v;
      }
      rows[id].push(row);
    }
    if (q > tableStream.length) throw new Error(`Table ECMA-335 ${id} dépasse le flux disponible.`);
    if (counts[id] && rowSize === 0) throw new Error(`Taille inconnue pour la table ECMA-335 ${id}.`);
  }
  return { rows, heaps: { strings, blobs, guids, wide: (heapFlags & 1) !== 0 }, tableSizes: counts };
}

function peMetadata(bytes: Uint8Array): Uint8Array {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pe = v.getUint32(0x3c, true);
  if (v.getUint32(pe, true) !== 0x00004550) throw new Error("En-tête PE invalide dans Windows.Win32.winmd.");
  const sections = v.getUint16(pe + 6, true), optionalSize = v.getUint16(pe + 20, true), opt = pe + 24;
  const magic = v.getUint16(opt, true), directory = opt + (magic === 0x20b ? 112 : 96), cliRva = v.getUint32(directory + 14 * 8, true);
  const sec = opt + optionalSize, rvaToOffset = (rva: number) => {
    for (let i = 0; i < sections; i++) {
      const s = sec + i * 40, virtualSize = v.getUint32(s + 8, true), va = v.getUint32(s + 12, true), rawSize = v.getUint32(s + 16, true), raw = v.getUint32(s + 20, true);
      if (rva >= va && rva < va + Math.max(virtualSize, rawSize)) return raw + rva - va;
    }
    throw new Error(`RVA PE hors section : 0x${rva.toString(16)}`);
  };
  const cli = rvaToOffset(cliRva), metadataRva = v.getUint32(cli + 8, true), metadataSize = v.getUint32(cli + 12, true), start = rvaToOffset(metadataRva);
  return bytes.subarray(start, start + metadataSize);
}

function metadataInput(bytes: Uint8Array) { return bytes[0] === 0x4d && bytes[1] === 0x5a ? peMetadata(bytes) : bytes; }

function indexWidth(tables: Tables, col: Column): number {
  return col.kind === "table" ? tables.tableSizes[col.id!] < 65536 ? 2 : 4 : col.kind === "coded" ? Math.max(...col.tags!.filter(x => x >= 0).map(x => tables.tableSizes[x])) < (1 << (16 - col.bits!)) ? 2 : 4 : col.kind === "str" ? tables.heaps.wide ? 4 : 2 : col.kind === "blob" || col.kind === "guid" ? 2 : col.kind === "u4" ? 4 : 2;
}
function coded(rowValue: number, descriptor: { bits: number; tags: number[] }) { const tag = rowValue & ((1 << descriptor.bits) - 1); return [descriptor.tags[tag] ?? -1, rowValue >>> descriptor.bits] as const; }

type TypeInfo = { name: string; ns: string; full: string; flags: number; fields: number; methods: number; extends: number };
type Fn = { name: string; dll: string; args: string[]; returns: string; ffiArgs: string[]; ffiReturn: string; setLastError: boolean };
function decode(tables: Tables) {
  const { rows, heaps } = tables;
  const row = (name: string, id: number) => rows[indexIn.get(name)!][id - 1];
  const str = (id: number) => cString(heaps.strings, id);
  const types: TypeInfo[] = rows[2].map((r, i) => ({ name: str(r.c1), ns: str(r.c2), full: [str(r.c2), str(r.c1)].filter(Boolean).join("."), flags: r.c0, fields: r.c4, methods: r.c5, extends: r.c3 }));
  const typeRef = rows[1].map(r => [str(r.c2), str(r.c1)].filter(Boolean).join("."));
  const resolveType = (token: number) => {
    const [id, rid] = coded(token, codedTables.TypeDefOrRef);
    if (id === 2) return types[rid - 1]?.full ?? "unknown";
    if (id === 1) return typeRef[rid - 1] ?? "unknown";
    return "unknown";
  };
  const fieldStarts = types.map(t => t.fields);
  const fieldOwner = Array(rows[4].length + 1).fill(0), methodOwner = Array(rows[6].length + 1).fill(0);
  types.forEach((t, i) => {
    const fe = types[i + 1]?.fields ?? rows[4].length + 1;
    const me = types[i + 1]?.methods ?? rows[6].length + 1;
    for (let n = t.fields; n < fe; n++) fieldOwner[n] = i;
    for (let n = t.methods; n < me; n++) methodOwner[n] = i;
  });
  const modules = rows[26].map(r => str(r.c0).toLowerCase());
  const imports = new Map<number, { dll: string; name: string }>();
  for (const r of rows[28]) {
    const [table, rid] = coded(r.c1, codedTables.MemberForwarded);
    if (table === 6) imports.set(rid, { name: str(r.c2), dll: modules[r.c3 - 1] ?? "" });
  }
  const memberRefOwner = new Map<number, string>();
  for (let id = 1; id <= rows[10].length; id++) {
    const r = row("MemberRef", id), [table, rid] = coded(r.c0, codedTables.MemberRefParent);
    memberRefOwner.set(id, table === 2 ? types[rid - 1]?.full ?? "" : table === 1 ? typeRef[rid - 1] ?? "" : "");
  }
  const methodAttributes = new Map<number, string[]>();
  const methodsSetLastError = new Set<number>();
  for (const attribute of rows[12]) {
    const [ownerTable, owner] = coded(attribute.c0, codedTables.HasCustomAttribute);
    if (ownerTable !== 6) continue;
    const [ctorTable, ctor] = coded(attribute.c1, codedTables.CustomAttributeType);
    const attributeType = ctorTable === 10 ? memberRefOwner.get(ctor) ?? "" : ctorTable === 6 ? types[methodOwner[ctor] ?? -1]?.full ?? "" : "";
    const names = methodAttributes.get(owner) ?? [];
    if (attributeType) names.push(attributeType);
    methodAttributes.set(owner, names);
    if (attributeType.endsWith("DllImportAttribute") || attributeType.endsWith("LibraryImportAttribute")) {
      const value = blob(heaps.blobs, attribute.c2);
      if (value[0] === 1 && value[1] === 0) {
        let at = 2;
        if (value[at] === 0xff) at++;
        else { const [length, next] = compressed(value, at); at = next + length; }
        if (at + 2 <= value.length) {
          const count = new DataView(value.buffer, value.byteOffset, value.byteLength).getUint16(at, true); at += 2;
          for (let i = 0; i < count && at < value.length; i++) {
            const kind = value[at++];
            if (kind !== 0x53 && kind !== 0x54) break;
            const attributeKind = value[at++];
            if (attributeKind === 0x55) { const [typeLength, typeStart] = compressed(value, at); at = typeStart + typeLength; }
            const [nameLength, nameStart] = compressed(value, at); at = nameStart + nameLength;
            if (attributeKind === 0x02 && new TextDecoder().decode(value.subarray(nameStart, nameStart + nameLength)) === "SetLastError" && value[at]) methodsSetLastError.add(owner);
            at += attributeKind === 0x02 ? 1 : 4;
          }
        }
      }
    }
  }
  const typeNames = new Map<string, number>(types.map((t, i) => [t.full, i]));
  const enumUnderlying = (type: TypeInfo): string => {
    const i = typeNames.get(type.full)!;
    for (let n = fieldStarts[i]; n < (types[i + 1]?.fields ?? rows[4].length + 1); n++) {
      const f = row("Field", n), sig = blob(heaps.blobs, f.c2);
      if (str(f.c1) === "value__" && sig.length > 1 && sig[0] === 0x06) return primitive(sig[1]);
    }
    return "i32";
  };
  const primitive = (code: number): string => ({ 0x01: "void", 0x02: "bool", 0x03: "u16", 0x04: "i8", 0x05: "u8", 0x06: "i16", 0x07: "u16", 0x08: "i32", 0x09: "u32", 0x0a: "i64", 0x0b: "u64", 0x0c: "f32", 0x0d: "f64", 0x0e: "string", 0x18: "isize", 0x19: "usize", 0x1c: "object" } as Record<number, string>)[code] ?? "ptr";
  const enumTypeNames = new Set<string>();
  for (let id = 1; id < fieldOwner.length; id++) if (row("Field", id).c0 & 0x40) enumTypeNames.add(types[fieldOwner[id]]?.full ?? "");
  const enumShortNames = new Map<string, string>();
  for (const name of enumTypeNames) enumShortNames.set(name.split(".").at(-1)!, name);
  const ffiType = (type: string) => {
    const primitiveType = (name: string) => ({ void: "void", bool: "bool", i8: "i8", u8: "u8", i16: "i16", u16: "u16", i32: "i32", u32: "u32", i64: "i64", u64: "u64", f32: "f32", f64: "f64", isize: "isize", usize: "usize" } as Record<string, string>)[name];
    if (primitiveType(type)) return primitiveType(type)!;
    const enumName = enumTypeNames.has(type) ? type : enumShortNames.get(type.split(".").at(-1)!);
    if (enumName) {
      const enumIndex = typeNames.get(enumName);
      if (enumIndex !== undefined) return ffiType(enumUnderlying(types[enumIndex]));
    }
    const index = typeNames.get(type);
    if (index === undefined) return "ptr";
    const info = types[index], parent = resolveType(info.extends);
    if (parent === "System.Enum") return ffiType(enumUnderlying(info));
    if (parent === "System.IntPtr" || parent === "System.UIntPtr" || parent.endsWith("HANDLE")) return "ptr";
    const end = types[index + 1]?.fields ?? rows[4].length + 1;
    for (let id = info.fields; id < end; id++) {
      const f = row("Field", id);
      if (str(f.c1) !== "Value" && str(f.c1) !== "value__") continue;
      const sig = blob(heaps.blobs, f.c2);
      if (sig[0] === 0x06) {
        const [inner] = sigType(sig, 1);
        return inner === "System.IntPtr" || inner === "System.UIntPtr" ? "ptr" : primitiveType(inner) ?? "ptr";
      }
    }
    return "ptr";
  };
  function sigType(sig: Uint8Array, offset: number): [string, number] {
    let code = sig[offset++];
    while (code === 0x1f || code === 0x20) { [, offset] = compressed(sig, offset); code = sig[offset++]; }
    if (code === 0x0f || code === 0x10 || code === 0x1d) { const [inner, end] = sigType(sig, offset); return [code === 0x1d ? `${inner}[]` : `${inner}*`, end]; }
    if (code === 0x11 || code === 0x12) { const [token, end] = compressed(sig, offset); return [resolveType(token), end]; }
    if (code === 0x14) { const [inner, at] = sigType(sig, offset); const [rank, end] = compressed(sig, at); return [`${inner}[${rank}]`, end]; }
    if (code === 0x15) { offset++; const [token, afterToken] = compressed(sig, offset); const [count, afterCount] = compressed(sig, afterToken); let at = afterCount; const args: string[] = []; for (let i = 0; i < count; i++) { const [arg, next] = sigType(sig, at); args.push(arg); at = next; } return [resolveType(token) + `<${args.join(", ")}>`, at]; }
    if (code === 0x1b) { const [, end] = compressed(sig, offset); return ["function*", end]; }
    return [primitive(code), offset];
  }
  const functions: Fn[] = [];
  for (let id = 1; id <= rows[6].length; id++) {
    const m = row("MethodDef", id), imported = imports.get(id);
    if (!imported || !imported.dll || !m.c3) continue;
    const signature = blob(heaps.blobs, m.c4);
    if (!signature.length) continue;
    let offset = 1; const [argCount, a] = compressed(signature, offset); offset = a;
    const [returns, rEnd] = sigType(signature, offset); offset = rEnd;
    const args: string[] = [];
    for (let i = 0; i < argCount && offset < signature.length; i++) { const [arg, next] = sigType(signature, offset); args.push(arg); offset = next; }
    const dll = imported.dll.endsWith(".dll") ? imported.dll : `${imported.dll}.dll`;
    functions.push({ name: imported.name || str(m.c3), dll, args, returns, ffiArgs: args.map(ffiType), ffiReturn: ffiType(returns), setLastError: methodsSetLastError.has(id) || (methodAttributes.get(id) ?? []).some(name => name.endsWith("SetLastErrorAttribute")) });
  }
  const constants = new Map<number, number | string | boolean>();
  for (const c of rows[11]) {
    const [table, rid] = coded(c.c1, codedTables.HasConstant), value = blob(heaps.blobs, c.c2), view = new DataView(value.buffer, value.byteOffset, value.byteLength);
    let v: number | string | boolean;
    if (c.c0 === 0x02) v = value[0] !== 0;
    else if ([0x04, 0x05].includes(c.c0)) v = value[0];
    else if ([0x06, 0x07].includes(c.c0)) v = view.getUint16(0, true);
    else if ([0x08, 0x09].includes(c.c0)) v = c.c0 === 0x08 ? view.getInt32(0, true) : view.getUint32(0, true);
    else if ([0x0a, 0x0b].includes(c.c0)) v = Number(view.getBigInt64(0, true));
    else if (c.c0 === 0x0e) v = new TextDecoder("utf-16le").decode(value).replace(/\0$/, "");
    else continue;
    if (table === 4) constants.set(rid, v);
  }
  const structs: Record<string, { size: number; fields: { name: string; offset: number; type: string }[] }> = {};
  const layouts = new Map<number, number>();
  const packings = new Map<number, number>();
  for (const r of rows[15]) { layouts.set(r.c2, r.c1); packings.set(r.c2, r.c0 || 8); }
  const offsets = new Map<number, number>();
  for (const r of rows[16]) offsets.set(r.c1, r.c0);
  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    if (!type.full.startsWith("Windows.Win32.")) continue;
    if (enumTypeNames.has(type.full)) continue;
    const start = type.fields, end = types[i + 1]?.fields ?? rows[4].length + 1;
    if (end <= start) continue;
    const fields: { name: string; offset: number; type: string }[] = [];
    let guessed = 0;
    for (let id = start; id < end; id++) {
      const f = row("Field", id), sig = blob(heaps.blobs, f.c2); if (sig[0] !== 0x06) continue;
      const [fieldType] = sigType(sig, 1), natural = typeSize(fieldType, new Set());
      const pack = packings.get(i + 1) ?? 8, alignment = Math.min(natural, pack), at = offsets.get(id) ?? Math.ceil(guessed / alignment) * alignment;
      fields.push({ name: str(f.c1), offset: at, type: fieldType }); guessed = at + natural;
    }
    if (!fields.length) continue;
    const maxAlignment = Math.min(8, Math.max(...fields.map(field => typeSize(field.type, new Set()))));
    const size = layouts.get(i + 1) || Math.ceil(guessed / maxAlignment) * maxAlignment;
    structs[type.full] = { size, fields };
  }
  const enums: Record<string, Record<string, number | string | boolean>> = {};
  for (let i = 0; i < types.length; i++) {
    const type = types[i];
    if (type.full.startsWith("System.") || type.full.startsWith("Windows.Win32.Foundation.Metadata.")) continue;
    const start = type.fields, end = types[i + 1]?.fields ?? rows[4].length + 1, values: Record<string, number | string | boolean> = {};
    for (let id = start; id < end; id++) { const value = constants.get(id); if (value !== undefined) values[str(row("Field", id).c1)] = value; }
    if (Object.keys(values).length > 0) enums[type.full] = values;
  }
  return { functions, structs, enums };

  function typeSize(name: string, seen: Set<string>): number {
    const known = ({ void: 1, bool: 1, i8: 1, u8: 1, i16: 2, u16: 2, i32: 4, u32: 4, f32: 4, i64: 8, u64: 8, f64: 8, isize: 8, usize: 8, ptr: 8, string: 8, object: 8 } as Record<string, number>)[name];
    if (known) return known;
    if (name.endsWith("*") || name.endsWith("[]")) return 8;
    if (name === "System.Guid") return 16;
    if (seen.has(name)) return 8;
    seen.add(name);
    const index = typeNames.get(name);
    if (index === undefined) return 8;
    const type = types[index];
    const parent = resolveType(type.extends);
    if (parent === "System.IntPtr" || parent === "System.UIntPtr" || parent.endsWith("HANDLE")) return 8;
    const start = type.fields, end = types[index + 1]?.fields ?? rows[4].length + 1;
    for (let fieldId = start; fieldId < end; fieldId++) {
      const field = row("Field", fieldId);
      if (str(field.c1) !== "Value" && str(field.c1) !== "value__") continue;
      const sig = blob(heaps.blobs, field.c2);
      if (sig[0] === 0x06) { const [inner] = sigType(sig, 1); return typeSize(inner, seen); }
    }
    return 8;
  }
}

function familyFor(dll: string, all: boolean) {
  const lower = dll.toLowerCase();
  for (const [family, dlls] of Object.entries(FAMILY_DLLS)) if (dlls.includes(lower)) return family;
  return all ? lower.replace(/\.dll$/, "").replace(/[^a-z0-9]+/g, "-") : undefined;
}
function safeName(value: string) { return value.replace(/[^A-Za-z0-9_$]/g, "_").replace(/^[^A-Za-z_$]/, "_$&"); }
function generate(family: string, dlls: string[], functions: Fn[], structs: Record<string, { size: number; fields: { name: string; offset: number; type: string }[] }>, enums: Record<string, Record<string, number | string | boolean>>, license: string) {
  const selected = functions.filter(f => dlls.includes(f.dll.toLowerCase()));
  const perDll = new Map<string, Fn[]>();
  for (const fn of selected) { const list = perDll.get(fn.dll) ?? []; list.push(fn); perDll.set(fn.dll, list); }
  const symbolMap: Record<string, Record<string, unknown>> = {};
  const aliases: Record<string, string> = {};
  const aliasesByDll: Record<string, Record<string, string>> = {};
  for (const [dll, fns] of perDll) {
    const symbols: Record<string, unknown> = {};
    const names = new Set(fns.map(f => f.name));
    for (const fn of fns) {
      symbols[fn.name] = { args: fn.ffiArgs.map(x => `FFIType.${x}`), returns: `FFIType.${fn.ffiReturn}`, setLastError: fn.setLastError };
    }
    for (const fn of fns) if (fn.name.endsWith("A") && names.has(`${fn.name.slice(0, -1)}W`)) {
      const alias = fn.name.slice(0, -1), wide = `${alias}W`;
      aliases[alias] = wide;
      (aliasesByDll[dll] ??= {})[alias] = wide;
    }
    symbolMap[dll] = symbols;
  }
  const usedTypes = new Set(selected.flatMap(fn => [...fn.args, fn.returns]).map(type => type.replace(/[?*&\[\]0-9]/g, "").split("<", 1)[0]).filter(Boolean));
  const selectedStructs = new Map(Object.entries(structs).filter(([name]) => usedTypes.has(name)));
  for (const [, value] of selectedStructs) for (const field of value.fields) if (structs[field.type]) selectedStructs.set(field.type, structs[field.type]);
  const commonStructs: Record<string, string[]> = {
    kernel32: ["FILETIME", "SYSTEMTIME", "SECURITY_ATTRIBUTES", "STARTUPINFOW", "PROCESS_INFORMATION", "WIN32_FIND_DATAW", "OVERLAPPED"],
    user32: ["RECT", "POINT", "MSG", "WNDCLASSEXW", "MONITORINFO"],
    advapi32: ["SECURITY_ATTRIBUTES", "LUID", "TOKEN_PRIVILEGES"], shell32: ["ITEMIDLIST"], ole32: ["GUID", "STATSTG"],
    gdi32: ["BITMAP", "BITMAPINFOHEADER", "LOGFONTW"], ntdll: ["UNICODE_STRING", "OBJECT_ATTRIBUTES", "IO_STATUS_BLOCK"],
    iphlpapi: ["MIB_IF_ROW2", "MIB_IPFORWARD_ROW2"], setupapi: ["SP_DEVINFO_DATA", "SP_DEVICE_INTERFACE_DATA"],
    wtsapi32: ["WTS_SESSION_INFOW"], dwmapi: ["DWM_BLURBEHIND"], "dxgi-d3d11": ["DXGI_SWAP_CHAIN_DESC", "D3D11_BUFFER_DESC"],
  };
  const expectedStructs = new Set(commonStructs[family] ?? []);
  for (const [name, value] of Object.entries(structs)) if (expectedStructs.has(name.split(".").at(-1)!)) selectedStructs.set(name, value);
  const structTable = Object.fromEntries([...selectedStructs].map(([name, value]) => [name.split(".").at(-1), value]));
  for (const [, value] of selectedStructs) for (const field of value.fields) usedTypes.add(field.type);
  const usedShortTypes = new Set([...usedTypes].map(name => name.split(".").at(-1)));
  const enumTable = Object.fromEntries(Object.entries(enums).filter(([name]) => usedTypes.has(name) || usedShortTypes.has(name.split(".").at(-1)!)).map(([name, value]) => [name.split(".").at(-1), value]));
  const signatureTypes: Record<string, Record<string, { args: string[]; returns: string; setLastError: boolean }>> = {};
  for (const fn of selected) (signatureTypes[fn.dll] ??= {})[fn.name] = { args: fn.args, returns: fn.returns, setLastError: fn.setLastError };
  const tsType = (type: string) => type.includes("*") || ["ptr", "string", "object"].includes(type) ? "Pointer" : ({ void: "void", bool: "boolean", i8: "number", u8: "number", i16: "number", u16: "number", i32: "number", u32: "number", i64: "bigint", u64: "bigint", f32: "number", f64: "number", isize: "number", usize: "number" } as Record<string, string>)[type] ?? "Pointer";
  const typeInterfaces = [...perDll].map(([dll, fns]) => {
    const iface = safeName(dll.replace(/\.dll$/, ""));
    const methods = fns.map(fn => `    ${JSON.stringify(fn.name)}: (...args: [${fn.ffiArgs.map(tsType).join(", ")}]) => ${tsType(fn.ffiReturn)};`).join("\n");
    const defaults = Object.entries(aliasesByDll[dll] ?? {}).map(([alias, wide]) => {
      const fn = fns.find(candidate => candidate.name === wide)!;
      return `    ${JSON.stringify(alias)}: (...args: [${fn.ffiArgs.map(tsType).join(", ")}]) => ${tsType(fn.ffiReturn)};`;
    }).join("\n");
    return `export interface ${iface}Symbols {\n${methods}\n${defaults}\n}\nexport interface ${iface}Library { readonly symbols: ${iface}Symbols; close(): void; }`;
  }).join("\n");
  const libraryType = `{ ${[...perDll.keys()].map(dll => `${JSON.stringify(dll)}: ${safeName(dll.replace(/\.dll$/, ""))}Library`).join("; ")} }`;
  const commonTests = `  test("expose les signatures Win32 générées sur toute plateforme", () => {\n    expect(Object.keys(signatures).length).toBeGreaterThan(0);\n    expect(typeof wideAliases).toBe("object");\n    expect(Object.keys(structs).length + Object.keys(enums).length).toBeGreaterThan(0);\n  });`;
  const windowsTests: Record<string, string> = {
    kernel32: `  test.skipIf(process.platform !== "win32")("GetCurrentProcessId renvoie un PID", () => {\n    const process = open()["kernel32.dll"]!.symbols.GetCurrentProcessId();\n    expect(process).toBeGreaterThan(0);\n  });\n  test("FILETIME garde sa taille ABI x64", () => {\n    expect(structs.FILETIME?.size).toBe(8);\n    expect(structs.FILETIME?.fields[1]?.offset).toBe(4);\n  });`,
    user32: `  test.skipIf(process.platform !== "win32")("GetSystemMetrics lit la largeur de l'écran", () => {\n    expect(open()["user32.dll"]!.symbols.GetSystemMetrics(0)).toBeGreaterThan(0);\n  });\n  test("SYSTEM_METRICS_INDEX et RECT gardent l'ABI Win32 x64", () => {\n    expect(enums.SYSTEM_METRICS_INDEX?.SM_CXSCREEN).toBe(0);\n    expect(signatures["user32.dll"]?.GetSystemMetrics.args).toEqual(["Windows.Win32.UI.WindowsAndMessaging.SYSTEM_METRICS_INDEX"]);\n    expect(structs.RECT?.size).toBe(16);\n    expect(structs.RECT?.fields.map(field => field.offset)).toEqual([0, 4, 8, 12]);\n  });`,
    advapi32: `  test.skipIf(process.platform !== "win32")("RegOpenKeyExW ouvre HKCU Software", () => {\n    const library = open()["advapi32.dll"]!.symbols;\n    const path = new Uint16Array([83, 111, 102, 116, 119, 97, 114, 101, 0]);\n    const output = new BigUint64Array(1);\n    const status = library.RegOpenKeyExW(0x80000001n, ptr(path), 0, 0x20019, ptr(output));\n    expect(status).toBe(0);\n    expect(library.RegCloseKey(output[0]!)).toBe(0);\n  });`,
    shell32: `  test.skipIf(process.platform !== "win32")("SHGetKnownFolderPath résout le Bureau", () => {\n    const folder = new Uint8Array([0x3a, 0xcc, 0xbf, 0xb4, 0x2c, 0xdb, 0x4c, 0x42, 0xb0, 0x29, 0x7f, 0xe9, 0x9a, 0x87, 0xc6, 0x41]);\n    const output = new BigUint64Array(1);\n    const status = open()["shell32.dll"]!.symbols.SHGetKnownFolderPath(ptr(folder), 0, 0n, ptr(output));\n    expect(status).toBe(0);\n    expect(output[0]).not.toBe(0n);\n  });`,
  };
  const familyTests: Record<string, string> = {
    advapi32: `  test("RegOpenKeyEx choisit W et garde la variante A", () => {\n    expect(wideAliases.RegOpenKeyEx).toBe("RegOpenKeyExW");\n    expect(signatures["advapi32.dll"]?.RegOpenKeyExA).toBeDefined();\n    expect(signatures["advapi32.dll"]?.RegOpenKeyExW).toBeDefined();\n  });`,
  };
  const testImports = family === "advapi32" || family === "shell32" ? `import { ptr } from "bun:ffi";\n` : "";
  const testFile = `import { describe, expect, test } from "bun:test";\n${testImports}import { enums, open, signatures, structs, wideAliases } from "./index";\n\ndescribe("@aphrody/bun-windows-${family}", () => {\n${commonTests}\n${familyTests[family] ?? ""}\n${windowsTests[family] ?? ""}\n});\n`;
  const ts = `import { dlopen, FFIType } from "bun:ffi";\n\nexport type Pointer = number | bigint | ArrayBuffer | ArrayBufferView;\nexport const structs = ${JSON.stringify(structTable, null, 2)} as const;\nexport const enums = ${JSON.stringify(enumTable, null, 2)} as const;\nexport const wideAliases = ${JSON.stringify(aliases, null, 2)} as const;\nexport const signatures = ${JSON.stringify(signatureTypes, null, 2)} as const;\nconst libraries = ${JSON.stringify(symbolMap, null, 2)} as const;\nconst defaults = ${JSON.stringify(aliasesByDll, null, 2)} as const;\n\nexport function open() {\n  const result: Record<string, unknown> = {};\n  for (const [dll, symbols] of Object.entries(libraries)) {\n    const library = dlopen(dll, symbols as any);\n    const defaultSymbols = { ...library.symbols };\n    for (const [alias, wide] of Object.entries(defaults[dll as keyof typeof defaults] ?? {})) defaultSymbols[alias] = defaultSymbols[wide];\n    result[dll] = { ...library, symbols: defaultSymbols };\n  }\n  return result as ${libraryType};\n}\n`;
  const dts = `export type Pointer = number | bigint | ArrayBuffer | ArrayBufferView;\n${typeInterfaces}\nexport declare const structs: ${JSON.stringify(structTable, null, 2)};\nexport declare const enums: ${JSON.stringify(enumTable, null, 2)};\nexport declare const wideAliases: ${JSON.stringify(aliases, null, 2)};\nexport declare const signatures: ${JSON.stringify(signatureTypes, null, 2)};\nexport declare function open(): ${libraryType};\n`;
  const root = join(OUT, `bun-windows-${family}`);
  return writeFiles(root, {
    "index.ts": ts,
    "index.d.ts": dts,
    "package.json": JSON.stringify({ name: `@aphrody/bun-windows-${family}`, version: "0.0.0", type: "module", exports: { ".": { types: "./index.d.ts", import: "./index.ts" } }, scripts: { test: "bun test" } }, null, 2) + "\n",
    "README.md": `# @aphrody/bun-windows-${family}\n\nDéclarations Win32 pour bun:ffi, générées depuis Microsoft.Windows.SDK.Win32Metadata ${VERSION}. L'ouverture de DLL est explicite et à la demande via open().\n\nDLL couvertes : ${dlls.join(", ")}.\n\n${selected.length} fonctions exportées. Les noms W sont préférés par wideAliases; les variantes A restent accessibles. Les signatures exposent l'indication SetLastError fournie par les métadonnées.\n\nLes tailles et offsets de structures sont fournis dans structs. Les énumérations sont exposées dans enums.\n\nLe texte de licence Microsoft est fourni dans LICENSE-Microsoft.txt.\n`,
    "LICENSE-Microsoft.txt": license,
    "index.test.ts": testFile,
  });
}
async function writeFiles(root: string, files: Record<string, string>) {
  await mkdir(root, { recursive: true });
  for (const [name, content] of Object.entries(files)) { await mkdir(dirname(join(root, name)), { recursive: true }); await writeFile(join(root, name), content); }
}

const args = process.argv.slice(2);
let OUT = DEFAULT_OUT;
let metadataPath: string | undefined;
let all = false;
const selectedFamilies = new Set<string>();
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--metadata") metadataPath = args[++i];
  else if (args[i] === "--out") OUT = resolve(args[++i]);
  else if (args[i] === "--all") all = true;
  else if (args[i] === "--family") selectedFamilies.add(args[++i]);
  else if (args[i] === "--help" || args[i] === "-h") { console.log("Usage: bun scripts/aphrody/win32gen.ts [--metadata fichier.winmd] [--out packages] [--family nom] [--all]"); process.exit(0); }
  else throw new Error(`Option inconnue : ${args[i]}`);
}
if (!metadataPath) {
  const cache = resolve(".lot/sys32/win32metadata");
  await mkdir(cache, { recursive: true });
  const nupkg = join(cache, "metadata.nupkg");
  try { await readFile(nupkg); }
  catch {
    const response = await fetch(`${API}/${PACKAGE.toLowerCase()}/${VERSION.toLowerCase()}/${PACKAGE.toLowerCase()}.${VERSION.toLowerCase()}.nupkg`);
    if (!response.ok) throw new Error(`Téléchargement ${PACKAGE} ${VERSION} impossible : HTTP ${response.status}`);
    await writeFile(nupkg, new Uint8Array(await response.arrayBuffer()));
  }
  const unzip = Bun.spawnSync(["unzip", "-p", nupkg, "Windows.Win32.winmd"]);
  if (unzip.exitCode !== 0) throw new Error(`Extraction de Windows.Win32.winmd impossible : ${unzip.stderr.toString()}`);
  metadataPath = join(cache, "Windows.Win32.winmd");
  await writeFile(metadataPath, unzip.stdout);
  const licenseFile = Bun.spawnSync(["unzip", "-p", nupkg, "sdk_license.txt"]);
  if (licenseFile.exitCode !== 0) throw new Error(`Extraction de sdk_license.txt impossible : ${licenseFile.stderr.toString()}`);
  await writeFile(join(cache, "sdk_license.txt"), licenseFile.stdout);
}
const metadataBytes = metadataInput(new Uint8Array(await readFile(metadataPath)));
const decoded = decode(parseTables(metadataBytes));
const selected = all ? undefined : selectedFamilies.size ? selectedFamilies : new Set(Object.keys(FAMILY_DLLS));
const license = await readFile(resolve(".lot/sys32/win32metadata/package/sdk_license.txt"), "utf8").catch(() => readFile(resolve(".lot/sys32/win32metadata/sdk_license.txt"), "utf8")).catch(() => "Les métadonnées fournies ne précisent pas de fichier de licence ; consulter leurs conditions d'origine avant redistribution.");
  const counts: Record<string, number> = {};
const generatedDlls = new Set<string>();
const dllFamily = new Map<string, string>();
for (const fn of decoded.functions) { const family = familyFor(fn.dll, all); if (family) dllFamily.set(fn.dll, family); }
for (const [dll, family] of dllFamily) {
  if (selected && !selected.has(family)) continue;
  const dlls = all ? [dll] : FAMILY_DLLS[family];
  if (!dlls) continue;
  await generate(family, dlls, decoded.functions, decoded.structs, decoded.enums, license);
  for (const dll of dlls) if (decoded.functions.some(fn => fn.dll.toLowerCase() === dll.toLowerCase())) generatedDlls.add(dll.toLowerCase());
  counts[family] = decoded.functions.filter(fn => dlls.includes(fn.dll.toLowerCase())).length;
}
const dllCounts = new Map<string, number>();
for (const fn of decoded.functions) dllCounts.set(fn.dll.toLowerCase(), (dllCounts.get(fn.dll.toLowerCase()) ?? 0) + 1);
const coverage = [
  "# Couverture Win32 de System32",
  "",
  `Source : Microsoft.Windows.SDK.Win32Metadata ${VERSION} (NuGet). Génération avec scripts/aphrody/win32gen.ts.`,
  "",
  "| DLL | Fonctions | bun:ffi | crate | C++ | .NET |",
  "| --- | ---: | :---: | :---: | :---: | :---: |",
  ...[...dllCounts].sort(([a], [b]) => a.localeCompare(b)).map(([dll, count]) => `| ${dll} | ${count} | ${generatedDlls.has(dll) ? "✓" : ""} | | | |`),
  "",
].join("\n");
await mkdir(dirname(resolve("docs/aphrody/merge/M-windows.md")), { recursive: true });
await writeFile(resolve("docs/aphrody/merge/M-windows.md"), coverage);
console.log(JSON.stringify({ metadata: metadataPath, version: VERSION, functions: decoded.functions.length, structTypes: Object.keys(decoded.structs).length, enumTypes: Object.keys(decoded.enums).length, families: counts }, null, 2));
