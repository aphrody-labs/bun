// Snapshot public upstream collaboration without fabricating fork PRs or authors.
// bun scripts/aphrody/sync-public-upstream.ts --output <external-factory-directory>
import { mkdir, realpath, rename } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

export const PUBLIC_UPSTREAM = "oven-sh/bun";
export const PUBLIC_API_REQUEST_BUDGET = 4000;
let responseCache: string | undefined;
let apiRequests = 0;
let publicRepositoryId: number | undefined;

export function graphqlRequest(payload: Record<string, unknown>): {
  query: string;
  variables: Record<string, unknown>;
} {
  const { query, ...variables } = payload;
  if (typeof query !== "string" || !query) throw new Error("Missing GraphQL query");
  return { query, variables };
}

export function verifiedPublicCache(record: unknown): unknown {
  if (!record || typeof record !== "object" || !Object.hasOwn(record, "value"))
    throw new Error("Corrupt public API response cache");
  const { value, sha256 } = record as { value: unknown; sha256?: unknown };
  const json = JSON.stringify(value);
  if (
    json === undefined ||
    typeof sha256 !== "string" ||
    new Bun.CryptoHasher("sha256").update(json).digest("hex") !== sha256
  )
    throw new Error("Corrupt public API response cache");
  return value;
}

export async function writePublicCache(path: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  if (json === undefined) throw new Error("Invalid public API response");
  const temporary = `${path}.${crypto.randomUUID()}.pending`;
  await Bun.write(
    temporary,
    JSON.stringify({
      received: new Date().toISOString(),
      value,
      sha256: new Bun.CryptoHasher("sha256").update(json).digest("hex"),
    }),
  );
  await rename(temporary, path);
}

export async function createSnapshotWriter(path: string) {
  // FileSink writes at offset zero without truncating a longer existing file.
  // Resume reconstructs the JSONL from verified cached pages, so clear stale tails.
  await Bun.write(path, "");
  return Bun.file(path).writer();
}

export function consumeRequestBudget(consumed: number): number {
  if (!Number.isSafeInteger(consumed) || consumed < 0) throw new Error("Invalid API request count");
  if (consumed >= PUBLIC_API_REQUEST_BUDGET)
    throw new Error("API request budget reached; resume this generation after quota reset");
  return consumed + 1;
}

export function commentUpdateTimestamp(value: unknown, previous: number): number {
  if (typeof value !== "string") throw new Error("Comment missing update timestamp");
  const updated = Date.parse(value);
  if (!Number.isFinite(updated) || updated < previous)
    throw new Error("Comment update timestamps are not monotone; snapshot remains incomplete");
  return updated;
}

export function outsideCheckout(checkout: string, output: string): boolean {
  const path = relative(resolve(checkout), resolve(output));
  return path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(path);
}

export function publicRepository(repository: { full_name?: string; private?: boolean }): void {
  if (repository.full_name !== PUBLIC_UPSTREAM || repository.private !== false) {
    throw new Error("Only the verified public oven-sh/bun repository can be synchronized");
  }
}

export function nextPage(header: string, repositoryId?: number): string | null {
  const link = header
    .split(/\r?\n/)
    .find((line) => /^link:/i.test(line))
    ?.replace(/^link:\s*/i, "");
  const next = link
    ?.split(",")
    .map((part) => part.match(/<([^>]+)>;\s*rel="next"/))
    .find(Boolean)?.[1];
  if (!next) return null;
  const url = new URL(next);
  const prefixes = [`/repos/${PUBLIC_UPSTREAM}/`];
  if (Number.isSafeInteger(repositoryId)) prefixes.push(`/repositories/${repositoryId}/`);
  const prefix = prefixes.find((prefix) => url.pathname.startsWith(prefix));
  if (
    url.origin !== "https://api.github.com" ||
    !prefix ||
    !["issues", "issues/comments", "pulls/comments"].includes(url.pathname.slice(prefix.length))
  ) {
    throw new Error("Unexpected public pagination destination");
  }
  if (url.searchParams.has("after") || url.searchParams.has("before"))
    url.searchParams.delete("page");
  return url.pathname.slice(1) + url.search;
}

