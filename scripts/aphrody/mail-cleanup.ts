import { parseArgs } from "node:util";

type Provider = "gmail" | "outlook";
type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type CleanupConfig = {
  apply: boolean;
  days: number;
  maxMessages: number;
  providers: Provider[];
  unsubscribe: boolean;
};

type Header = { name: string; value: string };

export type UnsubscribeAction =
  | { key: string; kind: "https"; url: string }
  | { address: string; body: string; key: string; kind: "mailto"; subject: string };

export type MailboxPlan = {
  newsletters: Array<{ id: string; unsubscribe: UnsubscribeAction | null }>;
  provider: Provider;
  spamIds: string[];
};

type ExecutionResult = {
  errors: string[];
  moved: Record<Provider, number>;
  unsubscribed: Record<Provider, number>;
};

type GmailMessageList = {
  messages?: Array<{ id: string }>;
  nextPageToken?: string;
};

type GmailMessage = {
  id: string;
  payload?: { headers?: Header[] };
};

type OutlookMessage = {
  id: string;
  internetMessageHeaders?: Header[];
};

type OutlookMessagePage = {
  "@odata.nextLink"?: string;
  value?: OutlookMessage[];
};

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const GRAPH_API = "https://graph.microsoft.com/v1.0/me";
const SECRET_SERVICE = "aphrody-mail-cleanup";
const REQUEST_TIMEOUT_MS = 30_000;
const ONE_CLICK_BODY = "List-Unsubscribe=One-Click";

const HELP = `Nettoie Gmail et Outlook avec un aperçu sans modification par défaut.

Usage:
  bun scripts/aphrody/mail-cleanup.ts [options]

Options:
  --apply                 Désabonne puis place les messages ciblés à la corbeille
  --provider <nom>        gmail, outlook ou all (défaut: all)
  --days <n>              Ancienneté minimale des newsletters (défaut: 30)
  --max <n>               Nombre maximal par catégorie et fournisseur (défaut: 500)
  --no-unsubscribe        Nettoie sans envoyer de demande de désabonnement
  --json                  Affiche uniquement un résumé JSON sans contenu de message
  --help                  Affiche cette aide

Authentification:
  GMAIL_ACCESS_TOKEN et OUTLOOK_ACCESS_TOKEN, ou les entrées Bun.secrets
  gmail-access-token et outlook-access-token du service ${SECRET_SERVICE}.
`;

function positiveInteger(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} doit être un entier positif.`);
  }
  return parsed;
}

export function parseCleanupArgs(args: string[]): CleanupConfig & { help: boolean; json: boolean } {
  const parsed = parseArgs({
    args,
    allowPositionals: false,
    options: {
      apply: { type: "boolean", default: false },
      days: { type: "string", default: "30" },
      help: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      max: { type: "string", default: "500" },
      "no-unsubscribe": { type: "boolean", default: false },
      provider: { type: "string", default: "all" },
    },
    strict: true,
  });

  const provider = parsed.values.provider;
  if (provider !== "all" && provider !== "gmail" && provider !== "outlook") {
    throw new Error("--provider doit valoir gmail, outlook ou all.");
  }

  return {
    apply: parsed.values.apply,
    days: positiveInteger(parsed.values.days, "--days"),
    help: parsed.values.help,
    json: parsed.values.json,
    maxMessages: positiveInteger(parsed.values.max, "--max"),
    providers: provider === "all" ? ["gmail", "outlook"] : [provider],
    unsubscribe: !parsed.values["no-unsubscribe"],
  };
}

function headerValue(headers: Header[], name: string): string | undefined {
  return headerValues(headers, name)[0];
}

function headerValues(headers: Header[], name: string): string[] {
  const normalizedName = name.toLowerCase();
  return headers.filter(header => header.name.toLowerCase() === normalizedName).map(header => header.value);
}

function sanitizeHeader(value: string, fallback: string): string {
  const sanitized = value.replace(/[\r\n]+/g, " ").trim();
  return sanitized || fallback;
}

function parseMailto(uri: string): UnsubscribeAction | null {
  const url = new URL(uri);
  if (url.protocol !== "mailto:") return null;

  const address = decodeURIComponent(url.pathname).trim();
  if (!/^[^\s@,]+@[^\s@,]+$/.test(address)) return null;

  const subject = sanitizeHeader(url.searchParams.get("subject") ?? "unsubscribe", "unsubscribe");
  const body = url.searchParams.get("body")?.trim() || "unsubscribe";
  return {
    address,
    body,
    key: `mailto:${address.toLowerCase()}:${subject}:${body}`,
    kind: "mailto",
    subject,
  };
}

export function parseUnsubscribe(headers: Header[]): UnsubscribeAction | null {
  const listHeader = headerValue(headers, "List-Unsubscribe");
  const authentication = headerValues(headers, "Authentication-Results").join("; ");
  const signedHeaderSets = headerValues(headers, "DKIM-Signature").map(
    signature =>
      signature
        .match(/(?:^|;)\s*h=([^;]+)/i)?.[1]
        ?.split(":")
        .map(name => name.trim().toLowerCase()) ?? [],
  );
  if (
    !listHeader ||
    !signedHeaderSets.some(names => names.includes("list-unsubscribe")) ||
    !/(?:^|[;\s])dkim=pass\b/i.test(authentication)
  ) {
    return null;
  }

  const uris = [...listHeader.matchAll(/<([^<>]+)>/g)].flatMap(match => (match[1] ? [match[1].trim()] : []));
  const oneClick =
    headerValue(headers, "List-Unsubscribe-Post")?.trim() === ONE_CLICK_BODY &&
    signedHeaderSets.some(names => names.includes("list-unsubscribe") && names.includes("list-unsubscribe-post"));

  if (oneClick) {
    for (const uri of uris) {
      try {
        const url = new URL(uri);
        if (url.protocol === "https:") {
          return { key: `https:${url.href}`, kind: "https", url: url.href };
        }
      } catch {
        continue;
      }
    }
  }

  for (const uri of uris) {
    try {
      const action = parseMailto(uri);
      if (action) return action;
    } catch {
      continue;
    }
  }
  return null;
}

async function checkedFetch(
  fetchImpl: Fetch,
  label: string,
  input: string | URL,
  init: RequestInit,
): Promise<Response> {
  const response = await fetchImpl(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}.`);
  return response;
}

