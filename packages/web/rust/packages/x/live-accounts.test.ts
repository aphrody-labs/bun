// SPDX-License-Identifier: Apache-2.0
// Lectures seules sur des comptes publics (Bun, Jarred Sumner, Vercel, Node.js…) avec la session
// locale (~/.aphrody/x-session.json). Ignoré sans session, sans lib native ou avec SKIP_NETWORK_TESTS.
import { describe, expect, test } from "bun:test";
import { resolveNativeLibraryPath } from "@aphrody/bun/src/library";
import { XClient, XSession } from "./src/index";

const HANDLES = ["bunjavascript", "jarredsumner", "vercel", "nodejs", "nextjs", "deno_land"];

let client: XClient | undefined;
try {
  if (!process.env.SKIP_NETWORK_TESTS && resolveNativeLibraryPath()) {
    client = new XClient(XSession.load());
  }
} catch {
  client = undefined;
}
const live = test.skipIf(!client);

describe("X comptes publics (lecture seule)", () => {
  for (const handle of HANDLES) {
    live(
      `@${handle} résolu`,
      async () => {
        const user = await client!.userByScreenName(handle);
        expect(user.screen_name.toLowerCase()).toBe(handle);
        expect(user.id).toBeTruthy();
        expect(await client!.userIdFor(handle)).toBe(user.id);
      },
      30_000,
    );
  }
});
