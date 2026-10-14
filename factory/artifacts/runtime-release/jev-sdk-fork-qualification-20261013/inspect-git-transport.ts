const child = Bun.spawn(["git", "-C", "/home/ubuntu/src/typesafe-sdk-js", "config", "--get", "remote.origin.url"], { stdout: "pipe", stderr: "ignore", timeout: 5000 });
const remote = (await new Response(child.stdout).text()).trim();
if (await child.exited) throw new Error("No SDK origin configured");
const url = new URL(remote);
if (url.hostname !== "github.com" || url.pathname !== "/aphrody-labs/typesafe-sdk-js.git" || url.username || url.password) throw new Error("SDK transport needs a safe named remote owner");
console.log("SDK_ORIGIN_CONFIRMED");
console.log(JSON.stringify({ uvPublishTokenPresent: Boolean(process.env.UV_PUBLISH_TOKEN), twinePasswordPresent: Boolean(process.env.TWINE_PASSWORD), pypiAPITokenPresent: Boolean(process.env.PYPI_API_TOKEN), OIDCTokenPresent: Boolean(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) }));
