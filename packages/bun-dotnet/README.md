# @aphrody/bun-dotnet

.NET 10 hosted in Bun. `dotnet/` is [Node API for .NET](https://github.com/microsoft/node-api-dotnet)
(MIT, Copyright (c) Microsoft Corporation), absorbed from aphrody-labs/node-api-dotnet: the C#
Node-API layer and AOT host (`src/NodeApi`), the CLR host (`src/NodeApi.DotNetHost`), the
source/type-definition generator (`src/NodeApi.Generator`), the JS package (`src/node-api-dotnet`),
tests, examples and docs.

```sh
bun run build   # dotnet pack: NuGet + npm packages in dotnet/out/pkg (npm side packed by bun pm pack)
bun run test    # loads test/fixture in the CLR from Bun
```

```ts
import { loadAssembly, generateTypes } from "@aphrody/bun-dotnet";

const { Interop } = loadAssembly("./bin/Interop.dll");
Interop.Calc.Add(20, 22); // 42
await Interop.Calc.EchoAsync("bun"); // Task<string> -> Promise<string>
await generateTypes({
  assembly: "./bin/Interop.dll",
  output: "./Interop.d.ts",
});
```

Documentation: `docs/runtime/dotnet.mdx`.
