// Private Redis credentials are loaded at launch, never stored in plugin JSON.
const root = "C:/SSH/omar/server";
const features = (await Bun.file(`${root}/runtime-features.json`).json()).env;
const cache = await Bun.file("C:/Users/omara/.aphrody/private/omar-redis/client.json").json();
const current=process.cwd().replaceAll("\\","/").replace(/\/+$/,"");
const workspace=current.toLowerCase()==="c:/ssh"?"C:/SSH/omar":process.cwd();
const child = Bun.spawn({
  cmd: ["C:/Windows/System32/bun.exe", "mcp", ...Bun.argv.slice(2)],
  cwd: workspace,
  env: { ...Bun.env, ...features, REDIS_URL: cache.url },
  stdin: "inherit", stdout: "inherit", stderr: "inherit",
});
process.on("SIGTERM", () => child.kill());
process.on("SIGINT", () => child.kill());
process.exit(await child.exited);
