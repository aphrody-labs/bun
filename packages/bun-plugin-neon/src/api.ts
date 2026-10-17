export type NeonApiOptions = {
  apiKey?: string;
  projectId?: string;
  orgId?: string;
  database: string;
  role: string;
  branchId?: string;
  pooled?: boolean;
  baseUrl?: string;
};

/** Reads a connection URI from the Neon API using NEON_API_KEY and NEON_PROJECT_ID; the database and role are explicit. */
export async function fetchNeonConnectionUri(options: NeonApiOptions): Promise<string> {
  const apiKey = options.apiKey ?? Bun.env.NEON_API_KEY;
  const projectId = options.projectId ?? Bun.env.NEON_PROJECT_ID;
  if (!apiKey) throw new Error("NEON_API_KEY is required");
  if (!projectId) throw new Error("NEON_PROJECT_ID is required");

  const url = new URL(`projects/${encodeURIComponent(projectId)}/connection_uri`, options.baseUrl ?? "https://console.neon.tech/api/v2/");
  url.searchParams.set("database_name", options.database);
  url.searchParams.set("role_name", options.role);
  url.searchParams.set("pooled", String(options.pooled ?? false));
  if (options.branchId) url.searchParams.set("branch_id", options.branchId);

  const response = await fetch(url, { headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" } });
  if (!response.ok) throw new Error(`Neon API returned ${response.status} for the connection URI`);
  const body = (await response.json()) as { uri?: unknown };
  if (typeof body.uri !== "string" || !body.uri) throw new Error("Neon API response has no connection URI");
  return body.uri;
}

export type NeonProjectsOptions = { apiKey?: string; orgId?: string; baseUrl?: string };

/** Lists the project ids of the organization named by NEON_ORG_ID (or `orgId`); the API key is read from NEON_API_KEY. */
export async function listNeonProjects(options: NeonProjectsOptions = {}): Promise<string[]> {
  const apiKey = options.apiKey ?? Bun.env.NEON_API_KEY;
  const orgId = options.orgId ?? Bun.env.NEON_ORG_ID;
  if (!apiKey) throw new Error("NEON_API_KEY is required");
  if (!orgId) throw new Error("NEON_ORG_ID is required");

  const url = new URL("projects", options.baseUrl ?? "https://console.neon.tech/api/v2/");
  url.searchParams.set("org_id", orgId);
  const response = await fetch(url, { headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" } });
  if (!response.ok) throw new Error(`Neon API returned ${response.status} for the project list`);
  const body = (await response.json()) as { projects?: { id?: unknown }[] };
  return (body.projects ?? []).flatMap(project => (typeof project.id === "string" ? [project.id] : []));
}
