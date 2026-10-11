// SPDX-License-Identifier: Apache-2.0

export function googleEgressPlan(localPort = 1081, remotePort = 1081) {
  for (const port of [localPort, remotePort]) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 1080)
      throw new RangeError(
        "Egress ports must be unprivileged integer TCP ports and preserve Japan port 1080",
      );
  }
  return {
    mode: "plan-only",
    provider: "existing Aphrody Mullvad WireGuard owner",
    country: "us",
    scope: "explicit Google client transport only",
    sourceOwners: [
      "aphrody infra vpn",
      "aphrody infra ssh",
      "aphrody infra boot",
      "bun ssh",
      "bun:google",
    ],
    observed: {
      host: "vps",
      existingNamespace: "mullvad",
      existingCountry: "jp",
      existingProxy: "127.0.0.1:1080",
      independentUSNamespace: "aphrody-google-us",
      independentUSProxy: "127.0.0.1:1081",
      independentUSRelay: "us-atl-wg-001",
      publicGoogleTLS: "HTTP 204, TLS verification 0 through US SOCKS and Bun SSH forward",
      observedOn: "2026-10-11",
    },
    prerequisites: [
      "Recheck the protected existing WireGuard credential without reading or logging its value",
      "Recheck the independent US namespace through the existing VPN owner; preserve the Japan namespace",
      "Verify US egress inside that namespace and unchanged host default route and SSH reachability",
      `Publish only 127.0.0.1:${remotePort} and authorize that exact SSH PermitOpen endpoint`,
      "Qualify the Google fetch-injection transport through that proxy before passing OAuth credentials",
    ],
    tunnelCommand: [
      "bun",
      "ssh",
      "forward",
      "--system",
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      "ExitOnForwardFailure=yes",
      "-L",
      `127.0.0.1:${localPort}:127.0.0.1:${remotePort}`,
      "vps",
    ],
    proxyURL: `socks5h://127.0.0.1:${localPort}`,
    integration:
      "Inject a qualified scoped transport through bun:google createClient({ credentialProvider, fetch }); do not set global proxy environment variables",
    qualification: {
      observedOn: "2026-10-11",
      usNamespace: "qualified US exit; independent remote units enabled",
      sshForward: "qualified native owner scheduled task; user Limited, hidden, loopback only",
      googleTransport: "pending",
      authenticatedGoogle: "pending",
      liveRecheck: "This plan performs no network probe; recheck before using credentials",
    },
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length && args[0] !== "--plan")
    throw new Error("This adapter only supports --plan; it performs no host or account changes");
  if (args.length > 3) throw new Error("Usage: google-egress.ts --plan [local-port] [remote-port]");
  const plan = googleEgressPlan(
    args[1] === undefined ? undefined : Number(args[1]),
    args[2] === undefined ? undefined : Number(args[2]),
  );
  console.log(JSON.stringify(plan, null, 2));
}