export function publicPageEntries(values: unknown, seen: Set<number>): Record<string, unknown>[] {
  if (!Array.isArray(values)) throw new Error("Unexpected GitHub page");
  const fresh: Record<string, unknown>[] = [];
  for (const value of values) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Unexpected GitHub entry");
    const entry = value as Record<string, unknown>;
    if (typeof entry.id !== "number" || !Number.isSafeInteger(entry.id) || entry.id <= 0)
      throw new Error("GitHub entry missing stable id");
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      fresh.push(entry);
    }
  }
  return fresh;
}

export function nextCommentWindow(
  since: string,
  latestUpdated: string | undefined,
  records: number,
  fresh: number,
): string | null {
  if (
    !Number.isSafeInteger(records) ||
    records < 0 ||
    !Number.isSafeInteger(fresh) ||
    fresh < 0 ||
    fresh > records
  )
    throw new Error("Invalid comment window counts");
  const previous = Date.parse(since);
  if (!Number.isFinite(previous)) throw new Error("Invalid comment window cursor");
  if (records === 0) return null;
  if (!latestUpdated || !Number.isFinite(Date.parse(latestUpdated)))
    throw new Error("Comment missing update timestamp");
  // The repository endpoint can truncate at 30,000 records without a next link.
  // Re-query overlapping the final second, deduplicating stable ids. A saturated
  // second cannot be skipped safely, so it leaves an explicitly incomplete export.
  const next = Date.parse(latestUpdated) - 1000;
  if (next <= previous) {
    if (records >= 30000 || fresh > 0)
      throw new Error("Comment timestamp window is saturated; snapshot remains incomplete");
    return null;
  }
  return new Date(next).toISOString();
}

async function api(
  endpoint: string,
  payload?: Record<string, unknown>,
  headers = false,
): Promise<any> {
  const requestPayload = endpoint === "graphql" && payload ? graphqlRequest(payload) : payload;
  const key = new Bun.CryptoHasher("sha256")
    .update(
      JSON.stringify({ endpoint, payload: requestPayload, ...(headers ? { headers: true } : {}) }),
    )
    .digest("hex");
  const cachePath = responseCache ? join(responseCache, `${key}.json`) : undefined;
  const cached = cachePath ? Bun.file(cachePath) : undefined;
  if (cached && (await cached.exists())) {
    return verifiedPublicCache(await cached.json());
  }
  apiRequests = consumeRequestBudget(apiRequests);
  const command = ["gh", "api", endpoint];
  if (headers) command.push("--include");
  if (requestPayload) command.push("--input", "-");
  const child = Bun.spawn(command, {
    stdin: requestPayload ? Buffer.from(JSON.stringify(requestPayload)) : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, error, code] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);
  if (code !== 0)
    throw new Error(`GitHub ${endpoint.split("?")[0]} failed (${code}): ${error.trim()}`);
  const split = headers ? out.search(/\r?\n\r?\n/) : -1;
  if (headers && split < 0) throw new Error("GitHub response headers missing");
  const value = JSON.parse(headers ? out.slice(split).trimStart() : out);
  const result = headers
    ? { data: value, next: nextPage(out.slice(0, split), publicRepositoryId) }
    : value;
  if (result.errors?.length)
    throw new Error("GitHub GraphQL returned errors; snapshot remains incomplete");
  if (cachePath) await writePublicCache(cachePath, result);
  return result;
}

