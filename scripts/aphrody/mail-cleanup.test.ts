import { describe, expect, test } from "bun:test";
import {
  executePlans,
  parseCleanupArgs,
  parseUnsubscribe,
  planGmail,
  planOutlook,
  type CleanupConfig,
  type MailboxPlan,
} from "./mail-cleanup";

const dkimPass = { name: "Authentication-Results", value: "mx.example; dkim=pass header.d=sender.example" };
const dkimSigned = {
  name: "DKIM-Signature",
  value: "v=1; d=sender.example; h=from:to:subject:list-unsubscribe:list-unsubscribe-post; b=opaque",
};
const config: CleanupConfig = {
  apply: false,
  days: 30,
  maxMessages: 10,
  providers: ["gmail", "outlook"],
  unsubscribe: true,
};

function newsletterHeaders() {
  return [
    dkimPass,
    dkimSigned,
    { name: "List-Unsubscribe", value: "<https://sender.example/u>" },
    { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
  ];
}

describe("mail cleanup arguments", () => {
  test("uses safe defaults", () => {
    expect(parseCleanupArgs([])).toEqual({
      apply: false,
      days: 30,
      help: false,
      json: false,
      maxMessages: 500,
      providers: ["gmail", "outlook"],
      unsubscribe: true,
    });
  });

  test("rejects invalid limits", () => {
    expect(() => parseCleanupArgs(["--days", "0"])).toThrow("--days doit être un entier positif.");
    expect(() => parseCleanupArgs(["--provider", "imap"])).toThrow("--provider doit valoir gmail, outlook ou all.");
  });

  test("can disable unsubscribe requests", () => {
    expect(parseCleanupArgs(["--no-unsubscribe", "--provider", "gmail"]).unsubscribe).toBeFalse();
  });
});

describe("List-Unsubscribe", () => {
  test("accepts authenticated RFC 8058 HTTPS actions", () => {
    expect(
      parseUnsubscribe([
        dkimPass,
        dkimSigned,
        { name: "List-Unsubscribe", value: "<mailto:list@example.com>, <https://example.com/u/opaque>" },
        { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
      ]),
    ).toEqual({ key: "https:https://example.com/u/opaque", kind: "https", url: "https://example.com/u/opaque" });
  });

  test("falls back to authenticated mailto and rejects missing DKIM", () => {
    const headers = [
      dkimPass,
      { ...dkimSigned, value: "v=1; d=sender.example; h=from:to:subject:list-unsubscribe; b=opaque" },
      { name: "List-Unsubscribe", value: "<mailto:list@example.com?subject=remove&body=stop>" },
    ];
    expect(parseUnsubscribe(headers)).toEqual({
      address: "list@example.com",
      body: "stop",
      key: "mailto:list@example.com:remove:stop",
      kind: "mailto",
      subject: "remove",
    });
    expect(parseUnsubscribe(headers.slice(2))).toBeNull();
  });

  test("rejects a signature that does not cover unsubscribe headers", () => {
    expect(
      parseUnsubscribe([
        dkimPass,
        { name: "DKIM-Signature", value: "v=1; h=from:to:subject; b=opaque" },
        { name: "List-Unsubscribe", value: "<https://example.com/u>" },
        { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
      ]),
    ).toBeNull();
  });
});

test("plans Gmail spam and authenticated newsletters", async () => {
  const fakeFetch = async (input: string | URL | Request) => {
    const url = new URL(input.toString());
    if (url.pathname.endsWith("/messages/gmail-news")) {
      return Response.json({ id: "gmail-news", payload: { headers: newsletterHeaders() } });
    }
    if (url.searchParams.getAll("labelIds").includes("SPAM")) {
      return Response.json({ messages: [{ id: "gmail-spam" }] });
    }
    return Response.json({ messages: [{ id: "gmail-news" }] });
  };

  expect(await planGmail(config, "token", fakeFetch)).toEqual({
    newsletters: [
      {
        id: "gmail-news",
        unsubscribe: {
          key: "https:https://sender.example/u",
          kind: "https",
          url: "https://sender.example/u",
        },
      },
    ],
    provider: "gmail",
    spamIds: ["gmail-spam"],
  });
});

test("plans Outlook spam and authenticated newsletters", async () => {
  const requested: string[] = [];
  const fakeFetch = async (input: string | URL | Request) => {
    const url = new URL(input.toString());
    requested.push(url.href);
    if (url.pathname.endsWith("/messages/outlook-news")) {
      return Response.json({ id: "outlook-news", internetMessageHeaders: newsletterHeaders() });
    }
    if (url.pathname.includes("/mailFolders/junkemail/")) {
      return Response.json({ value: [{ id: "outlook-spam" }] });
    }
    return Response.json({ value: [{ id: "outlook-news" }] });
  };

  expect(await planOutlook(config, "token", fakeFetch)).toEqual({
    newsletters: [
      {
        id: "outlook-news",
        unsubscribe: {
          key: "https:https://sender.example/u",
          kind: "https",
          url: "https://sender.example/u",
        },
      },
    ],
    provider: "outlook",
    spamIds: ["outlook-spam"],
  });
  expect(requested.some(url => url.includes("%24select=id%2CinternetMessageHeaders"))).toBeTrue();
});

test("applies one-click without credentials and trashes every candidate", async () => {
  const calls: Array<{ headers: Headers; method: string; url: string }> = [];
  const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      headers: new Headers(init?.headers),
      method: init?.method ?? "GET",
      url: input.toString(),
    });
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const plans: MailboxPlan[] = [
    {
      newsletters: [
        {
          id: "newsletter-1",
          unsubscribe: { key: "https:https://sender.example/u", kind: "https", url: "https://sender.example/u" },
        },
      ],
      provider: "gmail",
      spamIds: ["spam-1"],
    },
  ];

  const result = await executePlans(plans, { gmail: "secret-token" }, fakeFetch);

  expect(result).toEqual({
    errors: [],
    moved: { gmail: 2, outlook: 0 },
    unsubscribed: { gmail: 1, outlook: 0 },
  });
  expect(calls).toHaveLength(3);
  const unsubscribeCall = calls[0]!;
  expect(unsubscribeCall).toMatchObject({ method: "POST", url: "https://sender.example/u" });
  expect(unsubscribeCall.headers.has("Authorization")).toBeFalse();
  expect(calls.slice(1).every(call => call.headers.get("Authorization") === "Bearer secret-token")).toBeTrue();
});
