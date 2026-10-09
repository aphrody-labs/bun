// Generates the bun:windows WinRT families from the local Windows SDK metadata:
//   bun scripts/aphrody/winrt/gen.ts [--sdk 10.0.26100.0] [--all] Windows.System.Profile Windows.Storage ...
// Each namespace becomes packages/bun-windows-winrt-<namespace>, loaded by windows.family("winrt-<namespace>").
// Only data derived from Windows.winmd is written; SDK headers are never copied.
import { join } from "node:path";
import { Tables as T, Winmd, type TypeSig } from "./winmd.ts";

const args = process.argv.slice(2);
const sdkIndex = args.indexOf("--sdk");
const sdk = sdkIndex >= 0 ? args.splice(sdkIndex, 2)[1] : "10.0.26100.0";
const all = args.includes("--all");
const kits = process.env.WindowsSdkDir ?? "C:/Program Files (x86)/Windows Kits/10";
const winmdPath = join(kits, "UnionMetadata", sdk, "Windows.winmd");
const repo = join(import.meta.dir, "..", "..", "..");

export function familyName(ns: string) {
  return `winrt-${ns.toLowerCase().replaceAll(".", "-")}`;
}

export function loadModel(path = winmdPath) {
  const md = new Winmd(new Uint8Array(require("node:fs").readFileSync(path)));
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

  // [kind, type, unsupported reason]
  const marshal = (sig: TypeSig): [string, string, string?] => {
    switch (sig.kind) {
      case "prim":
        return ["prim", sig.name];
      case "string":
        return ["hstring", ""];
      case "object":
        return ["object", ""];
      case "generic":
        return ["object", ""];
      case "named": {
        const full = `${sig.ns}.${sig.name}`;
        const info = typeKind.get(full);
        if (info?.kind === "enum") return ["prim", enumUnderlying(info.row)];
        if (info?.kind === "interface") return ["iface", full];
        if (info?.kind === "class") return ["class", full];
        if (info?.kind === "delegate") return ["object", full];
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

  const namespaces = new Map<
    string,
    { interfaces: Record<string, unknown>; classes: Record<string, unknown>; enums: Record<string, unknown> }
  >();
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
    } else if (kind === "enum") {
      const values: Record<string, number> = {};
      const [first, last] = md.range(T.TypeDef, row, 4, T.Field);
      for (let f = first; f < last; f++) {
        const name = md.str(T.Field, f, 1);
        if (name === "value__") continue;
        for (let k = 1; k <= md.count(T.Constant); k++) {
          const [table, r] = md.decode("HasConstant", md.col(T.Constant, k, 2));
          if (table === T.Field && r === f) {
            const blob = md.blobAt(T.Constant, k, 3);
            values[name] = new DataView(blob.buffer, blob.byteOffset, 4).getInt32(0, true);
            break;
          }
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
      let defaultInterface: string | undefined;
      for (let i = 1; i <= md.count(T.InterfaceImpl); i++) {
        if (md.col(T.InterfaceImpl, i, 0) !== row) continue;
        if (attr(T.InterfaceImpl, i, "DefaultAttribute").length === 0) continue;
        const [table, r] = md.decode("TypeDefOrRef", md.col(T.InterfaceImpl, i, 1));
        const n = md.typeName(table, r);
        defaultInterface = `${n.ns}.${n.name}`;
      }
      bucket(ns).classes[full] = { defaultInterface, statics, factories, activatable };
    }
  }
  return namespaces;
}

if (import.meta.main) {
  const model = loadModel();
  const wanted = all ? [...model.keys()] : args.filter(a => !a.startsWith("--"));
  for (const ns of wanted) {
    const data = model.get(ns);
    if (!data) throw new Error(`namespace ${ns} not found in ${winmdPath}`);
    const family = familyName(ns);
    const dir = join(repo, "packages", `bun-windows-${family}`);
    const pkg = {
      name: `@aphrody/bun-windows-${family}`,
      version: sdk,
      description: `bun:windows WinRT family for ${ns}, generated from Windows SDK ${sdk} metadata`,
      license: "MIT",
      main: "index.js",
      dependencies: { "@aphrody/bun-windows-winrt": "workspace:*" },
    };
    const index = `// Generated by scripts/aphrody/winrt/gen.ts from UnionMetadata\\${sdk}\\Windows.winmd. Do not edit.
let winrt;
try {
  winrt = require("@aphrody/bun-windows-winrt");
} catch {
  winrt = require("../bun-windows-winrt/index.js");
}
module.exports = winrt.defineNamespace(${JSON.stringify({ namespace: ns, ...data })});
`;
    await Bun.write(join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
    await Bun.write(join(dir, "index.js"), index);
    const counts = [
      Object.keys(data.interfaces).length,
      Object.keys(data.classes).length,
      Object.keys(data.enums).length,
    ];
    console.log(
      `${ns} -> packages/bun-windows-${family} (${counts[0]} interfaces, ${counts[1]} classes, ${counts[2]} enums)`,
    );
  }
}
