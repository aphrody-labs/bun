import { describe, expect, test } from "bun:test";
for (let d = 0; d < 20; d++)
  describe(`suite ${d}`, () => {
    for (let t = 0; t < 50; t++)
      test(`case ${t}`, () => {
        expect({ a: t, b: [d, t] }).toEqual({ a: t, b: [d, t] });
        expect(String(t * d)).toMatch(/^\d+$/);
      });
  });
