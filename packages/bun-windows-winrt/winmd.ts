// ECMA-335 metadata reader for Windows Runtime .winmd files (UnionMetadata\<sdk>\Windows.winmd).
// Reads only what the WinRT family generator needs: types, methods, params, interfaces, enums, attributes.

const T = {
  Module: 0x00,
  TypeRef: 0x01,
  TypeDef: 0x02,
  FieldPtr: 0x03,
  Field: 0x04,
  MethodPtr: 0x05,
  MethodDef: 0x06,
  ParamPtr: 0x07,
  Param: 0x08,
  InterfaceImpl: 0x09,
  MemberRef: 0x0a,
  Constant: 0x0b,
  CustomAttribute: 0x0c,
  FieldMarshal: 0x0d,
  DeclSecurity: 0x0e,
  ClassLayout: 0x0f,
  FieldLayout: 0x10,
  StandAloneSig: 0x11,
  EventMap: 0x12,
  EventPtr: 0x13,
  Event: 0x14,
  PropertyMap: 0x15,
  PropertyPtr: 0x16,
  Property: 0x17,
  MethodSemantics: 0x18,
  MethodImpl: 0x19,
  ModuleRef: 0x1a,
  TypeSpec: 0x1b,
  ImplMap: 0x1c,
  FieldRVA: 0x1d,
  ENCLog: 0x1e,
  ENCMap: 0x1f,
  Assembly: 0x20,
  AssemblyProcessor: 0x21,
  AssemblyOS: 0x22,
  AssemblyRef: 0x23,
  AssemblyRefProcessor: 0x24,
  AssemblyRefOS: 0x25,
  File: 0x26,
  ExportedType: 0x27,
  ManifestResource: 0x28,
  NestedClass: 0x29,
  GenericParam: 0x2a,
  MethodSpec: 0x2b,
  GenericParamConstraint: 0x2c,
} as const;

const CODED: Record<string, { bits: number; tables: number[] }> = {
  TypeDefOrRef: { bits: 2, tables: [T.TypeDef, T.TypeRef, T.TypeSpec] },
  HasConstant: { bits: 2, tables: [T.Field, T.Param, T.Property] },
  HasCustomAttribute: {
    bits: 5,
    tables: [
      T.MethodDef,
      T.Field,
      T.TypeRef,
      T.TypeDef,
      T.Param,
      T.InterfaceImpl,
      T.MemberRef,
      T.Module,
      T.DeclSecurity,
      T.Property,
      T.Event,
      T.StandAloneSig,
      T.ModuleRef,
      T.TypeSpec,
      T.Assembly,
      T.AssemblyRef,
      T.File,
      T.ExportedType,
      T.ManifestResource,
      T.GenericParam,
      T.GenericParamConstraint,
      T.MethodSpec,
    ],
  },
  HasFieldMarshal: { bits: 1, tables: [T.Field, T.Param] },
  HasDeclSecurity: { bits: 2, tables: [T.TypeDef, T.MethodDef, T.Assembly] },
  MemberRefParent: { bits: 3, tables: [T.TypeDef, T.TypeRef, T.ModuleRef, T.MethodDef, T.TypeSpec] },
  HasSemantics: { bits: 1, tables: [T.Event, T.Property] },
  MethodDefOrRef: { bits: 1, tables: [T.MethodDef, T.MemberRef] },
  MemberForwarded: { bits: 1, tables: [T.Field, T.MethodDef] },
  Implementation: { bits: 2, tables: [T.File, T.AssemblyRef, T.ExportedType] },
  CustomAttributeType: { bits: 3, tables: [T.MethodDef, T.MemberRef] },
  ResolutionScope: { bits: 2, tables: [T.Module, T.ModuleRef, T.AssemblyRef, T.TypeRef] },
  TypeOrMethodDef: { bits: 1, tables: [T.TypeDef, T.MethodDef] },
};

