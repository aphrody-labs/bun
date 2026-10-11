// Native command bridge: Bun remains the only JavaScript/TypeScript runtime.
const command = Bun.argv.slice(2);
if (!command.length) throw new Error("Expected a native command and arguments");
const child = Bun.spawn({ cmd: command, stdin: "ignore", stdout: "inherit", stderr: "inherit" });
process.exitCode = await child.exited;
