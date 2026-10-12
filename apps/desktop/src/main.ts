import { resolve } from "node:path";
import { startWebOS } from "../server.ts";

const appUiRoot = process.env.APHRODY_APP_UI_ROOT;
const server = await startWebOS({
  hostname: process.env.HOSTNAME || "127.0.0.1",
  port: Number(process.env.PORT || 3000),
  publicSite: appUiRoot ? { staticRoot: resolve(appUiRoot) } : undefined,
  hostAccess: process.env.APHRODY_HOST_ACCESS !== "0",
});

console.log(`Aphrody desktop server: ${server.url}`);