export async function snapshot(output: string, maxPages = 1000, resume?: string) {
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 10000)
    throw new Error("Invalid page bound");
  const root = resolve(import.meta.dir, "../..");
  await mkdir(output, { recursive: true });
  const destination = await realpath(output);
  if (!outsideCheckout(await realpath(root), destination))
    throw new Error("Snapshot output must be outside the checkout");
  responseCache = undefined;
  apiRequests = 0;
  const repository = await api(`repos/${PUBLIC_UPSTREAM}`);
  publicRepository(repository);
  if (!Number.isSafeInteger(repository.id) || repository.id <= 0)
    throw new Error("Invalid public repository identity");
  publicRepositoryId = repository.id;
  if (resume && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resume))
    throw new Error("Invalid resume generation");
  const generation = resume ?? crypto.randomUUID();
  responseCache = join(destination, `upstream-public-${generation}.pages`);
  await mkdir(responseCache, { recursive: true });
  const name = `upstream-public-${generation}.jsonl`;
  const writer = await createSnapshotWriter(join(destination, `${name}.partial`));
  const counts: Record<string, number> = {};
  const digest = new Bun.CryptoHasher("sha256");
  const write = (kind: string, value: unknown) => {
    counts[kind] = (counts[kind] ?? 0) + 1;
    const line = `${JSON.stringify({ source: PUBLIC_UPSTREAM, kind, value })}\n`;
    digest.update(line);
    writer.write(line);
  };
  write("repository", repository);
  const started = new Date().toISOString();
  let complete = false;
  try {
    let issueCommentsSeen = new Set<number>();
    // The issues endpoint also includes pull requests, retaining their real
    // upstream numbers, URLs, state and authors. No fork PR is manufactured.
    for (const [kind, endpoint] of [
      ["issue-or-pull-request", "issues?state=all&sort=created&direction=asc"],
      ["issue-comment", "issues/comments?sort=created&direction=asc"],
      ["pull-request-review-comment", "pulls/comments?sort=created&direction=asc"],
    ]) {
      let finished = false;
      let request = `repos/${PUBLIC_UPSTREAM}/${endpoint}&per_page=100`;
      const seen = new Set<number>();
      if (kind === "issue-comment") issueCommentsSeen = seen;
      for (let page = 1; page <= maxPages; page++) {
        const response = await api(request, undefined, true);
        const values = response.data;
        for (const value of publicPageEntries(values, seen)) write(kind!, value);
        await writer.flush();
        if (!response.next) {
          finished = true;
          break;
        }
        request = nextPage(
          `Link: <https://api.github.com/${response.next}>; rel="next"`,
          publicRepositoryId,
        )!;
      }
      if (!finished) throw new Error(`Page limit reached for ${kind}; snapshot is incomplete`);
    }
    // Retain the original cached comment pages, then fill the repository endpoint's
    // truncated history through its documented updated/since query parameters.
    let since = "1970-01-01T00:00:00.000Z";
    let commentsFinished = false;
    for (let window = 1; window <= maxPages; window++) {
      let request = `repos/${PUBLIC_UPSTREAM}/issues/comments?sort=updated&direction=asc&per_page=100&since=${encodeURIComponent(since)}`;
      let records = 0;
      let fresh = 0;
      let latestUpdated: string | undefined;
      let lastUpdate = Date.parse(since);
      let windowFinished = false;
      for (let page = 1; page <= maxPages; page++) {
        const response = await api(request, undefined, true);
        if (!Array.isArray(response.data)) throw new Error("Unexpected GitHub comment page");
        for (const value of response.data) {
          if (!value || typeof value.updated_at !== "string")
            throw new Error("Comment missing update timestamp");
          const updated = commentUpdateTimestamp(value.updated_at, lastUpdate);
          lastUpdate = updated;
          latestUpdated = value.updated_at;
        }
        records += response.data.length;
        const entries = publicPageEntries(response.data, issueCommentsSeen);
        fresh += entries.length;
        for (const value of entries) write("issue-comment", value);
        await writer.flush();
        if (!response.next) {
          windowFinished = true;
          break;
        }
        request = nextPage(
          `Link: <https://api.github.com/${response.next}>; rel="next"`,
          publicRepositoryId,
        )!;
      }
      if (!windowFinished) throw new Error("Comment page limit reached; snapshot is incomplete");
      const next = nextCommentWindow(since, latestUpdated, records, fresh);
      if (!next) {
        commentsFinished = true;
        break;
      }
      since = next;
    }
    if (!commentsFinished) throw new Error("Comment window limit reached; snapshot is incomplete");
    let cursor: string | null = null;
    let finished = false;
    for (let page = 1; page <= maxPages; page++) {
      const result = await api("graphql", {
        query: `query($cursor:String){repository(owner:"oven-sh",name:"bun"){discussions(first:50,after:$cursor,orderBy:{field:CREATED_AT,direction:ASC}){nodes{id number title url body createdAt updatedAt author{login} category{name} comments{totalCount}} pageInfo{endCursor hasNextPage}}}}`,
        cursor,
      });
      const connection = result.data.repository.discussions;
      for (const discussion of connection.nodes) {
        write("discussion", discussion);
        await discussionComments(discussion.id, maxPages, write);
      }
      await writer.flush();
      if (!connection.pageInfo.hasNextPage) {
        finished = true;
        break;
      }
      cursor = connection.pageInfo.endCursor;
      if (!cursor) throw new Error("Missing discussion continuation cursor");
    }
    if (!finished) throw new Error("Discussion page limit reached; snapshot is incomplete");
    complete = true;
  } finally {
    await writer.end();
    if (complete) await rename(join(destination, `${name}.partial`), join(destination, name));
    await Bun.write(
      join(
        destination,
        complete ? "upstream-public.json" : `upstream-public-${generation}.incomplete.json`,
      ),
      JSON.stringify(
        {
          source: PUBLIC_UPSTREAM,
          generation,
          started,
          finished: new Date().toISOString(),
          complete,
          counts,
          file: complete ? name : `${name}.partial`,
          sha256: digest.digest("hex"),
        },
        null,
        2,
      ) + "\n",
    );
  }
  return counts;
}