// Column kinds: 1/2/4 fixed, "S" string, "G" guid, "B" blob, ["t", table], ["c", coded].
type Col = 1 | 2 | 4 | "S" | "G" | "B" | ["t", number] | ["c", string];
const t = (id: number): Col => ["t", id];
const c = (name: string): Col => ["c", name];
const SCHEMA: Record<number, Col[]> = {
  [T.Module]: [2, "S", "G", "G", "G"],
  [T.TypeRef]: [c("ResolutionScope"), "S", "S"],
  [T.TypeDef]: [4, "S", "S", c("TypeDefOrRef"), t(T.Field), t(T.MethodDef)],
  [T.FieldPtr]: [t(T.Field)],
  [T.Field]: [2, "S", "B"],
  [T.MethodPtr]: [t(T.MethodDef)],
  [T.MethodDef]: [4, 2, 2, "S", "B", t(T.Param)],
  [T.ParamPtr]: [t(T.Param)],
  [T.Param]: [2, 2, "S"],
  [T.InterfaceImpl]: [t(T.TypeDef), c("TypeDefOrRef")],
  [T.MemberRef]: [c("MemberRefParent"), "S", "B"],
  [T.Constant]: [1, 1, c("HasConstant"), "B"],
  [T.CustomAttribute]: [c("HasCustomAttribute"), c("CustomAttributeType"), "B"],
  [T.FieldMarshal]: [c("HasFieldMarshal"), "B"],
  [T.DeclSecurity]: [2, c("HasDeclSecurity"), "B"],
  [T.ClassLayout]: [2, 4, t(T.TypeDef)],
  [T.FieldLayout]: [4, t(T.Field)],
  [T.StandAloneSig]: ["B"],
  [T.EventMap]: [t(T.TypeDef), t(T.Event)],
  [T.EventPtr]: [t(T.Event)],
  [T.Event]: [2, "S", c("TypeDefOrRef")],
  [T.PropertyMap]: [t(T.TypeDef), t(T.Property)],
  [T.PropertyPtr]: [t(T.Property)],
  [T.Property]: [2, "S", "B"],
  [T.MethodSemantics]: [2, t(T.MethodDef), c("HasSemantics")],
  [T.MethodImpl]: [t(T.TypeDef), c("MethodDefOrRef"), c("MethodDefOrRef")],
  [T.ModuleRef]: ["S"],
  [T.TypeSpec]: ["B"],
  [T.ImplMap]: [2, c("MemberForwarded"), "S", t(T.ModuleRef)],
  [T.FieldRVA]: [4, t(T.Field)],
  [T.ENCLog]: [4, 4],
  [T.ENCMap]: [4],
  [T.Assembly]: [4, 2, 2, 2, 2, 4, "B", "S", "S"],
  [T.AssemblyProcessor]: [4],
  [T.AssemblyOS]: [4, 4, 4],
  [T.AssemblyRef]: [2, 2, 2, 2, 4, "B", "S", "S", "B"],
  [T.AssemblyRefProcessor]: [4, t(T.AssemblyRef)],
  [T.AssemblyRefOS]: [4, 4, 4, t(T.AssemblyRef)],
  [T.File]: [4, "S", "B"],
  [T.ExportedType]: [4, 4, "S", "S", c("Implementation")],
  [T.ManifestResource]: [4, 4, "S", c("Implementation")],
  [T.NestedClass]: [t(T.TypeDef), t(T.TypeDef)],
  [T.GenericParam]: [2, 2, c("TypeOrMethodDef"), "S"],
  [T.MethodSpec]: [c("MethodDefOrRef"), "B"],
  [T.GenericParamConstraint]: [t(T.GenericParam), c("TypeDefOrRef")],
};

export type TypeSig =
  | { kind: "prim"; name: string }
  | { kind: "string" }
  | { kind: "object" }
  | { kind: "named"; ns: string; name: string; valueType: boolean }
  | { kind: "generic"; base: TypeSig; args: TypeSig[] }
  | { kind: "array"; elem: TypeSig }
  | { kind: "byref"; inner: TypeSig }
  | { kind: "var"; index: number }
  | { kind: "unknown"; code: number };

const PRIM: Record<number, string> = {
  0x01: "void",
  0x02: "bool",
  0x03: "char16",
  0x04: "i8",
  0x05: "u8",
  0x06: "i16",
  0x07: "u16",
  0x08: "i32",
  0x09: "u32",
  0x0a: "i64",
  0x0b: "u64",
  0x0c: "f32",
  0x0d: "f64",
  0x18: "isize",
  0x19: "usize",
};

