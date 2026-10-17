// SPDX-License-Identifier: Apache-2.0
//
// Bun-native implementation of the local (no network) operations, used when the aphrody-ffi
// library is absent: bun:sqlite for the store, plain TS for archive, parsers and ranking.
// Semantics follow src/x/src/{store,archive,features,news,algorithm}.rs.

import { Database, type SQLQueryBindings } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import defaultFeatures from "../../../../src/x/data/x-default-features.json";
import { getOperation } from "../config/catalog";

type Args = Record<string, any>;

class LocalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XError";
  }
}

// --- store ------------------------------------------------------------------------------------

const stores = new Map<number, Database>();
let nextStore = 1;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tweets (
  id TEXT PRIMARY KEY,
  author_username TEXT NOT NULL DEFAULT '',
  author_name TEXT NOT NULL DEFAULT '',
  author_id TEXT,
  text TEXT NOT NULL DEFAULT '',
  created_at TEXT,
  like_count INTEGER NOT NULL DEFAULT 0,
  retweet_count INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  quote_count INTEGER NOT NULL DEFAULT 0,
  conversation_id TEXT,
  in_reply_to TEXT,
  lang TEXT,
  json TEXT NOT NULL,
  first_seen INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  description TEXT,
  followers_count INTEGER,
  following_count INTEGER,
  json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS edges (
  account TEXT NOT NULL,
  kind TEXT NOT NULL,
  tweet_id TEXT NOT NULL,
  ts INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (account, kind, tweet_id)
);
CREATE TABLE IF NOT EXISTS follows (
  account TEXT NOT NULL,
  direction TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  ts INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (account, direction, user_id)
);
CREATE VIRTUAL TABLE IF NOT EXISTS tweets_fts USING fts5(text, tweet_id UNINDEXED);
`;

function db(args: Args): Database {
  const handle = stores.get(args.store);
  if (!handle) throw new LocalError("the X store is closed");
  return handle;
}

function storeOpen(args: Args) {
  const path: string = args.path ?? join(Bun.env.USERPROFILE ?? Bun.env.HOME ?? ".", ".aphrody", "x-store.sqlite");
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const conn = new Database(path);
  if (path !== ":memory:") {
    conn.run("PRAGMA journal_mode = WAL");
    conn.run("PRAGMA synchronous = NORMAL");
  }
  conn.run(SCHEMA);
  const store = nextStore++;
  stores.set(store, conn);
  return { store, path };
}

function upsertTweet(conn: Database, t: Args) {
  conn
    .prepare(
      `INSERT INTO tweets (id, author_username, author_name, author_id, text, created_at, like_count,
         retweet_count, reply_count, quote_count, conversation_id, in_reply_to, lang, json)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)
       ON CONFLICT(id) DO UPDATE SET author_username=excluded.author_username,
         author_name=excluded.author_name, author_id=excluded.author_id, text=excluded.text,
         created_at=excluded.created_at, like_count=excluded.like_count,
         retweet_count=excluded.retweet_count, reply_count=excluded.reply_count,
         quote_count=excluded.quote_count, conversation_id=excluded.conversation_id,
         in_reply_to=excluded.in_reply_to, lang=excluded.lang, json=excluded.json`,
    )
    .run(
      t.id,
      t.author?.username ?? "",
      t.author?.name ?? "",
      t.author_id ?? null,
      t.text ?? "",
      t.created_at ?? null,
      t.like_count ?? 0,
      t.retweet_count ?? 0,
      t.reply_count ?? 0,
      t.quote_count ?? 0,
      t.conversation_id ?? null,
      t.in_reply_to_status_id ?? null,
      t.lang ?? null,
      JSON.stringify(t),
    );
  conn.prepare("DELETE FROM tweets_fts WHERE tweet_id = ?1").run(t.id);
  conn.prepare("INSERT INTO tweets_fts (text, tweet_id) VALUES (?1, ?2)").run(t.text ?? "", t.id);
}

function addEdge(conn: Database, account: string, kind: string, tweetId: string) {
  conn.prepare("INSERT OR IGNORE INTO edges (account, kind, tweet_id) VALUES (?1,?2,?3)").run(account, kind, tweetId);
}

function upsertUser(conn: Database, u: Args) {
  conn
    .prepare(
      `INSERT INTO users (id, username, name, description, followers_count, following_count, json)
       VALUES (?1,?2,?3,?4,?5,?6,?7)
       ON CONFLICT(id) DO UPDATE SET username=excluded.username, name=excluded.name,
         description=excluded.description, followers_count=excluded.followers_count,
         following_count=excluded.following_count, json=excluded.json`,
    )
    .run(
      u.id,
      u.username,
      u.name,
      u.description ?? null,
      u.followers_count ?? null,
      u.following_count ?? null,
      JSON.stringify(u),
    );
}

function addFollow(conn: Database, account: string, direction: string, u: Args) {
  conn
    .prepare("INSERT OR IGNORE INTO follows (account, direction, user_id, username, name) VALUES (?1,?2,?3,?4,?5)")
    .run(account, direction, u.id, u.username ?? "", u.name ?? "");
}

function ingest(conn: Database, batch: Args) {
  const counts = { users: 0, tweets: 0, edges: 0, follows: 0 };
  conn.transaction(() => {
    for (const u of batch.users ?? []) {
      upsertUser(conn, u);
      counts.users++;
    }
    for (const t of batch.tweets ?? []) {
      upsertTweet(conn, t);
      counts.tweets++;
    }
    for (const e of batch.edges ?? []) {
      addEdge(conn, e.account, e.kind, e.tweet_id);
      counts.edges++;
    }
    for (const f of batch.follows ?? []) {
      addFollow(conn, f.account, f.direction, f.user);
      counts.follows++;
    }
  })();
  return counts;
}

function parseUserResult(r: Args): Args | null {
  const id = r?.rest_id ?? r?.legacy?.id_str;
  if (typeof id !== "string") return null;
  const username = r.core?.screen_name ?? r.legacy?.screen_name ?? "";
  if (!username) return null;
  const legacy = r.legacy;
  const user: Args = { id, username, name: r.core?.name ?? legacy?.name ?? "" };
  const set = (k: string, v: unknown) => {
    if (v !== undefined && v !== null) user[k] = v;
  };
  set("description", legacy?.description);
  set("followers_count", legacy?.followers_count);
  set("following_count", legacy?.friends_count);
  set("is_blue_verified", r.is_blue_verified);
  set("profile_image_url", legacy?.profile_image_url_https ?? r.avatar?.image_url);
  set("created_at", legacy?.created_at ?? r.core?.created_at);
  return user;
}

function collectUsers(root: unknown): Args[] {
  const found: Args[] = [];
  const seen = new Set<string>();
  const stack: unknown[] = [root];
  while (stack.length) {
    const v = stack.pop();
    if (Array.isArray(v)) stack.push(...v);
    else if (v && typeof v === "object") {
      const result = (v as Args).user_results?.result;
      const user = result ? parseUserResult(result) : null;
      if (user && !seen.has(user.id)) {
        seen.add(user.id);
        found.push(user);
      }
      stack.push(...Object.values(v));
    }
  }
  return found;
}

function storeQuery(conn: Database, args: Args) {
  const head = String(args.sql).trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!["select", "with", "values", "explain"].includes(head)) {
    throw new LocalError("store_query accepts SELECT, WITH, VALUES and EXPLAIN statements only");
  }
  // query_only makes SQLite itself refuse any write hidden in a CTE.
  conn.run("PRAGMA query_only = ON");
  try {
    const params = (args.params ?? []).map((p: unknown) =>
      typeof p === "boolean" ? Number(p) : p,
    ) as SQLQueryBindings[];
    return conn
      .prepare(args.sql)
      .all(...params)
      .slice(0, args.limit ?? 1000);
  } finally {
    conn.run("PRAGMA query_only = OFF");
  }
}

const tweetRow = (r: Args) => ({
  id: r.id,
  author_username: r.author_username,
  author_name: r.author_name,
  text: r.text,
  created_at: r.created_at,
  like_count: r.like_count,
});

// --- archive ----------------------------------------------------------------------------------

function archiveResolve(path: string): string | null {
  if (existsSync(path) && statSync(path).isFile()) return path;
  for (const rel of ["data/tweets.js", "data/tweet.js", "tweets.js", "tweet.js"]) {
    const candidate = join(path, rel);
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function archiveParse(raw: string): any[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0) throw new LocalError("archive file has no JSON array");
  if (end < 0) throw new LocalError("archive file has no JSON array end");
  if (end < start) throw new LocalError("archive file array delimiters inverted");
  return JSON.parse(raw.slice(start, end + 1));
}

function countField(legacy: Args, key: string): number {
  const v = legacy[key];
  const n = typeof v === "string" ? Number.parseInt(v, 10) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
}

function archiveTweet(elem: Args, owner: Args) {
  const legacy = elem?.tweet ?? elem;
  if (typeof legacy?.id_str !== "string") return null;
  const tweet: Args = {
    id: legacy.id_str,
    text: legacy.full_text ?? legacy.text ?? "",
    author: owner,
    reply_count: countField(legacy, "reply_count"),
    retweet_count: countField(legacy, "retweet_count"),
    like_count: countField(legacy, "favorite_count"),
    quote_count: countField(legacy, "quote_count"),
    is_note_tweet: false,
    media: [],
  };
  if (typeof legacy.created_at === "string") tweet.created_at = legacy.created_at;
  if (typeof legacy.conversation_id_str === "string") tweet.conversation_id = legacy.conversation_id_str;
  if (typeof legacy.in_reply_to_status_id_str === "string") {
    tweet.in_reply_to_status_id = legacy.in_reply_to_status_id_str;
  }
  if (typeof legacy.lang === "string") tweet.lang = legacy.lang;
  return tweet;
}

function importArchive(conn: Database, args: Args) {
  const file = archiveResolve(args.path);
  if (!file) throw new LocalError(`no tweets.js found at ${args.path} (expected a tweets.js file or an archive dir)`);
  const arr = archiveParse(readFileSync(file, "utf8"));
  const handle = String(args.owner).replace(/^@+/, "");
  const owner = { username: handle, name: handle };
  let imported = 0;
  conn.transaction(() => {
    for (const elem of arr) {
      const t = archiveTweet(elem, owner);
      if (!t) continue;
      upsertTweet(conn, t);
      addEdge(conn, owner.username, "authored", t.id);
      imported++;
    }
  })();
  return { imported };
}

// --- news, features ---------------------------------------------------------------------------

function parsePostCount(text: string): number | null {
  const idx = text.toLowerCase().indexOf("post");
  if (idx < 0) return null;
  const tokens = text
    .slice(0, idx)
    .replace(/[^0-9.\skKmMbB]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  const token = tokens.at(-1);
  if (!token) return null;
  const last = token.at(-1)!.toLowerCase();
  const mult = last === "k" ? 1e3 : last === "m" ? 1e6 : last === "b" ? 1e9 : 1;
  const digits = mult === 1 ? token : token.slice(0, -1);
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(digits)) return null;
  return Math.round(Number(digits) * mult);
}

function featuresFor(name: string) {
  const op = getOperation(name);
  if (!op) throw new LocalError(`unknown operation: ${name}`);
  const defaults = defaultFeatures as Record<string, unknown>;
  if (!op.featureSwitches.length) return { ...defaults };
  return Object.fromEntries(op.featureSwitches.map(flag => [flag, defaults[flag] ?? true]));
}

// --- ranking ----------------------------------------------------------------------------------

/** The For You proxy ranker of src/x/src/algorithm.rs. */
export function rankPostsLocal(candidates: Args[], ctx: Args = {}, topK = 20): Args[] {
  if (!candidates.length) return [];
  const nowUnix = ctx.now_unix > 0 ? ctx.now_unix : Math.floor(Date.now() / 1000);
  const maxAge = ctx.max_age_secs ?? 7 * 24 * 3600;
  const followed = new Set<string>(ctx.followed_author_ids ?? []);
  const engaged = new Set<string>(ctx.recent_engagement_author_ids ?? []);
  const blocked = new Set<string>(ctx.blocked_author_ids ?? []);
  const mutes: string[] = (ctx.muted_keywords ?? []).map((k: string) => k.toLowerCase());

  const seen = new Set<string>();
  const kept = candidates.filter(p => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    if (ctx.viewer_id && p.author_id === ctx.viewer_id) return false;
    if (blocked.has(p.author_id)) return false;
    const text = String(p.text).toLowerCase();
    if (mutes.some(k => text.includes(k))) return false;
    return Math.abs(nowUnix - p.created_at) <= maxAge;
  });

  const scored = kept.map(post => {
    let score = 0;
    const reasons: string[] = [];
    const eng = post.like_count + 3 * post.reply_count + 4 * post.repost_count + 2.5 * post.quote_count;
    if (eng > 0) {
      score += eng;
      reasons.push(`engagement:${eng.toFixed(1)}`);
    }
    if (post.in_network) {
      score += 120;
      reasons.push("in_network:+120");
    } else if (followed.has(post.author_id)) {
      score += 80;
      reasons.push("followed:+80");
    }
    if (engaged.has(post.author_id)) {
      score += 45;
      reasons.push("history_affinity:+45");
    }
    const ageH = Math.max((nowUnix - post.created_at) / 3600, 0);
    const freshness = (48 - Math.min(ageH, 48)) / 2;
    if (freshness > 0.5) {
      score += freshness;
      reasons.push(`freshness:${freshness.toFixed(1)}`);
    }
    if (post.has_media) {
      score += 8;
      reasons.push("media:+8");
    }
    if (post.is_reply) {
      score -= 5;
      reasons.push("reply:-5");
    }
    if (Buffer.byteLength(post.text) > 40) score += 3;
    return { post, score: Math.max(score, 0), reasons };
  });

  const counts = new Map<string, number>();
  for (const sp of scored) {
    const n = counts.get(sp.post.author_id) ?? 0;
    if (n > 0) {
      const penalty = 35 * n;
      sp.score = Math.max(sp.score - penalty, 0);
      sp.reasons.push(`diversity_penalty:-${penalty}`);
    }
    counts.set(sp.post.author_id, n + 1);
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK || 20);
}

// --- dispatch ---------------------------------------------------------------------------------

/** Run a local operation in Bun; `handled` is false when the operation has no Bun twin. */
export function bunLocal(op: string, args: Args): { handled: boolean; data?: unknown } {
  const ok = (data: unknown) => ({ handled: true, data });
  switch (op) {
    case "store_open":
      return ok(storeOpen(args));
    case "store_close":
      db(args).close();
      stores.delete(args.store);
      return ok(true);
    case "store_upsert_tweet":
      return ok(upsertTweet(db(args), args.tweet));
    case "store_add_edge":
      return ok(addEdge(db(args), args.account, args.kind, args.tweet_id));
    case "store_upsert_user":
      return ok(upsertUser(db(args), args.user));
    case "store_add_follow":
      return ok(addFollow(db(args), args.account, args.direction, args.user));
    case "store_ingest":
      return ok(ingest(db(args), args));
    case "store_ingest_users": {
      const users = collectUsers(args.json);
      ingest(db(args), { users });
      return ok({ users: users.length });
    }
    case "store_search":
      return ok(
        db(args)
          .prepare(
            `SELECT t.id, t.author_username, t.author_name, t.text, t.created_at, t.like_count
             FROM tweets_fts f JOIN tweets t ON t.id = f.tweet_id
             WHERE tweets_fts MATCH ?1 ORDER BY t.first_seen DESC LIMIT ?2`,
          )
          .all(args.query, args.limit ?? 20)
          .map(r => tweetRow(r as Args)),
      );
    case "store_stats": {
      const conn = db(args);
      const count = (t: string) => (conn.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as Args).n as number;
      const by_kind = (
        conn.prepare("SELECT kind, COUNT(*) AS n FROM edges GROUP BY kind ORDER BY kind").all() as Args[]
      ).map(r => [r.kind, r.n]);
      return ok({
        path: args.path ?? "",
        tweets: count("tweets"),
        users: count("users"),
        edges: count("edges"),
        follows: count("follows"),
        by_kind,
      });
    }
    case "store_export":
      return ok(
        (db(args).prepare("SELECT json FROM tweets ORDER BY first_seen DESC").all() as Args[]).map(r =>
          JSON.parse(r.json),
        ),
      );
    case "store_digest": {
      const conn = db(args);
      const top = args.top ?? 10;
      const top_authors = (
        conn
          .prepare(
            "SELECT author_username AS a, COUNT(*) AS n FROM tweets WHERE author_username <> '' GROUP BY author_username ORDER BY n DESC LIMIT ?1",
          )
          .all(top) as Args[]
      ).map(r => [r.a, r.n]);
      const top_tweets = (
        conn
          .prepare(
            "SELECT id, author_username, author_name, text, created_at, like_count FROM tweets ORDER BY like_count DESC LIMIT ?1",
          )
          .all(top) as Args[]
      ).map(tweetRow);
      return ok({ top_authors, top_tweets });
    }
    case "store_mutuals":
    case "store_non_mutual": {
      const setOp = op === "store_mutuals" ? "INTERSECT" : "EXCEPT";
      const rows = db(args)
        .prepare(
          `SELECT username FROM follows WHERE account=?1 AND direction='following' ${setOp}
           SELECT username FROM follows WHERE account=?1 AND direction='follower'`,
        )
        .all(args.account) as Args[];
      return ok(rows.map(r => r.username));
    }
    case "store_query":
      return ok(storeQuery(db(args), args));
    case "store_known_usernames":
      return ok(
        (db(args).prepare("SELECT DISTINCT lower(username) AS u FROM users WHERE username <> ''").all() as Args[]).map(
          r => r.u,
        ),
      );
    case "store_known_communities":
      return ok(
        (
          db(args)
            .prepare(
              String.raw`SELECT DISTINCT account FROM edges WHERE kind = 'timeline' AND account LIKE 'community\_%' ESCAPE '\'`,
            )
            .all() as Args[]
        ).map(r => String(r.account).slice("community_".length)),
      );
    case "import_archive":
      return ok(importArchive(db(args), args));
    case "archive_resolve_file":
      return ok(archiveResolve(args.path));
    case "archive_parse":
      return ok(archiveParse(args.raw));
    case "archive_tweet":
      return ok(archiveTweet(args.element, args.owner));
    case "parse_post_count":
      return ok(parsePostCount(args.text));
    case "features_for":
      return ok(featuresFor(args.operation));
    case "parse_user_result":
      return ok(parseUserResult(args.json));
    default:
      return { handled: false };
  }
}
