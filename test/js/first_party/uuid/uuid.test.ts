import { expect, test } from "bun:test";
import { MAX, NIL, parse, stringify, v1, v1ToV6, v3, v4, v5, v6, v6ToV1, v7, validate, version } from "uuid";

const random = () => Uint8Array.from({ length: 16 }, (_, i) => (i * 37 + 11) & 0xff);

test("uuid resolves to the built-in module", () => {
  expect(require.resolve("uuid")).toBe("uuid");
});

test("uuid name-based versions match the npm vectors", () => {
  expect(v5("example.com", v5.DNS)).toBe("cfbff0d1-9375-5685-968c-48ce8b15ae17");
  expect(v3("example.com", v3.DNS)).toBe("9073926b-929f-31c2-abc9-fad77ae3e8eb");
  expect(v5.URL).toBe("6ba7b811-9dad-11d1-80b4-00c04fd430c8");
});

test("uuid time-based and random versions match the npm vectors", () => {
  expect(v1({ random: random(), msecs: 1700000000123, nsecs: 42, clockseq: 0x1234, node: [1, 2, 3, 4, 5, 6] })).toBe(
    "04c284da-833b-11ee-9234-010203040506",
  );
  expect(v6({ random: random(), msecs: 1700000000123, nsecs: 7 })).toBe("1ee833b0-4c28-64b7-b358-7da2c7ec1136");
  expect(v7({ random: random(), msecs: 1700000000123 })).toBe("018bcfe5-687b-7970-b8cd-61a2c7ec1136");
  expect(v4({ random: random() })).toBe("0b30557a-9fc4-490e-b358-7da2c7ec1136");
});

test("uuid helpers", () => {
  const id = v4();
  expect(validate(id)).toBe(true);
  expect(version(id)).toBe(4);
  expect(stringify(parse(id))).toBe(id);
  expect(validate(NIL) && validate(MAX)).toBe(true);
  expect(validate("nope")).toBe(false);
  expect(() => parse("nope")).toThrow("Invalid UUID");
  const t = v1({ random: random(), msecs: 1700000000123 });
  expect(v6ToV1(v1ToV6(t))).toBe(t);
  const buf = new Uint8Array(20);
  expect(v4({ random: random() }, buf, 2)).toBe(buf);
  expect(() => v4({}, new Uint8Array(10), 0)).toThrow(RangeError);
});

test("uuid v7 is monotonic", () => {
  const ids = Array.from({ length: 1000 }, () => v7());
  expect(ids.toSorted()).toEqual(ids);
  expect(version(ids[0])).toBe(7);
});
