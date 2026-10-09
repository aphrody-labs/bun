// Fixed peer for fetch.mjs: always started with the fork binary by the driver, so only
// the client side changes between targets. Prints its port, serves until stdin closes.
import { createServer } from "node:http";
import { prng } from "./common.mjs";

const rnd = prng(5);
let body = "";
while (body.length < 16384) body += String.fromCharCode(97 + ((rnd() * 26) | 0));

const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain", "content-length": body.length });
  res.end(body);
});
server.listen(0, "127.0.0.1", () => console.log(server.address().port));
process.stdin.on("end", () => server.close(() => process.exit(0)));
process.stdin.resume();
