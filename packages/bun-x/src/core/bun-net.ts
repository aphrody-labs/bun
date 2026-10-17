// SPDX-License-Identifier: Apache-2.0
//
// Bun-native network path (fetch) for the read operations, used when the aphrody-ffi library is
// absent. Same request shape as src/x/src/client.rs (`graphql_send`): web bearer, cookie auth,
// queryId from the embedded catalog, features from the shared defaults. No queryId refresh, no
// rate-limit window handling: those stay with the native client.

import { getOperation } from "../config/catalog";
import { XError } from "./error";
import { XSession } from "./session";
import { bunLocal } from "./bun-local";
import { DEFAULT_NEWS_TABS, NEWS_TABS, parseTabItems } from "./bun-news";

const WEB_BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
const API_BASE = "https://x.com/i/api";

export interface UserSummary {
  id: string;
  name: string;
  screen_name: string;
  followers_count?: number;
  friends_count?: number;
}

type Args = Record<string, any>;

function headers(session: XSession): Record<string, string> {
  return {
    authorization: `Bearer ${WEB_BEARER}`,
    "x-twitter-auth-type": "OAuth2Session",
    "x-twitter-active-user": "yes",
    "x-twitter-client-language": "en",
    accept: "*/*",
    origin: "https://x.com",
    referer: "https://x.com/",
    cookie: session.cookieHeader(),
    "x-csrf-token": session.ct0,
    "x-client-transaction-id": crypto.randomUUID().replaceAll("-", ""),
    "x-client-uuid": crypto.randomUUID(),
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  };
}

async function graphql(session: XSession, opName: string, variables: unknown, extra?: Args): Promise<any> {
  const op = getOperation(opName);
  if (!op) throw new XError(`unknown operation: ${opName}`, -1);
  const features = { ...(bunLocal("features_for", { operation: opName }).data as Args), ...extra };
  const url = `${API_BASE}/graphql/${op.queryId}/${opName}`;
  const response =
    op.operationType === "query"
      ? await fetch(
          `${url}?${new URLSearchParams({ variables: JSON.stringify(variables), features: JSON.stringify(features) })}`,
          {
            headers: headers(session),
          },
        )
      : await fetch(url, {
          method: "POST",
          headers: { ...headers(session), "content-type": "application/json" },
          body: JSON.stringify({ variables, features, queryId: op.queryId }),
        });
  const body: any = await response.json().catch(() => null);
  const first = body?.errors?.[0];
  if (first) throw new XError(first.message ?? "unknown error", first.code ?? -1);
  if (!response.ok) throw new XError(`HTTP ${response.status}`, response.status, response.status);
  return body;
}

function userInfo(result: Args, fallbackHandle = ""): UserSummary {
  const legacy = result.legacy ?? {};
  const core = result.core ?? {};
  return {
    id: result.rest_id ?? "",
    name: core.name ?? legacy.name ?? "",
    screen_name: core.screen_name ?? legacy.screen_name ?? fallbackHandle,
    followers_count: legacy.followers_count,
    friends_count: legacy.friends_count,
  };
}

const handleOf = (h: string) => h.replace(/^@+/, "").trim();

/** Run a read operation over fetch; `handled` is false for operations the Bun path does not cover. */
export async function bunNet(session: XSession, op: string, args: Args): Promise<{ handled: boolean; data?: unknown }> {
  switch (op) {
    case "graphql":
      return { handled: true, data: await graphql(session, args.operation, args.variables, args.features) };
    case "user_by_screen_name":
    case "user_id_for": {
      const handle = handleOf(args.handle);
      const body = await graphql(session, "UserByScreenName", { screen_name: handle, withSafetyModeUserFields: true });
      const result = body?.data?.user?.result;
      if (!result) throw new XError("UserByScreenName response missing data.user.result", -1);
      const user = userInfo(result, handle);
      return { handled: true, data: op === "user_id_for" ? { id: user.id } : user };
    }
    case "whoami": {
      const body = await graphql(session, "Viewer", { withCommunitiesMemberships: false });
      const result = body?.data?.viewer?.user_results?.result ?? body?.data?.viewer_v2?.user_results?.result;
      if (!result) throw new XError("Viewer response missing user_results.result", -1);
      return { handled: true, data: userInfo(result) };
    }
    case "get_news": {
      const count: number = args.count ?? 10;
      const tabs: string[] = args.tabs ?? DEFAULT_NEWS_TABS;
      const items: ReturnType<typeof parseTabItems> = [];
      const seen = new Set<string>();
      for (const tab of tabs) {
        const timelineId = NEWS_TABS[tab];
        if (!timelineId) continue;
        let body: any;
        try {
          body = await graphql(session, "GenericTimelineById", {
            timelineId,
            count: count * 2,
            includePromotedContent: false,
          });
        } catch {
          continue; // a failing tab must not abort the rest
        }
        for (const item of parseTabItems(body, count, args.ai_only === true)) {
          if (!seen.has(item.headline)) {
            seen.add(item.headline);
            items.push(item);
          }
        }
        if (items.length >= count) break;
      }
      return { handled: true, data: items.slice(0, count) };
    }
    default:
      return { handled: false };
  }
}
