// WinRT metadata model built from a .winmd file: interfaces (IID, ABI methods with vtable slots), runtime
// classes (default interface, statics, activatable/composable factories), enums and delegates. Used by
// scripts/aphrody/winrt/gen.ts to write the bun:windows families and at runtime (loadMetadata) to bind a
// framework's own metadata, such as the installed Windows App SDK for bun:winui.
import { readFileSync } from "node:fs";
import { Tables as T, Winmd, type TypeSig } from "./winmd.ts";

export type Namespace = {
  interfaces: Record<string, unknown>;
  classes: Record<string, unknown>;
  enums: Record<string, unknown>;
  delegates?: Record<string, unknown>;
};

export function loadModel(path: string) {
  const md = new Winmd(new Uint8Array(readFileSync(path)));
  const typeKind = new Map<string, { row: number; kind: string }>();
  const nameOf = (row: number) => `${md.str(T.TypeDef, row, 2)}.${md.str(T.TypeDef, row, 1)}`;

  // Custom attributes keyed by "<table>:<row>".
  const attrs = new Map<string, { name: string; blob: Uint8Array }[]>();
  for (let row = 1; row <= md.count(T.CustomAttribute); row++) {
    const [parentTable, parentRow] = md.decode("HasCustomAttribute", md.col(T.CustomAttribute, row, 0));
    const [ctorTable, ctorRow] = md.decode("CustomAttributeType", md.col(T.CustomAttribute, row, 1));
    let name = "";
    if (ctorTable === T.MemberRef) {
      const [ownerTable, ownerRow] = md.decode("MemberRefParent", md.col(T.MemberRef, ctorRow, 0));
      name = md.typeName(ownerTable, ownerRow).name;
    }
    const key = `${parentTable}:${parentRow}`;
    if (!attrs.has(key)) attrs.set(key, []);
    attrs.get(key)!.push({ name, blob: md.blobAt(T.CustomAttribute, row, 2) });
  }
  const attr = (table: number, row: number, name: string) =>
    attrs.get(`${table}:${row}`)?.filter(a => a.name === name) ?? [];

  for (let row = 1; row <= md.count(T.TypeDef); row++) {
    const flags = md.col(T.TypeDef, row, 0);
    const ns = md.str(T.TypeDef, row, 2);
    if (!ns) continue;
    let kind = "class";
    if (flags & 0x20) kind = "interface";
    else {
      const extendsValue = md.col(T.TypeDef, row, 3);
      if (extendsValue) {
        const [table, r] = md.decode("TypeDefOrRef", extendsValue);
        const base = md.typeName(table, r);
        if (base.ns === "System" && base.name === "Enum") kind = "enum";
        else if (base.ns === "System" && base.name === "ValueType") kind = "struct";
        else if (base.ns === "System" && base.name === "MulticastDelegate") kind = "delegate";
        else if (base.ns === "System" && base.name === "Attribute") kind = "attribute";
      }
    }
    typeKind.set(nameOf(row), { row, kind });
  }

  const guidOf = (row: number) => {
    const blob = attr(T.TypeDef, row, "GuidAttribute")[0]?.blob;
    if (!blob) return undefined;
    const v = new DataView(blob.buffer, blob.byteOffset + 2, 16);
    const hex = (n: number, w: number) => n.toString(16).padStart(w, "0");
    const d4 = Array.from(blob.subarray(10, 18), b => hex(b, 2)).join("");
    return `${hex(v.getUint32(0, true), 8)}-${hex(v.getUint16(4, true), 4)}-${hex(v.getUint16(6, true), 4)}-${d4.slice(0, 4)}-${d4.slice(4)}`;
  };

  const serString = (blob: Uint8Array, p: number) => {
    const len = blob[p];
    return new TextDecoder().decode(blob.subarray(p + 1, p + 1 + len));
  };

  const enumUnderlying = (row: number) => {
    const [first, last] = md.range(T.TypeDef, row, 4, T.Field);
    for (let f = first; f < last; f++) {
      if (md.str(T.Field, f, 1) === "value__") return md.blobAt(T.Field, f, 2)[1] === 0x09 ? "u32" : "i32";
    }
    return "i32";
  };

  // Generic instantiations become ["TypedEventHandler", "Object", "Ns.Type", ...] (see signatureOf in index.js).
  const genericType = (sig: TypeSig): unknown => {
    switch (sig.kind) {
      case "object":
        return "Object";
      case "string":
        return "String";
      case "prim":
        return sig.name;
      case "named":
        return `${sig.ns}.${sig.name}`;
      case "generic": {
        const base = sig.base.kind === "named" ? sig.base : undefined;
        const name = base ? base.name.replace(/`\d+$/, "") : "Object";
        const foundation = base?.ns === "Windows.Foundation" || base?.ns === "Windows.Foundation.Collections";
        return [foundation ? name : `${base?.ns}.${name}`, ...sig.args.map(genericType)];
      }
      default:
        return "Object";
    }
  };

  const typeOfRef = (coded: number): unknown => {
    const [table, r] = md.decode("TypeDefOrRef", coded);
    if (table === T.TypeSpec) return genericType(md.parseType(md.blobAt(T.TypeSpec, r, 0), { p: 0 }));
    const n = md.typeName(table, r);
    return `${n.ns}.${n.name}`;
  };

  // [kind, type, unsupported reason]
  const marshal = (sig: TypeSig): [string, unknown, string?] => {
    switch (sig.kind) {
      case "prim":
        return ["prim", sig.name];
      case "string":
        return ["hstring", ""];
      case "object":
        return ["object", ""];
      case "generic":
        return ["object", genericType(sig)];
      case "named": {
        const full = `${sig.ns}.${sig.name}`;
        const info = typeKind.get(full);
        if (info?.kind === "enum") return ["prim", enumUnderlying(info.row)];
        if (info?.kind === "interface") return ["iface", full];
        if (info?.kind === "class") return ["class", full];
        if (info?.kind === "delegate") return ["object", full];
        // EventRegistrationToken { int64 value } travels as a plain 64-bit integer.
        if (full === "Windows.Foundation.EventRegistrationToken") return ["prim", "i64"];
        return ["object", full, sig.valueType ? `struct ${full} by value` : undefined];
      }
      case "array":
        return ["object", "", "array parameter"];
      default:
        return ["object", "", `signature ${sig.kind}`];
    }
  };

  const interfaceDesc = (row: number) => {
    const [first, last] = md.range(T.TypeDef, row, 5, T.MethodDef);
    const methods: unknown[] = [];
    let slot = 6;
    for (let m = first; m < last; m++, slot++) {
      // Overloaded methods keep their ABI name (OverloadAttribute), which is also unique in JS.
      const overload = attr(T.MethodDef, m, "OverloadAttribute")[0];
      const name = overload ? serString(overload.blob, 2) : md.str(T.MethodDef, m, 3);
      const sig = md.methodSig(m);
      const [pFirst, pLast] = md.range(T.MethodDef, m, 5, T.Param);
      const flagsBySeq = new Map<number, number>();
      for (let p = pFirst; p < pLast; p++) flagsBySeq.set(md.col(T.Param, p, 1), md.col(T.Param, p, 0));
      let unsupported: string | undefined;
      const params = sig.params.map((ps, i) => {
        const out = (flagsBySeq.get(i + 1) ?? 0) & 2 || ps.kind === "byref";
        const inner = ps.kind === "byref" ? ps.inner : ps;
        const [kind, type, reason] = marshal(inner);
        unsupported ??= reason;
        return [out ? "out" : "in", kind, type];
      });
      let ret: unknown = null;
      if (!(sig.ret.kind === "prim" && sig.ret.name === "void")) {
        const [kind, type, reason] = marshal(sig.ret);
        unsupported ??= reason;
        ret = [kind, type];
      }
      methods.push(unsupported ? [name, slot, params, ret, unsupported] : [name, slot, params, ret]);
    }
    return { iid: guidOf(row), methods };
  };

  // Field row -> Constant row, built once (enum values).
  let constants: Map<number, number> | undefined;
  const fieldConstants = () => {
    if (constants) return constants;
    constants = new Map();
    for (let k = 1; k <= md.count(T.Constant); k++) {
      const [table, r] = md.decode("HasConstant", md.col(T.Constant, k, 2));
      if (table === T.Field) constants.set(r, k);
    }
    return constants;
  };

  // Class row -> its InterfaceImpl rows, built once (default interfaces).
  let impls: Map<number, number[]> | undefined;
  const interfaceImpls = () => {
    if (impls) return impls;
    impls = new Map();
    for (let i = 1; i <= md.count(T.InterfaceImpl); i++) {
      const owner = md.col(T.InterfaceImpl, i, 0);
      let list = impls.get(owner);
      if (!list) impls.set(owner, (list = []));
      list.push(i);
    }
    return impls;
  };

  const namespaces = new Map<string, Namespace>();
  const bucket = (ns: string) => {
    if (!namespaces.has(ns)) namespaces.set(ns, { interfaces: {}, classes: {}, enums: {} });
    return namespaces.get(ns)!;
  };

  for (const [full, { row, kind }] of typeKind) {
    if (full.includes("`")) continue;
    const ns = md.str(T.TypeDef, row, 2);
    if (kind === "interface") {
      const desc = interfaceDesc(row);
      if (desc.iid) bucket(ns).interfaces[full] = desc;
    } else if (kind === "delegate") {
      // Delegates keep their IID and the [kind, type] of each Invoke argument (COM callbacks built in JS).
      const iid = guidOf(row);
      const [first, last] = md.range(T.TypeDef, row, 5, T.MethodDef);
      for (let m = first; m < last; m++) {
        if (md.str(T.MethodDef, m, 3) !== "Invoke") continue;
        const params = md.methodSig(m).params.map(ps => marshal(ps).slice(0, 2));
        if (iid) (bucket(ns).delegates ??= {})[full] = { iid, params };
      }
    } else if (kind === "enum") {
      const values: Record<string, number> = {};
      const [first, last] = md.range(T.TypeDef, row, 4, T.Field);
      for (let f = first; f < last; f++) {
        const name = md.str(T.Field, f, 1);
        if (name === "value__") continue;
        const k = fieldConstants().get(f);
        if (k !== undefined) {
          const blob = md.blobAt(T.Constant, k, 3);
          values[name] = new DataView(blob.buffer, blob.byteOffset, 4).getInt32(0, true);
        }
      }
      bucket(ns).enums[full] = values;
    } else if (kind === "class") {
      const statics: string[] = [];
      const factories: string[] = [];
      let activatable = false;
      for (const a of attr(T.TypeDef, row, "StaticAttribute")) statics.push(serString(a.blob, 2));
      for (const a of attr(T.TypeDef, row, "ActivatableAttribute")) {
        // ActivatableAttribute(uint version[, string platform]) vs ActivatableAttribute(Type factory, uint version).
        if (a.blob.length >= 6 && a.blob[2] > 4 && a.blob[3] !== 0) {
          const name = serString(a.blob, 2);
          if (name.includes(".")) {
            factories.push(name);
            continue;
          }
        }
        activatable = true;
      }
      // ComposableAttribute(Type factory, CompositionType type, uint version): CreateInstance(outer, out inner).
      for (const a of attr(T.TypeDef, row, "ComposableAttribute")) factories.push(serString(a.blob, 2));
      let defaultInterface: unknown;
      const interfaces: unknown[] = [];
      for (const i of interfaceImpls().get(row) ?? []) {
        const type = typeOfRef(md.col(T.InterfaceImpl, i, 1));
        interfaces.push(type);
        if (attr(T.InterfaceImpl, i, "DefaultAttribute").length !== 0) defaultInterface = type;
      }
      const extendsValue = md.col(T.TypeDef, row, 3);
      const base = extendsValue ? (typeOfRef(extendsValue) as string) : undefined;
      bucket(ns).classes[full] = {
        defaultInterface,
        statics,
        factories,
        activatable,
        ...(base && base !== "System.Object" ? { base } : {}),
        interfaces,
      };
    }
  }
  return namespaces;
}