export class Winmd {
  private view: DataView;
  private bytes: Uint8Array;
  private strings = 0;
  private blob = 0;
  private guid = 0;
  private rows: number[] = new Array(64).fill(0);
  private tableOffset: number[] = new Array(64).fill(0);
  private rowSize: number[] = new Array(64).fill(0);
  private colOffsets: number[][] = [];
  private colSizes: number[][] = [];
  private decoder = new TextDecoder();

  constructor(data: Uint8Array) {
    this.bytes = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const v = this.view;
    const pe = v.getUint32(0x3c, true);
    const sections = v.getUint16(pe + 6, true);
    const optSize = v.getUint16(pe + 20, true);
    const opt = pe + 24;
    const magic = v.getUint16(opt, true);
    const dirs = opt + (magic === 0x20b ? 112 : 96);
    const cliRva = v.getUint32(dirs + 14 * 8, true);
    const secTable = opt + optSize;
    const rvaToOffset = (rva: number) => {
      for (let i = 0; i < sections; i++) {
        const s = secTable + i * 40;
        const va = v.getUint32(s + 12, true);
        const size = Math.max(v.getUint32(s + 8, true), v.getUint32(s + 16, true));
        if (rva >= va && rva < va + size) return rva - va + v.getUint32(s + 20, true);
      }
      throw new Error(`rva ${rva} outside sections`);
    };
    const cli = rvaToOffset(cliRva);
    const root = rvaToOffset(v.getUint32(cli + 8, true));
    if (v.getUint32(root, true) !== 0x424a5342) throw new Error("not a metadata root");
    const versionLength = v.getUint32(root + 12, true);
    let p = root + 16 + versionLength + 2;
    const streams = v.getUint16(p, true);
    p += 2;
    let tables = 0;
    for (let i = 0; i < streams; i++) {
      const offset = root + v.getUint32(p, true);
      p += 8;
      let end = p;
      while (data[end] !== 0) end++;
      const name = this.decoder.decode(data.subarray(p, end));
      p = (end + 4) & ~3;
      if (name === "#~" || name === "#-") tables = offset;
      else if (name === "#Strings") this.strings = offset;
      else if (name === "#Blob") this.blob = offset;
      else if (name === "#GUID") this.guid = offset;
    }
    const heapSizes = data[tables + 6];
    const valid = v.getBigUint64(tables + 8, true);
    p = tables + 24;
    for (let i = 0; i < 64; i++) {
      if ((valid >> BigInt(i)) & 1n) {
        this.rows[i] = v.getUint32(p, true);
        p += 4;
      }
    }
    const strSize = heapSizes & 1 ? 4 : 2;
    const guidSize = heapSizes & 2 ? 4 : 2;
    const blobSize = heapSizes & 4 ? 4 : 2;
    const sizeOf = (col: Col): number => {
      if (typeof col === "number") return col;
      if (col === "S") return strSize;
      if (col === "G") return guidSize;
      if (col === "B") return blobSize;
      if (col[0] === "t") return this.rows[col[1]] < 0x10000 ? 2 : 4;
      const coded = CODED[col[1]];
      const max = Math.max(...coded.tables.map(id => this.rows[id]));
      return max < 1 << (16 - coded.bits) ? 2 : 4;
    };
    for (let id = 0; id < 64; id++) {
      const schema = SCHEMA[id];
      if (!schema) continue;
      const sizes = schema.map(sizeOf);
      const offsets: number[] = [];
      let acc = 0;
      for (const s of sizes) {
        offsets.push(acc);
        acc += s;
      }
      this.colSizes[id] = sizes;
      this.colOffsets[id] = offsets;
      this.rowSize[id] = acc;
    }
    for (let id = 0; id < 64; id++) {
      if (!this.rows[id]) continue;
      if (!SCHEMA[id]) throw new Error(`unsupported metadata table 0x${id.toString(16)}`);
      this.tableOffset[id] = p;
      p += this.rows[id] * this.rowSize[id];
    }
  }

  count(table: number) {
    return this.rows[table];
  }

  /** Raw column value; rows are 1-based. */
  col(table: number, row: number, column: number): number {
    const at = this.tableOffset[table] + (row - 1) * this.rowSize[table] + this.colOffsets[table][column];
    return this.colSizes[table][column] === 2
      ? this.view.getUint16(at, true)
      : this.colSizes[table][column] === 1
        ? this.bytes[at]
        : this.view.getUint32(at, true);
  }

