import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { tempDir } from "harness";

test("Bun.VectorIndex advertises native provider availability", () => {
  expect(typeof Bun.VectorIndex).toBe("function");
  expect(typeof Bun.VectorIndex.available).toBe("boolean");
  if (Bun.env.BUN_TEST_REQUIRE_VECTOR_INDEX === "1") expect(Bun.VectorIndex.available).toBe(true);
});

test.skipIf(Bun.VectorIndex?.available)("disabled vector provider rejects construction explicitly", () => {
  using directory = tempDir("vector-index-disabled", {});
  expect(() => new Bun.VectorIndex(join(directory, "vectors.idx"), { dimensions: 2 })).toThrow(
    "ERR_VECTOR_INDEX_PROVIDER_UNAVAILABLE",
  );
});

describe.skipIf(!Bun.VectorIndex?.available)("Bun.VectorIndex requires browser_index", () => {
  test("L2 search, upserts, full uint64 identities and save/reopen", () => {
    using directory = tempDir("vector-index-persistent", {});
    const path = join(directory, "vectors.idx");
    const index = new Bun.VectorIndex(path, { dimensions: 2 });
    const maximum = (1n << 64n) - 1n;
    const beyondNumber = (1n << 53n) + 1n;
    try {
      expect(index.dimensions).toBe(2);
      expect(index.count).toBe(0);
      index.add(0n, [0, 0]);
      index.add(beyondNumber, new Float32Array([1, 0]));
      index.add(maximum, [2, 0]);
      expect(index.count).toBe(3);
      expect(index.search([0, 0], 3)).toEqual([
        { key: 0n, score: -0 },
        { key: beyondNumber, score: -1 },
        { key: maximum, score: -4 },
      ]);
      index.add(maximum, [0.5, 0]);
      expect(index.count).toBe(3);
      expect(index.search([0.5, 0], 1)).toEqual([{ key: maximum, score: -0 }]);
      index.save();
    } finally {
      index.close();
    }
    const reopened = new Bun.VectorIndex(path, { dimensions: 2, metric: "l2" });
    try {
      expect(reopened.count).toBe(3);
      expect(reopened.search([1, 0], 1)).toEqual([{ key: beyondNumber, score: -0 }]);
      expect(reopened.remove(maximum)).toBe(true);
      expect(reopened.remove(maximum)).toBe(false);
      expect(reopened.count).toBe(2);
      reopened.save();
    } finally {
      reopened.close();
    }
    const afterDelete = new Bun.VectorIndex(path, { dimensions: 2 });
    try {
      expect(afterDelete.count).toBe(2);
    } finally {
      afterDelete.close();
    }
  });

  test("filtering happens before top-k and preserves BigInt identities", () => {
    using directory = tempDir("vector-index-filter", {});
    const index = new Bun.VectorIndex(join(directory, "vectors.idx"), { dimensions: 2 });
    try {
      index.add(1n, [0, 0]);
      index.add(2n, [1, 0]);
      index.add(3n, [2, 0]);
      expect(index.search([0, 0], 1, { allowedKeys: [3n], ef: 16 })).toEqual([{ key: 3n, score: -4 }]);
      expect(index.search([0, 0], 2, { allowedKeys: new BigUint64Array([2n, 3n]) })).toEqual([
        { key: 2n, score: -1 },
        { key: 3n, score: -4 },
      ]);
      expect(index.search([0, 0], 2, { allowedKeys: [] })).toEqual([]);
      expect(
        index.search([0, 0], 1, {
          get allowedKeys() {
            const keys = [3n];
            Object.defineProperty(keys, "0", {
              get() {
                Bun.gc(true);
                return 3n;
              },
            });
            return keys;
          },
        }),
      ).toEqual([{ key: 3n, score: -4 }]);
    } finally {
      index.close();
    }
  });

  test("cosine metric survives persistence and rejects metric or dimension mismatch", () => {
    using directory = tempDir("vector-index-cosine", {});
    const path = join(directory, "vectors.idx");
    const index = new Bun.VectorIndex(path, { dimensions: 2, metric: "cosine" });
    try {
      index.add(1n, [1, 0]);
      index.add(2n, [0, 1]);
      const hits = index.search([1, 0], 2);
      expect(hits.map(hit => hit.key)).toEqual([1n, 2n]);
      expect(hits[0]!.score).toBeCloseTo(1, 6);
      expect(hits[1]!.score).toBeCloseTo(0, 6);
      expect(() => index.add(3n, [0, 0])).toThrow("zero norm");
      index.save();
    } finally {
      index.close();
    }
    expect(() => new Bun.VectorIndex(path, { dimensions: 2 })).toThrow("metric does not match");
    expect(() => new Bun.VectorIndex(path, { dimensions: 3, metric: "cosine" })).toThrow("dimension mismatch");
    const reopened = new Bun.VectorIndex(path, { dimensions: 2, metric: "cosine" });
    try {
      expect(reopened.count).toBe(2);
    } finally {
      reopened.close();
    }
  });

  test("close is idempotent, never implicitly saves, and rejects subsequent operations", async () => {
    using directory = tempDir("vector-index-close", {});
    const path = join(directory, "vectors.idx");
    const index = new Bun.VectorIndex(path, { dimensions: 2 });
    try {
      index.add(1n, [1, 2]);
    } finally {
      index.close();
    }
    index.close();
    expect(await Bun.file(path).exists()).toBe(false);
    expect(() => index.add(1n, [1, 2])).toThrow("ERR_VECTOR_INDEX_CLOSED");
    expect(() => index.search([1, 2], 1)).toThrow("ERR_VECTOR_INDEX_CLOSED");
    expect(() => index.remove(1n)).toThrow("ERR_VECTOR_INDEX_CLOSED");
    expect(() => index.save()).toThrow("ERR_VECTOR_INDEX_CLOSED");
    expect(() => index.count).toThrow("ERR_VECTOR_INDEX_CLOSED");
    expect(() => index.dimensions).toThrow("ERR_VECTOR_INDEX_CLOSED");
    const empty = new Bun.VectorIndex(path, { dimensions: 2 });
    try {
      empty.save();
    } finally {
      empty.close();
    }
    const reopened = new Bun.VectorIndex(path, { dimensions: 2 });
    try {
      expect(reopened.count).toBe(0);
    } finally {
      reopened.close();
    }
  });

  test("invalid numeric keys, bounds and vector elements never mutate the index", () => {
    using directory = tempDir("vector-index-validation", {});
    const index = new Bun.VectorIndex(join(directory, "vectors.idx"), { dimensions: 2 });
    try {
      for (const key of [1, "1", -1n, 1n << 64n]) {
        expect(() => index.add(key as bigint, [1, 2])).toThrow("unsigned 64-bit BigInts");
      }
      for (const vector of [[1], [1, 2, 3], [NaN, 1], [Infinity, 1], [1e100, 1], ["1", 2]]) {
        expect(() => index.add(1n, vector as number[])).toThrow(/dimension mismatch|finite/);
      }
      for (const k of [0, -1, 1.5, NaN, Infinity, 1_000_001]) {
        expect(() => index.search([1, 2], k)).toThrow(/positive integer/);
      }
      expect(() => index.search([1, 2], 1, { allowedKeys: [1 as unknown as bigint] })).toThrow(
        "unsigned 64-bit BigInts",
      );
      expect(index.count).toBe(0);
    } finally {
      index.close();
    }
  });

  test("argument getters can close the index or throw before native borrowing", () => {
    using directory = tempDir("vector-index-reentrant", {});
    const index = new Bun.VectorIndex(join(directory, "vectors.idx"), { dimensions: 2 });
    try {
      const throwing = [1, 2];
      Object.defineProperty(throwing, "0", {
        get() {
          throw new Error("vector getter failed");
        },
      });
      expect(() => index.add(1n, throwing)).toThrow("vector getter failed");
      expect(index.count).toBe(0);
      const closing = [1, 2];
      Object.defineProperty(closing, "0", {
        get() {
          index.close();
          return 1;
        },
      });
      expect(() => index.add(1n, closing)).toThrow("ERR_VECTOR_INDEX_CLOSED");
    } finally {
      index.close();
    }
  });
});
