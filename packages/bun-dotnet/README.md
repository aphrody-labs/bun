# @aphrody/bun-dotnet

.NET 10 hosted in Bun. The package is the optional Microsoft payload for the canonical
`bun:dotnet` SDK; its exports delegate hosting, SDK resolution and command execution to Bun.
`dotnet/` is [Node API for .NET](https://github.com/microsoft/node-api-dotnet)
(MIT, Copyright (c) Microsoft Corporation), absorbed from aphrody-labs/node-api-dotnet: the C#
Node-API layer and AOT host (`src/NodeApi`), the CLR host (`src/NodeApi.DotNetHost`), the
source/type-definition generator (`src/NodeApi.Generator`), the JS package (`src/node-api-dotnet`),
tests, examples and docs.

```sh
bun run build   # dotnet pack: NuGet + npm packages in dotnet/out/pkg (npm side packed by bun pm pack)
bun run test    # loads test/fixture in the CLR from Bun
```

```ts
import { loadAssembly, generateTypes, locate } from "@aphrody/bun-dotnet";

console.log(locate().dotnetRoot); // resolved by bun:dotnet / hostfxr

const { Interop } = loadAssembly("./bin/Interop.dll");
Interop.Calc.Add(20, 22); // 42
await Interop.Calc.EchoAsync("bun"); // Task<string> -> Promise<string>
await generateTypes({
  assembly: "./bin/Interop.dll",
  output: "./Interop.d.ts",
});
```

`loadAssembly` retains the package's object-model compatibility contract. Use
`loadNativeAssembly` for the low-level `bun:dotnet.loadAssembly()` operation.

Documentation: `docs/runtime/dotnet.mdx`.