async function apiJson<T>(
  fetchImpl: Fetch,
  label: string,
  input: string | URL,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await checkedFetch(fetchImpl, label, input, { ...init, headers });
  return (await response.json()) as T;
}

async function apiEmpty(
  fetchImpl: Fetch,
  label: string,
  input: string | URL,
  token: string,
  init: RequestInit,
): Promise<void> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body) headers.set("Content-Type", "application/json");
  await checkedFetch(fetchImpl, label, input, { ...init, headers });
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, callback: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await callback(items[index]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function listGmailIds(
  token: string,
  maxMessages: number,
  fetchImpl: Fetch,
  options: { includeSpamTrash?: boolean; label?: string; query?: string },
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${GMAIL_API}/messages`);
    url.searchParams.set("maxResults", String(Math.min(500, maxMessages - ids.length)));
    if (options.includeSpamTrash) url.searchParams.set("includeSpamTrash", "true");
    if (options.label) url.searchParams.append("labelIds", options.label);
    if (options.query) url.searchParams.set("q", options.query);
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const page = await apiJson<GmailMessageList>(fetchImpl, "Lecture Gmail", url, token);
    for (const message of page.messages ?? []) {
      if (ids.length >= maxMessages) break;
      ids.push(message.id);
    }
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < maxMessages);

  return ids;
}

async function getGmailHeaders(token: string, id: string, fetchImpl: Fetch): Promise<Header[]> {
  const url = new URL(`${GMAIL_API}/messages/${encodeURIComponent(id)}`);
  url.searchParams.set("format", "metadata");
  for (const name of ["Authentication-Results", "DKIM-Signature", "List-Unsubscribe", "List-Unsubscribe-Post"]) {
    url.searchParams.append("metadataHeaders", name);
  }
  const message = await apiJson<GmailMessage>(fetchImpl, "Lecture des en-têtes Gmail", url, token);
  return message.payload?.headers ?? [];
}

export async function planGmail(config: CleanupConfig, token: string, fetchImpl: Fetch): Promise<MailboxPlan> {
  const [spamIds, newsletterIds] = await Promise.all([
    listGmailIds(token, config.maxMessages, fetchImpl, { includeSpamTrash: true, label: "SPAM" }),
    listGmailIds(token, config.maxMessages, fetchImpl, { query: `in:inbox older_than:${config.days}d` }),
  ]);
  const headers = await mapConcurrent(newsletterIds, 8, id => getGmailHeaders(token, id, fetchImpl));
  const newsletters = newsletterIds.flatMap((id, index) => {
    const messageHeaders = headers[index];
    if (!messageHeaders || headerValue(messageHeaders, "List-Unsubscribe") === undefined) return [];
    return [{ id, unsubscribe: parseUnsubscribe(messageHeaders) }];
  });
  return { newsletters, provider: "gmail", spamIds };
}

function validatedGraphNextLink(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const url = new URL(value);
  if (url.origin !== "https://graph.microsoft.com" || !url.pathname.startsWith("/v1.0/me/")) {
    throw new Error("Pagination Outlook invalide.");
  }
  return url.href;
}

async function listOutlookMessages(
  token: string,
  folder: "inbox" | "junkemail",
  maxMessages: number,
  cutoff: string | undefined,
  fetchImpl: Fetch,
): Promise<OutlookMessage[]> {
  const messages: OutlookMessage[] = [];
  const initial = new URL(`${GRAPH_API}/mailFolders/${folder}/messages`);
  initial.searchParams.set("$top", String(Math.min(100, maxMessages)));
  initial.searchParams.set("$select", "id,receivedDateTime");
  if (cutoff) {
    initial.searchParams.set("$filter", `receivedDateTime lt ${cutoff}`);
    initial.searchParams.set("$orderby", "receivedDateTime desc");
  }
  let next: string | undefined = initial.href;

  while (next && messages.length < maxMessages) {
    const page = await apiJson<OutlookMessagePage>(fetchImpl, "Lecture Outlook", next, token);
    for (const message of page.value ?? []) {
      if (messages.length >= maxMessages) break;
      messages.push(message);
    }
    next = validatedGraphNextLink(page["@odata.nextLink"]);
  }
  return messages;
}

async function getOutlookHeaders(token: string, id: string, fetchImpl: Fetch): Promise<Header[]> {
  const url = new URL(`${GRAPH_API}/messages/${encodeURIComponent(id)}`);
  url.searchParams.set("$select", "id,internetMessageHeaders");
  const message = await apiJson<OutlookMessage>(fetchImpl, "Lecture des en-têtes Outlook", url, token);
  return message.internetMessageHeaders ?? [];
}

export async function planOutlook(config: CleanupConfig, token: string, fetchImpl: Fetch): Promise<MailboxPlan> {
  const cutoff = new Date(Date.now() - config.days * 86_400_000).toISOString();
  const [spam, inbox] = await Promise.all([
    listOutlookMessages(token, "junkemail", config.maxMessages, undefined, fetchImpl),
    listOutlookMessages(token, "inbox", config.maxMessages, cutoff, fetchImpl),
  ]);
  const headers = await mapConcurrent(inbox, 8, message => getOutlookHeaders(token, message.id, fetchImpl));
  const newsletters = inbox.flatMap((message, index) => {
    const messageHeaders = headers[index];
    if (!messageHeaders || headerValue(messageHeaders, "List-Unsubscribe") === undefined) return [];
    return [{ id: message.id, unsubscribe: parseUnsubscribe(messageHeaders) }];
  });
  return { newsletters, provider: "outlook", spamIds: spam.map(message => message.id) };
}

async function unsubscribeHttps(
  action: Extract<UnsubscribeAction, { kind: "https" }>,
  fetchImpl: Fetch,
): Promise<void> {
  const response = await fetchImpl(action.url, {
    body: ONE_CLICK_BODY,
    credentials: "omit",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error("Désabonnement HTTPS refusé: redirection interdite.");
  }
  if (!response.ok) throw new Error(`Désabonnement HTTPS refusé: HTTP ${response.status}.`);
}

function gmailRawMessage(action: Extract<UnsubscribeAction, { kind: "mailto" }>): string {
  const raw = [
    `To: ${action.address}`,
    `Subject: ${action.subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    action.body,
  ].join("\r\n");
  return Buffer.from(raw, "utf8").toString("base64url");
}

async function unsubscribeMailto(
  provider: Provider,
  action: Extract<UnsubscribeAction, { kind: "mailto" }>,
  token: string,
  fetchImpl: Fetch,
): Promise<void> {
  if (provider === "gmail") {
    await apiEmpty(fetchImpl, "Désabonnement Gmail", `${GMAIL_API}/messages/send`, token, {
      body: JSON.stringify({ raw: gmailRawMessage(action) }),
      method: "POST",
    });
    return;
  }

  await apiEmpty(fetchImpl, "Désabonnement Outlook", `${GRAPH_API}/sendMail`, token, {
    body: JSON.stringify({
      message: {
        body: { content: action.body, contentType: "Text" },
        subject: action.subject,
        toRecipients: [{ emailAddress: { address: action.address } }],
      },
      saveToSentItems: true,
    }),
    method: "POST",
  });
}

async function moveToTrash(provider: Provider, id: string, token: string, fetchImpl: Fetch): Promise<void> {
  if (provider === "gmail") {
    await apiEmpty(
      fetchImpl,
      "Mise à la corbeille Gmail",
      `${GMAIL_API}/messages/${encodeURIComponent(id)}/trash`,
      token,
      { method: "POST" },
    );
    return;
  }

  await apiEmpty(
    fetchImpl,
    "Mise à la corbeille Outlook",
    `${GRAPH_API}/messages/${encodeURIComponent(id)}/move`,
    token,
    { body: JSON.stringify({ destinationId: "deleteditems" }), method: "POST" },
  );
}

async function settleActions<T>(
  items: T[],
  action: (item: T) => Promise<void>,
  onSuccess: () => void,
  errors: string[],
): Promise<void> {
  await mapConcurrent(items, 4, async item => {
    try {
      await action(item);
      onSuccess();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  });
}

export async function executePlans(
  plans: MailboxPlan[],
  tokens: Partial<Record<Provider, string>>,
  fetchImpl: Fetch = fetch,
  unsubscribe = true,
): Promise<ExecutionResult> {
  const result: ExecutionResult = {
    errors: [],
    moved: { gmail: 0, outlook: 0 },
    unsubscribed: { gmail: 0, outlook: 0 },
  };

  for (const plan of plans) {
    const token = tokens[plan.provider];
    if (!token) {
      result.errors.push(`Jeton ${plan.provider} indisponible.`);
      continue;
    }

    if (unsubscribe) {
      const unique = new Map<string, UnsubscribeAction>();
      for (const message of plan.newsletters) {
        if (message.unsubscribe) unique.set(message.unsubscribe.key, message.unsubscribe);
      }
      await settleActions(
        [...unique.values()],
        action =>
          action.kind === "https"
            ? unsubscribeHttps(action, fetchImpl)
            : unsubscribeMailto(plan.provider, action, token, fetchImpl),
        () => result.unsubscribed[plan.provider]++,
        result.errors,
      );
    }

    const ids = [...new Set([...plan.spamIds, ...plan.newsletters.map(message => message.id)])];
    await settleActions(
      ids,
      id => moveToTrash(plan.provider, id, token, fetchImpl),
      () => result.moved[plan.provider]++,
      result.errors,
    );
  }
  return result;
}

async function readToken(provider: Provider): Promise<string> {
  const environmentName = provider === "gmail" ? "GMAIL_ACCESS_TOKEN" : "OUTLOOK_ACCESS_TOKEN";
  const fromEnvironment = Bun.env[environmentName]?.trim();
  if (fromEnvironment) return fromEnvironment;

  let keychainError: unknown;
  try {
    const fromKeychain = await Bun.secrets.get({ service: SECRET_SERVICE, name: `${provider}-access-token` });
    if (fromKeychain?.trim()) return fromKeychain.trim();
  } catch (error) {
    keychainError = error;
  }
  throw new Error(`Jeton ${provider} absent (${environmentName} ou Bun.secrets).`, { cause: keychainError });
}

function planSummary(plan: MailboxPlan) {
  return {
    newsletters: plan.newsletters.length,
    provider: plan.provider,
    spam: plan.spamIds.length,
    unsubscribeSupported: plan.newsletters.filter(message => message.unsubscribe !== null).length,
  };
}

async function run(config: CleanupConfig & { json: boolean }): Promise<number> {
  const plans: MailboxPlan[] = [];
  const tokens: Partial<Record<Provider, string>> = {};
  const errors: string[] = [];

  for (const provider of config.providers) {
    try {
      const token = await readToken(provider);
      tokens[provider] = token;
      plans.push(
        provider === "gmail" ? await planGmail(config, token, fetch) : await planOutlook(config, token, fetch),
      );
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  let execution: ExecutionResult | undefined;
  if (config.apply && plans.length) {
    execution = await executePlans(plans, tokens, fetch, config.unsubscribe);
    errors.push(...execution.errors);
  }

  const summary = {
    applied: config.apply,
    errors: errors.length,
    providers: plans.map(planSummary),
    result: execution ? { moved: execution.moved, unsubscribed: execution.unsubscribed } : undefined,
  };

  if (config.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(config.apply ? "Nettoyage appliqué." : "Aperçu uniquement: aucune modification.");
    for (const provider of summary.providers) {
      console.log(
        `${provider.provider}: ${provider.spam} spam, ${provider.newsletters} newsletters, ${provider.unsubscribeSupported} désabonnements pris en charge.`,
      );
    }
    if (execution) {
      for (const provider of config.providers) {
        console.log(
          `${provider}: ${execution.moved[provider]} messages déplacés, ${execution.unsubscribed[provider]} désabonnements envoyés.`,
        );
      }
    }
    for (const error of errors) console.error(error);
  }
  return errors.length ? 1 : 0;
}

if (import.meta.main) {
  try {
    const config = parseCleanupArgs(Bun.argv.slice(2));
    if (config.help) {
      console.log(HELP);
    } else {
      process.exitCode = await run(config);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
