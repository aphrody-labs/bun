// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { join } from "node:path";
import { tempDir } from "../../../test/harness";
import { createReadonlyGmailMirror, openProtectedGoogleStore } from "../src/mirror";

const scope = "https://www.googleapis.com/auth/gmail.readonly";
const key = "a".repeat(64);
function store(path: string, maxEntries = 4096) {
  return openProtectedGoogleStore({ filename: path, maxEntries, assertProtectedPath() {} });
}
function message(id = "m1", historyId = "10") {
  return {
    id,
    threadId: "t1",
    historyId,
    internalDate: "100",
    labelIds: ["INBOX"],
    payload: { headers: [{ name: "Subject", value: "private fixture" }] },
    snippet: "must not persist",
    raw: "must not persist",
  };
}
function mirror(owner: ReturnType<typeof store>, handler: (url: URL) => unknown, options = {}) {
  return createReadonlyGmailMirror({
    store: owner.mirror,
    authorization: async subject => ({ subject, accessToken: "fixture", scopes: [scope] }),
    fetch: async (input, init) => {
      const url = new URL(String(input));
      expect(url.origin).toBe("https://gmail.googleapis.com");
      expect(url.pathname.startsWith("/gmail/v1/users/me/")).toBe(true);
      expect(init?.method).toBe("GET");
      expect(init?.redirect).toBe("error");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture");
      const result = handler(url);
      return result instanceof Response ? result : Response.json(result);
    },
    ...options,
  });
}