async function discussionComments(
  id: string,
  bound: number,
  write: (kind: string, value: unknown) => void,
) {
  let cursor: string | null = null;
  for (let page = 1; page <= bound; page++) {
    const result = await api("graphql", {
      query: `query($id:ID!,$cursor:String){node(id:$id){... on Discussion{comments(first:100,after:$cursor){nodes{id url body createdAt updatedAt author{login}} pageInfo{endCursor hasNextPage}}}}}`,
      id,
      cursor,
    });
    const connection = result.data.node.comments;
    for (const comment of connection.nodes) {
      write("discussion-comment", { discussionId: id, ...comment });
      let replyCursor: string | null = null;
      let finished = false;
      for (let replyPage = 1; replyPage <= bound; replyPage++) {
        const result = await api("graphql", {
          query: `query($id:ID!,$cursor:String){node(id:$id){... on DiscussionComment{replies(first:100,after:$cursor){nodes{id url body createdAt updatedAt author{login}} pageInfo{endCursor hasNextPage}}}}}`,
          id: comment.id,
          cursor: replyCursor,
        });
        const replies = result.data.node.replies;
        for (const reply of replies.nodes)
          write("discussion-reply", { commentId: comment.id, ...reply });
        if (!replies.pageInfo.hasNextPage) {
          finished = true;
          break;
        }
        replyCursor = replies.pageInfo.endCursor;
        if (!replyCursor) throw new Error("Missing reply continuation cursor");
      }
      if (!finished) throw new Error("Reply page limit reached; snapshot is incomplete");
    }
    if (!connection.pageInfo.hasNextPage) return;
    cursor = connection.pageInfo.endCursor;
    if (!cursor) throw new Error("Missing comment continuation cursor");
  }
  throw new Error("Comment page limit reached; snapshot is incomplete");
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const output = args[args.indexOf("--output") + 1];
  if (!args.includes("--output") || !output)
    throw new Error("Required: --output <external-factory-directory>");
  const bound = args.includes("--max-pages") ? Number(args[args.indexOf("--max-pages") + 1]) : 1000;
  const resume = args.includes("--resume") ? args[args.indexOf("--resume") + 1] : undefined;
  if (args.includes("--resume") && !resume)
    throw new Error("--resume requires a generation from the incomplete manifest");
  console.log(JSON.stringify(await snapshot(resolve(output), bound, resume)));
}
