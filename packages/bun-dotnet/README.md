# @aphrody/bun-dotnet

Hébergeur .NET 10 dans Bun, conçu autour de [`node-api-dotnet`](https://github.com/microsoft/node-api-dotnet) (MIT) et de l’API Node-API 10 de Bun.

```ts
import { loadAssembly } from "@aphrody/bun-dotnet";

const dotnet = await loadAssembly("./bin/Debug/net10.0/Exemple.dll");
const instance = new dotnet.Exemple.Calculateur();
console.log(instance.Add(20, 22));
```

Les méthodes statiques et d’instance, événements, `Task`/`Promise` et callbacks JS suivent le marshalling de Microsoft. `build`, `run`, `newProject` et `test` pilotent le SDK `dotnet`; `generateTypes({ assembly, output })` produit des déclarations TypeScript. Le SDK .NET 10 doit être disponible dans le `PATH`.
