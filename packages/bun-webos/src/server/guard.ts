// SPDX-License-Identifier: Apache-2.0
/**
 * Host access boundary. Routes that touch the machine (shell, files, processes, pty, eval) answer only
 * when the server listens on loopback and the request comes from the WebOS page itself: no Origin
 * (curl, Bun.WebView, tests) or an Origin equal to the server's, and never `Sec-Fetch-Site: cross-site`.
 * A page on another site can therefore not drive the shell of the person running the WebOS.
 */
import type { Server } from "bun";

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost", "::ffff:127.0.0.1"]);

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK.has(hostname.replace(/^\[|\]$/g, "").toLowerCase());
}

export interface HostAccessPolicy {
  /** false disables every host route (the WebOS then only serves measurements and playgrounds). */
  enabled: boolean;
}

/** null when the request may touch the host, otherwise the 403 to send. */
export function denyHostAccess(req: Request, server: Server<unknown>, policy: HostAccessPolicy): Response | null {
  const reason = hostAccessProblem(req, server, policy);
  return reason === null ? null : Response.json({ status: "permission_denied", error: reason }, { status: 403 });
}

export function hostAccessProblem(req: Request, server: Server<unknown>, policy: HostAccessPolicy): string | null {
  if (!policy.enabled) return "host access is disabled for this WebOS server (hostAccess: false)";
  if (!isLoopbackHost(server.hostname ?? ""))
    return `host access needs a loopback listener (listening on ${server.hostname})`;
  const peer = server.requestIP(req)?.address;
  if (peer !== undefined && !isLoopbackHost(peer)) return `host access is refused to the non-loopback peer ${peer}`;
  if (req.headers.get("sec-fetch-site") === "cross-site") return "cross-site request refused";
  const origin = req.headers.get("origin");
  if (origin !== null && origin !== new URL(req.url).origin) return `origin ${origin} is not this WebOS`;
  return null;
}
