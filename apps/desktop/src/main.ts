import { startAphrodyWeb } from "@aphrody/web";

const server = await startAphrodyWeb({
  hostname: process.env.HOSTNAME || "127.0.0.1",
  port: Number(process.env.PORT || 3000),
  appUiRoot: process.env.APHRODY_APP_UI_ROOT,
  hostAccess: process.env.APHRODY_HOST_ACCESS !== "0",
});

console.log(`Aphrody desktop server: ${server.url}`);
