# TypeScript types for Bun

<p align="center">
  <a href="https://bun.com"><img src="https://bun.com/logo@2x.png" alt="Logo"></a>
</p>

These are the type definitions for Bun's JavaScript runtime APIs.

# Installation

Install the `@aphrody/bun-types` npm package:

```bash
# yarn/npm/pnpm work too
bun add -D @aphrody/bun-types
```

TypeScript only auto-loads `@types/*` packages, so list it in `compilerOptions.types` in your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["@aphrody/bun-types"]
  }
}
```

The `Bun` global and all `bun:*` modules are then available.

# Contributing

The `@aphrody/bun-types` package lives in this repo under `packages/bun-types`. (Upstream, the `@types/bun` package is a shim that loads `bun-types`.)

To add a new file, add it under `packages/bun-types`. Then add a [triple-slash directive](https://www.typescriptlang.org/docs/handbook/triple-slash-directives.html) pointing to it inside [./index.d.ts](./index.d.ts).

```diff
+ /// <reference path="./newfile.d.ts" />
```

```bash
bun build
```