  str(table: number, row: number, column: number): string {
    const start = this.strings + this.col(table, row, column);
    let end = start;
    while (this.bytes[end] !== 0) end++;
    return this.decoder.decode(this.bytes.subarray(start, end));
  }

  blobAt(table: number, row: number, column: number): Uint8Array {
    let p = this.blob + this.col(table, row, column);
    const b = this.bytes[p];
    let len: number;
    if ((b & 0x80) === 0) {
      len = b;
      p += 1;
    } else if ((b & 0xc0) === 0x80) {
      len = ((b & 0x3f) << 8) | this.bytes[p + 1];
      p += 2;
    } else {
      len = ((b & 0x1f) << 24) | (this.bytes[p + 1] << 16) | (this.bytes[p + 2] << 8) | this.bytes[p + 3];
      p += 4;
    }
    return this.bytes.subarray(p, p + len);
  }

  decode(coded: string, value: number): [table: number, row: number] {
    const { bits, tables } = CODED[coded];
    const tag = value & ((1 << bits) - 1);
    if (coded === "CustomAttributeType") return [tag === 2 ? T.MethodDef : T.MemberRef, value >>> bits];
    return [tables[tag], value >>> bits];
  }

  /** Range [first, last) of child rows owned by a parent row through a list column. */
  range(table: number, row: number, column: number, child: number): [number, number] {
    const first = this.col(table, row, column);
    const last = row < this.rows[table] ? this.col(table, row + 1, column) : this.rows[child] + 1;
    return [first, last];
  }

  typeName(table: number, row: number): { ns: string; name: string } {
    if (table === T.TypeDef) return { ns: this.str(T.TypeDef, row, 2), name: this.str(T.TypeDef, row, 1) };
    if (table === T.TypeRef) return { ns: this.str(T.TypeRef, row, 2), name: this.str(T.TypeRef, row, 1) };
    return { ns: "", name: `TypeSpec#${row}` };
  }

  parseType(sig: Uint8Array, pos: { p: number }): TypeSig {
    const code = sig[pos.p++];
    if (PRIM[code]) return { kind: "prim", name: PRIM[code] };
    switch (code) {
      case 0x0e:
        return { kind: "string" };
      case 0x1c:
        return { kind: "object" };
      case 0x10:
        return { kind: "byref", inner: this.parseType(sig, pos) };
      case 0x1d:
        return { kind: "array", elem: this.parseType(sig, pos) };
      case 0x11:
      case 0x12: {
        const [table, row] = decodeTdor(readCompressed(sig, pos));
        return { kind: "named", ...this.typeName(table, row), valueType: code === 0x11 };
      }
      case 0x13:
      case 0x1e:
        return { kind: "var", index: readCompressed(sig, pos) };
      case 0x15: {
        const base = this.parseType(sig, pos);
        const n = readCompressed(sig, pos);
        const args: TypeSig[] = [];
        for (let i = 0; i < n; i++) args.push(this.parseType(sig, pos));
        return { kind: "generic", base, args };
      }
      case 0x1f:
      case 0x20:
        readCompressed(sig, pos);
        return this.parseType(sig, pos);
      default:
        return { kind: "unknown", code };
    }
  }

  methodSig(row: number): { ret: TypeSig; params: TypeSig[] } {
    const sig = this.blobAt(T.MethodDef, row, 4);
    const pos = { p: 0 };
    const conv = sig[pos.p++];
    if (conv & 0x10) readCompressed(sig, pos);
    const n = readCompressed(sig, pos);
    const ret = this.parseType(sig, pos);
    const params: TypeSig[] = [];
    for (let i = 0; i < n; i++) params.push(this.parseType(sig, pos));
    return { ret, params };
  }
}

export function readCompressed(sig: Uint8Array, pos: { p: number }): number {
  const b = sig[pos.p];
  if ((b & 0x80) === 0) {
    pos.p += 1;
    return b;
  }
  if ((b & 0xc0) === 0x80) {
    pos.p += 2;
    return ((b & 0x3f) << 8) | sig[pos.p - 1];
  }
  pos.p += 4;
  return ((b & 0x1f) << 24) | (sig[pos.p - 3] << 16) | (sig[pos.p - 2] << 8) | sig[pos.p - 1];
}

function decodeTdor(value: number): [number, number] {
  return [[T.TypeDef, T.TypeRef, T.TypeSpec][value & 3], value >>> 2];
}

export const Tables = T;
