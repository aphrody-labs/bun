import { expect, test } from "bun:test";
import { generateHashTables, hashTableHeader, rapidhash } from "../../src/codegen/create-hash-table.ts";

// Expected values come from JavaScriptCore's perl create_hash_table, which create-hash-table.ts replaces.
test("rapidhash matches JSC's create_hash_table on every length branch", () => {
  const keys = [
    "",
    "a",
    "ab",
    "abc",
    "load",
    "version",
    "seventeenCharsKey",
    "thisKeyIsLongerThanFortyEightCharactersForTheWideBranch",
    Buffer.alloc(100, "x").toString(),
  ];
  expect(keys.map(k => rapidhash(new TextEncoder().encode(k)))).toEqual([
    15648162, 16198731, 15900814, 15377330, 7320992, 11290826, 14180558, 11185445, 16589896,
  ]);
});

const fixture = `@begin fooTable
    a                       fnA                             Function 1
    abc                     fnAbc                           Function|DontEnum 2 SomeIntrinsic
    load                    JSBuiltin                       Builtin|Function 1
    name                    jsName                          DontDelete
    version                 versionGetter                   ReadOnly|DontDelete
    cell                    Zig::GlobalObject::m_cell       CellProperty
    klass                   Zig::GlobalObject::m_klass      ClassStructure
    lazy                    constructLazy                   PropertyCallback
    answer                  42                              ConstantInteger
    lexerValue              7
    seventeenCharsKey       fnSeventeen                     Function 0
    thisKeyIsLongerThanFortyEightCharactersForTheWideBranch     fnLong       Function 3
@end
@begin barTable
    only                    fnOnly                          Function 0
@end
`;

test("tables match JSC's create_hash_table byte for byte", () => {
  const index = [
    2, -1, -1, -1, -1, 11, -1, -1, -1, -1, 4, 0, -1, -1, 10, 6, -1, -1, 1, -1, -1, 7, -1, -1, 9, -1, -1, -1, -1, 3, 8,
    5,
  ];
  const expected = `// Automatically generated from - using create_hash_table. DO NOT EDIT!

#include "JSCBuiltins.h"
#include "Lookup.h"

namespace JSC {

static constinit const struct CompactHashIndex fooTableIndex[32] = {
${index.map(i => `    { ${i}, -1 },\n`).join("")}};

static constinit const struct HashTableValue fooTableValues[12] = {
   { "a"_s, static_cast<unsigned>(PropertyAttribute::Function), NoIntrinsic, { HashTableValue::NativeFunctionType, fnA, 1 } },
   { "abc"_s, static_cast<unsigned>(PropertyAttribute::Function|PropertyAttribute::DontEnum), SomeIntrinsic, { HashTableValue::NativeFunctionType, fnAbc, 2 } },
   { "load"_s, ((static_cast<unsigned>(PropertyAttribute::Builtin|PropertyAttribute::Function)) & ~PropertyAttribute::Function) | PropertyAttribute::Builtin, NoIntrinsic, { HashTableValue::BuiltinGeneratorType, fooLoadCodeGenerator, 1 } },
   { "name"_s, static_cast<unsigned>(PropertyAttribute::DontDelete), NoIntrinsic, { HashTableValue::GetterSetterType, jsName, setJSName } },
   { "version"_s, static_cast<unsigned>(PropertyAttribute::ReadOnly|PropertyAttribute::DontDelete), NoIntrinsic, { HashTableValue::GetterSetterType, versionGetter, 0 } },
   { "cell"_s, static_cast<unsigned>(PropertyAttribute::CellProperty), NoIntrinsic, { HashTableValue::LazyCellPropertyType, OBJECT_OFFSETOF(Zig, GlobalObject::m_cell) } },
   { "klass"_s, static_cast<unsigned>(PropertyAttribute::ClassStructure), NoIntrinsic, { HashTableValue::LazyClassStructureType, OBJECT_OFFSETOF(Zig, GlobalObject::m_klass) } },
   { "lazy"_s, static_cast<unsigned>(PropertyAttribute::PropertyCallback), NoIntrinsic, { HashTableValue::LazyPropertyType, constructLazy } },
   { "answer"_s, static_cast<unsigned>(PropertyAttribute::ConstantInteger), NoIntrinsic, { HashTableValue::ConstantType, 42 } },
   { "lexerValue"_s, static_cast<unsigned>(PropertyAttribute::None), NoIntrinsic, { HashTableValue::LexerType, 7 } },
   { "seventeenCharsKey"_s, static_cast<unsigned>(PropertyAttribute::Function), NoIntrinsic, { HashTableValue::NativeFunctionType, fnSeventeen, 0 } },
   { "thisKeyIsLongerThanFortyEightCharactersForTheWideBranch"_s, static_cast<unsigned>(PropertyAttribute::Function), NoIntrinsic, { HashTableValue::NativeFunctionType, fnLong, 3 } },
};

static constinit const struct HashTable fooTable =
    { 12, 31, true, nullptr, fooTableValues, fooTableIndex };

} // namespace JSC

#include "Lookup.h"

namespace JSC {

static constinit const struct CompactHashIndex barTableIndex[2] = {
    { -1, -1 },
    { 0, -1 },
};

static constinit const struct HashTableValue barTableValues[1] = {
   { "only"_s, static_cast<unsigned>(PropertyAttribute::Function), NoIntrinsic, { HashTableValue::NativeFunctionType, fnOnly, 0 } },
};

static constinit const struct HashTable barTable =
    { 1, 1, true, nullptr, barTableValues, barTableIndex };

} // namespace JSC
`;
  expect(generateHashTables(fixture)).toBe(expected);
});

test("colliding keys chain through the overflow area", () => {
  const keys = Array.from({ length: 40 }, (_, i) => `k${i}`);
  const out = generateHashTables(`@begin t\n${keys.map(k => `${k} f Function 0`).join("\n")}\n@end\n`);
  const entries = [...out.matchAll(/\{ (-?\d+), (-?\d+) \},/g)].map(m => [Number(m[1]), Number(m[2])]);
  expect(entries.length).toBeGreaterThan(128);
  expect(entries.slice(0, 128).some(([, link]) => link >= 128)).toBe(true);
  expect(
    entries
      .filter(([value]) => value >= 0)
      .map(([value]) => value)
      .sort((a, b) => a - b),
  ).toEqual(keys.map((_, i) => i));
});

test("the .lut.h header drops includes, namespaces and comments", () => {
  const header = hashTableHeader(`/* @begin barTable\n    only fnOnly Function 0\n@end */`);
  expect(header.startsWith("#pragma once\n// File generated via `create-hash-table.ts`\nstatic constinit")).toBe(true);
  expect(header).toContain("NativeFunctionType, &fnOnly, 0");
  expect(header).not.toContain("namespace JSC");
  expect(header).not.toContain("#include");
});
