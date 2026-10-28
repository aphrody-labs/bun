# @aphrody/fuzzy

A small TypeScript Bitap fuzzy search library. It supports string lists and
keyed object lists, weighted keys, scores and match ranges. The implementation
is self-contained and does not import Aphrody fork-only runtime modules.

```ts
import { FuzzySearch } from "@aphrody/fuzzy";

const search = new FuzzySearch(["Dragon Ball", "Dr. Slump"], { includeScore: true });
console.log(search.search("dragon"));
```

Install with `bun add @aphrody/fuzzy`. Development uses official Bun canary;
run `bun install` and `bun test` in this directory. The parity fixtures compare
results with Fuse.js 7.1.0. Extended search, logical queries, diacritic folding
and index serialization are not implemented.

Licensed under Apache-2.0; see LICENSE and NOTICE.