test("persistent OAuth state consumes once across independent connections and survives reopen", async () => {
  using directory = tempDir("google-store", {});
  const path = join(String(directory), "google.sqlite");
  const first = store(path),
    second = store(path);
  const state = {
    verifier: "fixture",
    nonce: "fixture",
    bindingHash: key,
    returnTo: "/",
    scopes: ["openid"],
    expiresAt: Date.now() + 60000,
  };
  await first.oauth.putState(key, state);
  const results = await Promise.all([
    first.oauth.consumeState(key, Date.now()),
    second.oauth.consumeState(key, Date.now()),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
  await first.oauth.putSession(key, {
    user: { sub: "accountA", emailVerified: true },
    scopes: ["openid"],
    expiresAt: state.expiresAt,
  });
  first.close();
  second.close();
  using reopened = store(path);
  expect((await reopened.oauth.getSession(key, Date.now()))?.user.sub).toBe("accountA");
  expect(await reopened.oauth.consumeState(key, Date.now())).toBeUndefined();
  expect(await reopened.oauth.getSession(key, state.expiresAt)).toBeUndefined();
});

test("requires explicit protected-path owner and refuses exhausted OAuth capacity", async () => {
  using directory = tempDir("google-capacity", {});
  const path = join(String(directory), "google.sqlite");
  expect(() =>
    openProtectedGoogleStore({
      filename: path,
      assertProtectedPath() {
        throw new Error("owner denied");
      },
    }),
  ).toThrow("owner denied");
  using owner = store(path, 1);
  const value = {
    user: { sub: "accountA", emailVerified: false },
    scopes: [],
    expiresAt: Date.now() + 60000,
  };
  await owner.oauth.putSession(key, value);
  await expect(owner.oauth.putSession("b".repeat(64), value)).rejects.toThrow("capacity");
  expect((await owner.oauth.getSession(key, Date.now()))?.user.sub).toBe("accountA");
});

test("full paginated metadata synchronization excludes message bodies and isolates subjects", async () => {
  using directory = tempDir("gmail-full", {});
  using owner = store(join(String(directory), "google.sqlite"));
  const sync = mirror(owner, url => {
    if (url.pathname.endsWith("/profile")) return { historyId: "10" };
    if (url.pathname.endsWith("/messages"))
      return url.searchParams.has("pageToken")
        ? { messages: [{ id: "m2" }] }
        : { messages: [{ id: "m1" }], nextPageToken: "page2" };
    expect(url.searchParams.get("format")).toBe("metadata");
    return message(url.pathname.split("/").at(-1));
  });
  expect(await sync.sync("accountA")).toEqual({ mode: "full", updated: 2, deleted: 0 });
  expect(owner.mirror.checkpoint("accountA")).toEqual({ historyId: "10", revision: 1 });
  const stored = owner.readMessages("accountA");
  expect(stored).toHaveLength(2);
  expect(stored[0]).not.toHaveProperty("raw");
  expect(stored[0]).not.toHaveProperty("snippet");
  expect(owner.readMessages("accountB")).toEqual([]);
});

test("history changes deduplicate messages and apply deletions atomically", async () => {
  using directory = tempDir("gmail-history", {});
  using owner = store(join(String(directory), "google.sqlite"));
  owner.mirror.commit("accountA", undefined, "10", [{ ...message("m1"), headers: [] }], [], true);
  const sync = mirror(owner, url => {
    if (url.pathname.endsWith("/history")) {
      expect(url.searchParams.get("startHistoryId")).toBe("10");
      return {
        historyId: "20",
        history: [
          {
            messages: [{ id: "m1" }, { id: "m2" }],
            messagesAdded: [{ message: { id: "m2" } }],
            messagesDeleted: [{ message: { id: "m1" } }],
          },
        ],
      };
    }
    return url.pathname.endsWith("/m1") ? new Response(null, { status: 404 }) : message("m2", "20");
  });
  expect(await sync.sync("accountA")).toEqual({ mode: "history", updated: 1, deleted: 1 });
  expect(owner.readMessages("accountA").map(value => value.id)).toEqual(["m2"]);
  expect(owner.mirror.checkpoint("accountA")?.historyId).toBe("20");
});

test("expired history cursor triggers bounded full replacement", async () => {
  using directory = tempDir("gmail-expired", {});
  using owner = store(join(String(directory), "google.sqlite"));
  owner.mirror.commit("accountA", undefined, "10", [{ ...message("old"), headers: [] }], [], true);
  const sync = mirror(owner, url => {
    if (url.pathname.endsWith("/history")) return new Response(null, { status: 404 });
    if (url.pathname.endsWith("/profile")) return { historyId: "30" };
    if (url.pathname.endsWith("/messages")) return { messages: [{ id: "new" }] };
    return message("new", "30");
  });
  expect((await sync.sync("accountA")).mode).toBe("full");
  expect(owner.readMessages("accountA").map(value => value.id)).toEqual(["new"]);
});

test("pagination cycle or limits leave checkpoint and private rows unchanged", async () => {
  using directory = tempDir("gmail-pagination", {});
  using owner = store(join(String(directory), "google.sqlite"));
  owner.mirror.commit("accountA", undefined, "10", [{ ...message("old"), headers: [] }], [], true);
  const sync = mirror(owner, () => ({ historyId: "20", nextPageToken: "cycle", history: [] }));
  await expect(sync.sync("accountA")).rejects.toThrow("pagination cycle");
  expect(owner.mirror.checkpoint("accountA")).toEqual({ historyId: "10", revision: 1 });
  expect(owner.readMessages("accountA")[0]?.id).toBe("old");
  const limited = mirror(owner, () => ({ historyId: "20", history: [{ messages: [{ id: "m1" }, { id: "m2" }] }] }), {
    maxMessages: 1,
  });
  await expect(limited.sync("accountA")).rejects.toThrow("message limit");
  expect(owner.mirror.checkpoint("accountA")?.historyId).toBe("10");
});

test("account mismatch or missing readonly scope sends no network request", async () => {
  using directory = tempDir("gmail-auth", {});
  using owner = store(join(String(directory), "google.sqlite"));
  let requests = 0;
  for (const authorization of [
    { subject: "other", accessToken: "fixture", scopes: [scope] },
    { subject: "accountA", accessToken: "fixture", scopes: ["openid"] },
  ]) {
    const sync = createReadonlyGmailMirror({
      store: owner.mirror,
      authorization: async () => authorization,
      fetch: async () => {
        requests++;
        return Response.json({});
      },
    });
    await expect(sync.sync("accountA")).rejects.toThrow("credential provider failed");
  }
  expect(requests).toBe(0);
  expect(owner.mirror.checkpoint("accountA")).toBeUndefined();
});

test("malformed private upstream response is redacted and leaves cursor unchanged", async () => {
  using directory = tempDir("gmail-redaction", {});
  using owner = store(join(String(directory), "google.sqlite"));
  const sync = mirror(owner, () => new Response("private-mail-fixture-that-is-not-json"));
  await expect(sync.sync("accountA")).rejects.toThrow("Invalid Gmail response");
  expect(owner.mirror.checkpoint("accountA")).toBeUndefined();
});

test("concurrent stale commits and storage capacity failures roll back rows and cursor", () => {
  using directory = tempDir("gmail-cas", {});
  using owner = store(join(String(directory), "google.sqlite"), 1);
  owner.mirror.commit("accountA", undefined, "10", [{ ...message("m1"), headers: [] }], [], true);
  const checkpoint = owner.mirror.checkpoint("accountA");
  expect(() => owner.mirror.commit("accountA", undefined, "20", [], ["m1"], false)).toThrow("checkpoint changed");
  expect(() =>
    owner.mirror.commit("accountA", checkpoint, "20", [{ ...message("m2"), headers: [] }], [], false),
  ).toThrow("capacity");
  expect(owner.readMessages("accountA").map(value => value.id)).toEqual(["m1"]);
  expect(owner.mirror.checkpoint("accountA")).toEqual(checkpoint);
  expect(() => owner.mirror.commit("accountA", checkpoint, "9", [], ["m1"], false)).toThrow("backwards");
  expect(owner.readMessages("accountA").map(value => value.id)).toEqual(["m1"]);
});
