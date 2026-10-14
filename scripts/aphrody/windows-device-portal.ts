type ProbeResult = {
  ok: boolean;
  status?: number;
  elapsedMs: number;
  data?: unknown;
  error?: string;
};

export type DevicePortalReport = {
  target: { origin: string; host: string; port: number; addresses: string[] };
  transport: {
    tcp: { ok: boolean; elapsedMs: number; error?: string };
    http: { ok: boolean; status?: number; server?: string; elapsedMs: number; error?: string };
    http3: { advertised: boolean; altSvc: string | null };
  };
  portal: {
    os: ProbeResult;
    deviceFamily: ProbeResult;
    networking: ProbeResult;
    packages: ProbeResult;
    processes: ProbeResult;
    devices: ProbeResult;
  };
  runtime: {
    windows?: unknown;
    winrt?: unknown;
    dotnet?: unknown;
  };
  summary: {
    adapters: number;
    installedPackages: number;
    processes: number;
    devices: number;
  };
};

const endpoints = {
  os: "/api/os/info",
  deviceFamily: "/api/os/devicefamily",
  networking: "/api/networking/ipconfig",
  packages: "/api/app/packagemanager/packages?includeframeworkpackages=false",
  processes: "/api/resourcemanager/processes",
  devices: "/api/devicemanager/devices",
} as const;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function probeJson(origin: string, path: string, timeoutMs: number): Promise<ProbeResult> {
  const started = performance.now();
  try {
    const response = await fetch(new URL(path, origin), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = response.headers.get("content-type")?.includes("json") ? await response.json() : await response.text();
    return { ok: response.ok, status: response.status, elapsedMs: performance.now() - started, data };
  } catch (error) {
    return { ok: false, elapsedMs: performance.now() - started, error: errorText(error) };
  }
}

async function probeTcp(hostname: string, port: number, timeoutMs: number) {
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        void Bun.connect({
          hostname,
          port,
          socket: {
            open(socket) {
              socket.end();
              resolve();
            },
            data() {},
            error(_socket, error) {
              reject(error);
            },
            connectError(_socket, error) {
              reject(error);
            },
          },
        }).catch(reject);
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`TCP timeout after ${timeoutMs} ms`)), timeoutMs);
      }),
    ]);
    return { ok: true, elapsedMs: performance.now() - started };
  } catch (error) {
    return { ok: false, elapsedMs: performance.now() - started, error: errorText(error) };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function runtimeDetails() {
  if (process.platform !== "win32") return {};
  const details: DevicePortalReport["runtime"] = {};
  try {
    const windows = (await import("bun:windows")).default;
    details.windows = {
      version: windows.version(),
      system: windows.systemInfo(),
      elevated: windows.isElevated(),
    };
  } catch (error) {
    details.windows = { error: errorText(error) };
  }
  try {
    const winrt = (await import("bun:winrt")).default;
    const connectivity = winrt.namespace("Windows.Networking.Connectivity");
    const profile = connectivity.NetworkInformation.GetInternetConnectionProfile();
    details.winrt = profile
      ? { profile: profile.ProfileName, connectivityLevel: profile.GetNetworkConnectivityLevel() }
      : { profile: null, connectivityLevel: 0 };
  } catch (error) {
    details.winrt = { error: errorText(error) };
  }
  try {
    const dotnet = (await import("bun:dotnet")).default;
    const info = dotnet.info();
    details.dotnet = {
      hostArch: info.hostArch,
      installs: info.installs?.length ?? 0,
      sdk: info.sdk?.version ?? null,
      netFramework: info.netFramework?.length ?? 0,
    };
  } catch (error) {
    details.dotnet = { error: errorText(error) };
  }
  return details;
}

function arrayCount(probe: ProbeResult, key: string): number {
  if (!probe.ok || probe.data === null || typeof probe.data !== "object") return 0;
  const value = Reflect.get(probe.data, key);
  return Array.isArray(value) ? value.length : 0;
}

export async function inspectDevicePortal(
  input = "http://localhost:50080",
  timeoutMs = 5_000,
): Promise<DevicePortalReport> {
  const url = new URL(input);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new TypeError("Device Portal URL must use HTTP or HTTPS");
  const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
  const origin = url.origin;
  const [addresses, tcp, root, portalEntries, runtime] = await Promise.all([
    Bun.dns
      .lookup(url.hostname, { backend: "system" })
      .then(results => [...new Set(results.map(result => result.address))]),
    probeTcp(url.hostname, port, timeoutMs),
    probeJson(origin, "/", timeoutMs),
    Promise.all(
      Object.entries(endpoints).map(async ([name, path]) => [name, await probeJson(origin, path, timeoutMs)] as const),
    ),
    runtimeDetails(),
  ]);
  const portal = Object.fromEntries(portalEntries) as DevicePortalReport["portal"];
  const rootHeaders = await fetch(origin, { method: "HEAD", signal: AbortSignal.timeout(timeoutMs) }).catch(() => null);
  const altSvc = rootHeaders?.headers.get("alt-svc") ?? null;
  return {
    target: { origin, host: url.hostname, port, addresses },
    transport: {
      tcp,
      http: {
        ok: root.ok,
        status: root.status,
        server: rootHeaders?.headers.get("server") ?? undefined,
        elapsedMs: root.elapsedMs,
        error: root.error,
      },
      http3: { advertised: /(?:^|[, ])h3(?:-|=)/i.test(altSvc ?? ""), altSvc },
    },
    portal,
    runtime,
    summary: {
      adapters: arrayCount(portal.networking, "Adapters"),
      installedPackages: arrayCount(portal.packages, "InstalledPackages"),
      processes: arrayCount(portal.processes, "Processes"),
      devices: arrayCount(portal.devices, "DeviceList"),
    },
  };
}

if (import.meta.main) {
  const json = process.argv.includes("--json");
  const target = process.argv.find(argument => /^https?:\/\//.test(argument)) ?? "http://localhost:50080";
  const report = await inspectDevicePortal(target);
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Windows Device Portal ${report.target.origin}`);
    console.log(`DNS ${report.target.addresses.join(", ")} | TCP ${report.transport.tcp.ok ? "ok" : "failed"}`);
    console.log(
      `HTTP ${report.transport.http.status ?? "failed"} ${report.transport.http.server ?? ""} | HTTP/3 ${report.transport.http3.advertised ? "advertised" : "not advertised"}`,
    );
    console.log(
      `Apps ${report.summary.installedPackages} | Processes ${report.summary.processes} | Adapters ${report.summary.adapters} | Devices ${report.summary.devices}`,
    );
    console.log(
      `Windows ${report.runtime.windows ? "ok" : "unavailable"} | WinRT ${report.runtime.winrt ? "ok" : "unavailable"} | .NET ${report.runtime.dotnet ? "ok" : "unavailable"}`,
    );
  }
}
