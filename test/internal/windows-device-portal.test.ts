import { expect, test } from "bun:test";
import { inspectDevicePortal } from "../../scripts/aphrody/windows-device-portal";

test("inspects Device Portal networking and Apps Manager endpoints", async () => {
  using server = Bun.serve({
    port: 0,
    routes: {
      "/": new Response("<title>Windows Device Portal</title>", {
        headers: { server: "Microsoft-HTTPAPI/2.0", "alt-svc": 'h3=":443"' },
      }),
      "/api/os/info": Response.json({ Platform: "Win32NT" }),
      "/api/os/devicefamily": Response.json({ DeviceType: "Windows.Desktop" }),
      "/api/networking/ipconfig": Response.json({ Adapters: [{ Name: "Ethernet" }] }),
      "/api/app/packagemanager/packages": Response.json({ InstalledPackages: [{ Name: "App" }, { Name: "App2" }] }),
      "/api/resourcemanager/processes": Response.json({ Processes: [{ ProcessId: 1 }] }),
      "/api/devicemanager/devices": Response.json({ DeviceList: [{ ID: "root" }] }),
    },
    fetch() {
      return new Response("not found", { status: 404 });
    },
  });

  const report = await inspectDevicePortal(server.url.origin);
  expect(report.target.addresses.length).toBeGreaterThan(0);
  expect(report.transport.tcp.ok).toBe(true);
  expect(report.transport.http).toMatchObject({ ok: true, status: 200, server: "Microsoft-HTTPAPI/2.0" });
  expect(report.transport.http3).toEqual({ advertised: true, altSvc: 'h3=":443"' });
  expect(report.summary).toEqual({ adapters: 1, installedPackages: 2, processes: 1, devices: 1 });
});

test("rejects non-HTTP targets", async () => {
  expect(inspectDevicePortal("file:///C:/Windows")).rejects.toThrow("must use HTTP or HTTPS");
});
