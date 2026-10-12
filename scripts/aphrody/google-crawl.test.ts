// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  createGoogleCrawlPlan,
  executeGoogleCrawlPlan,
  nativeCrawlArguments,
  PUBLIC_GOOGLE_HOSTS,
} from "./google-crawl";

const atlas = JSON.stringify({
  allHosts: [...PUBLIC_GOOGLE_HOSTS, "accounts.google.com", "mail.google.com", "github.com"],
});
const domains = "google.com\nGOOGLE.COM\ndevelopers.google.com\n";

test("merges source provenance while distinguishing public seeds from observed foreign and private hosts", () => {
  const plan = createGoogleCrawlPlan(atlas, domains);
  expect(plan.counts).toEqual({ atlas: 28, googleDomains: 2, merged: 29, seeds: 25 });
  expect(plan.catalog.find(item => item.hostname === "developers.google.com")?.sources).toEqual([
    "atlas",
    "google_domains",
  ]);
  for (const hostname of ["accounts.google.com", "mail.google.com", "github.com", "google.com"]) {
    expect(plan.catalog.find(item => item.hostname === hostname)?.publicSeed).toBe(false);
  }
  expect(plan.catalog.every(item => !item.ownershipVerified)).toBe(true);
  expect(plan.provenance.every(item => /^[a-f0-9]{64}$/.test(item.sha256))).toBe(true);
  expect(plan.job.maxDepth).toBe(0);
});

test("catalog and native helper reject invalid hosts, oversized budgets and non-public seed mutations", () => {
  for (const hostname of [
    "https://mail.google.com",
    "user@google.com",
    "google.com/path",
    "-google.com",
    "google..com",
  ])
    expect(() => createGoogleCrawlPlan(JSON.stringify({ allHosts: [hostname] }), domains)).toThrow();
  for (const budget of [0, 5001, 1.5, Number.NaN])
    expect(() => createGoogleCrawlPlan(atlas, domains, "public", budget)).toThrow();
  expect(() => createGoogleCrawlPlan(atlas, domains, "../foreign")).toThrow();
  for (const seed of [
    "https://accounts.google.com/",
    "https://developers.google.com/oauth",
    "http://web.dev/",
    "https://web.dev/?token=x",
  ])
    expect(() =>
      nativeCrawlArguments(
        {
          ...createGoogleCrawlPlan(atlas, domains),
          job: {
            ...createGoogleCrawlPlan(atlas, domains).job,
            seeds: [seed],
          },
        },
        "/private/job",
      ),
    ).toThrow();
});

test("uses the native crawl-index owner and refuses collection before unqualified per-hop redirects", async () => {
  const plan = createGoogleCrawlPlan(atlas, domains, "public-fixture", 5000);
  const args = nativeCrawlArguments(plan, "/private/job");
  expect(args.slice(0, 2)).toEqual(["web", "crawl-index"]);
  expect(args).toContain("--job-dir");
  expect(args[args.indexOf("--max-requests") + 1]).toBe("5000");
  expect(args[args.indexOf("--max-depth") + 1]).toBe("0");
  let invoked = false;
  await expect(
    executeGoogleCrawlPlan(plan, "/nonexistent/private/fixture", {
      capabilities: async () => ["bounded-crawl", "persistent-crawl-index", "robots"],
      indexCatalog: async () => {
        invoked = true;
      },
      crawl: async () => {
        invoked = true;
      },
    }),
  ).rejects.toThrow("per-hop redirect");
  expect(invoked).toBe(false);
});
