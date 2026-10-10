import * as os from "node:os";

Bun.serve({
  fetch(_req: Request) {
    return new Response(`Hello from ${os.arch()}!`);
  },
});
