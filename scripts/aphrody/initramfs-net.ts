// Minimal IPv4 networking for the Bun PID 1 of scripts/aphrody/initramfs.ts:
// loopback and one interface up through rtnetlink (bun:linux netlink), a static
// address or a DHCP lease (DISCOVER, OFFER, REQUEST, ACK over node:dgram), the
// default route, /etc/resolv.conf and /etc/hosts.
//
// The builder copies this file next to /init as /initramfs-net.ts. Nothing here
// imports bun:linux: the caller passes the module, so the encoders are testable
// on any platform.
//
//   /etc/bun-init.json  "network": { "interface": "eth0", "address": "10.0.2.15/24", "gateway": "10.0.2.2",
//                                    "dns": ["10.0.2.3"] }    (no "address": DHCP)

import { createSocket } from "node:dgram";
import { readFileSync, writeFileSync } from "node:fs";

export interface NetworkConfig {
  interface?: string;
  address?: string;
  gateway?: string;
  dns?: string[];
  /** Seconds to wait for a DHCP lease; 0 skips DHCP. */
  dhcpTimeout?: number;
}

export interface Lease {
  address: string;
  prefix: number;
  gateway?: string;
  dns: string[];
  server?: string;
  leaseSeconds?: number;
}

/** The subset of bun:linux this module uses. */
export interface Netlink {
  constants: Record<string, number>;
  netlink: {
    encode(options: { type: number; flags?: number; payload?: Uint8Array }): Uint8Array;
    request(protocol: number, message: Uint8Array): unknown[];
  };
}

const AF_INET = 2;
const IFF_UP = 1;
const NLM_F_REQUEST = 1;
const NLM_F_ACK = 4;
const NLM_F_EXCL = 0x200;
const NLM_F_CREATE = 0x400;
const RTM_NEWLINK = 16;
const RTM_NEWADDR = 20;
const RTM_NEWROUTE = 24;
const IFA_ADDRESS = 1;
const IFA_LOCAL = 2;
const IFA_BROADCAST = 4;
const RTA_OIF = 4;
const RTA_GATEWAY = 5;
const RT_TABLE_MAIN = 254;
const RTPROT_BOOT = 3;
const RT_SCOPE_UNIVERSE = 0;
const RTN_UNICAST = 1;

export function parseIPv4(text: string): Uint8Array {
  const parts = text.split(".");
  const bytes = parts.map(Number);
  if (parts.length !== 4 || bytes.some((b, i) => !/^\d{1,3}$/.test(parts[i]) || b > 255)) {
    throw new Error(`invalid IPv4 address: ${text}`);
  }
  return Uint8Array.from(bytes);
}

export function formatIPv4(bytes: Uint8Array): string {
  return Array.from(bytes.subarray(0, 4)).join(".");
}

export function parseCidr(text: string): { address: Uint8Array; prefix: number } {
  const [address, prefix = "32"] = text.split("/");
  const length = Number(prefix);
  if (!/^\d{1,2}$/.test(prefix) || length > 32) throw new Error(`invalid prefix length: ${text}`);
  return { address: parseIPv4(address), prefix: length };
}

export function prefixFromMask(mask: Uint8Array): number {
  let prefix = 0;
  for (const byte of mask) for (let bit = 7; bit >= 0; bit--) prefix += (byte >> bit) & 1;
  return prefix;
}

function broadcastOf(address: Uint8Array, prefix: number): Uint8Array {
  const value = new DataView(address.buffer, address.byteOffset, 4).getUint32(0);
  const host = prefix === 0 ? 0xffffffff : prefix === 32 ? 0 : 0xffffffff >>> prefix;
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, (value | host) >>> 0);
  return out;
}

function attr(type: number, data: Uint8Array): Uint8Array {
  const length = 4 + data.length;
  const out = new Uint8Array((length + 3) & ~3);
  const view = new DataView(out.buffer);
  view.setUint16(0, length, true);
  view.setUint16(2, type, true);
  out.set(data, 4);
  return out;
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** RTM_NEWLINK payload (struct ifinfomsg) that sets IFF_UP on `index`. */
export function linkUpPayload(index: number): Uint8Array {
  const out = new Uint8Array(16);
  const view = new DataView(out.buffer);
  view.setInt32(4, index, true);
  view.setUint32(8, IFF_UP, true);
  view.setUint32(12, IFF_UP, true);
  return out;
}

/** RTM_NEWADDR payload (struct ifaddrmsg + IFA_LOCAL, IFA_ADDRESS, IFA_BROADCAST). */
export function addressPayload(index: number, address: Uint8Array, prefix: number): Uint8Array {
  const header = new Uint8Array(8);
  const view = new DataView(header.buffer);
  header[0] = AF_INET;
  header[1] = prefix;
  header[3] = RT_SCOPE_UNIVERSE;
  view.setUint32(4, index, true);
  return concat(
    header,
    attr(IFA_LOCAL, address),
    attr(IFA_ADDRESS, address),
    attr(IFA_BROADCAST, broadcastOf(address, prefix)),
  );
}

/** RTM_NEWROUTE payload (struct rtmsg) for 0.0.0.0/0, through `gateway` or on-link. */
export function defaultRoutePayload(index: number, gateway?: Uint8Array): Uint8Array {
  const header = new Uint8Array(12);
  header[0] = AF_INET;
  header[4] = RT_TABLE_MAIN;
  header[5] = RTPROT_BOOT;
  header[6] = gateway ? RT_SCOPE_UNIVERSE : 253; // RT_SCOPE_LINK
  header[7] = RTN_UNICAST;
  return gateway
    ? concat(header, attr(RTA_OIF, u32(index)), attr(RTA_GATEWAY, gateway))
    : concat(header, attr(RTA_OIF, u32(index)));
}

function request(linux: Netlink, type: number, flags: number, payload: Uint8Array, tolerateExisting = false) {
  try {
    linux.netlink.request(
      linux.constants.NETLINK_ROUTE,
      linux.netlink.encode({ type, flags: NLM_F_REQUEST | NLM_F_ACK | flags, payload }),
    );
  } catch (error) {
    if (!tolerateExisting || (error as { code?: string }).code !== "EEXIST") throw error;
  }
}

export function setLinkUp(linux: Netlink, index: number) {
  request(linux, RTM_NEWLINK, 0, linkUpPayload(index));
}

export function addAddress(linux: Netlink, index: number, address: Uint8Array, prefix: number) {
  request(linux, RTM_NEWADDR, NLM_F_CREATE | NLM_F_EXCL, addressPayload(index, address, prefix), true);
}

export function addDefaultRoute(linux: Netlink, index: number, gateway?: Uint8Array) {
  request(linux, RTM_NEWROUTE, NLM_F_CREATE | NLM_F_EXCL, defaultRoutePayload(index, gateway), true);
}

function deleteDefaultRoute(linux: Netlink, index: number) {
  const RTM_DELROUTE = 25;
  try {
    request(linux, RTM_DELROUTE, 0, defaultRoutePayload(index));
  } catch {}
}

// DHCP (RFC 2131): the fixed BOOTP header is 236 bytes, then the magic cookie
// and the options.

export const DHCP = { DISCOVER: 1, OFFER: 2, REQUEST: 3, DECLINE: 4, ACK: 5, NAK: 6 } as const;
const MAGIC = 0x63825363;

export function encodeDhcp(options: {
  type: number;
  xid: number;
  mac: Uint8Array;
  requested?: Uint8Array;
  server?: Uint8Array;
  hostname?: string;
}): Uint8Array {
  const out = new Uint8Array(300);
  const view = new DataView(out.buffer);
  out[0] = 1; // BOOTREQUEST
  out[1] = 1; // Ethernet
  out[2] = 6;
  view.setUint32(4, options.xid);
  view.setUint16(10, 0x8000); // broadcast: the client has no address yet
  out.set(options.mac.subarray(0, 6), 28);
  view.setUint32(236, MAGIC);
  let at = 240;
  const option = (code: number, data: Uint8Array) => {
    out[at++] = code;
    out[at++] = data.length;
    out.set(data, at);
    at += data.length;
  };
  option(53, Uint8Array.of(options.type));
  option(61, concat(Uint8Array.of(1), options.mac.subarray(0, 6)));
  if (options.requested) option(50, options.requested);
  if (options.server) option(54, options.server);
  if (options.hostname) option(12, new TextEncoder().encode(options.hostname.slice(0, 63)));
  option(55, Uint8Array.of(1, 3, 6, 51, 54));
  out[at] = 255;
  return out;
}

export interface DhcpReply {
  type: number;
  xid: number;
  address: string;
  mask?: string;
  router?: string;
  dns: string[];
  server?: string;
  leaseSeconds?: number;
}

export function parseDhcp(packet: Uint8Array): DhcpReply | undefined {
  if (packet.length < 240 || packet[0] !== 2) return undefined;
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  if (view.getUint32(236) !== MAGIC) return undefined;
  const reply: DhcpReply = {
    type: 0,
    xid: view.getUint32(4),
    address: formatIPv4(packet.subarray(16, 20)),
    dns: [],
  };
  for (let at = 240; at < packet.length; ) {
    const code = packet[at++];
    if (code === 0) continue;
    if (code === 255 || at >= packet.length) break;
    const length = packet[at++];
    const data = packet.subarray(at, at + length);
    at += length;
    if (code === 53) reply.type = data[0];
    else if (code === 1 && length >= 4) reply.mask = formatIPv4(data);
    else if (code === 3 && length >= 4) reply.router = formatIPv4(data);
    else if (code === 6) for (let i = 0; i + 4 <= length; i += 4) reply.dns.push(formatIPv4(data.subarray(i, i + 4)));
    else if (code === 54 && length >= 4) reply.server = formatIPv4(data);
    else if (code === 51 && length >= 4)
      reply.leaseSeconds = new DataView(data.buffer, data.byteOffset, 4).getUint32(0);
  }
  return reply.type ? reply : undefined;
}

/** Runs DISCOVER/OFFER/REQUEST/ACK on UDP 68; needs a route to 255.255.255.255. */
export async function dhcpLease(mac: Uint8Array, timeoutSeconds: number, hostname?: string): Promise<Lease> {
  const socket = createSocket({ type: "udp4", reuseAddr: true });
  const xid = (Math.random() * 0x100000000) >>> 0;
  const replies: DhcpReply[] = [];
  let wake: (() => void) | undefined;
  socket.on("message", (message: Buffer) => {
    const reply = parseDhcp(new Uint8Array(message.buffer, message.byteOffset, message.byteLength));
    if (reply?.xid === xid) {
      replies.push(reply);
      wake?.();
    }
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(68, "0.0.0.0", () => {
      socket.setBroadcast(true);
      resolve();
    });
  });
  const deadline = Date.now() + timeoutSeconds * 1000;
  const send = (packet: Uint8Array) => socket.send(packet, 67, "255.255.255.255");
  const next = async (type: number, packet: Uint8Array): Promise<DhcpReply | undefined> => {
    // Resend every 2 s until a reply of `type` (or a NAK) arrives.
    while (Date.now() < deadline) {
      send(packet);
      const until = Math.min(deadline, Date.now() + 2000);
      while (Date.now() < until) {
        const found = replies.find(r => r.type === type || r.type === DHCP.NAK);
        if (found) {
          replies.length = 0;
          return found;
        }
        await new Promise<void>(resolve => {
          wake = resolve;
          setTimeout(resolve, until - Date.now()).unref?.();
        });
      }
    }
    return undefined;
  };
  try {
    const offer = await next(DHCP.OFFER, encodeDhcp({ type: DHCP.DISCOVER, xid, mac, hostname }));
    if (!offer || offer.type !== DHCP.OFFER) throw new Error("no DHCP offer");
    const ack = await next(
      DHCP.ACK,
      encodeDhcp({
        type: DHCP.REQUEST,
        xid,
        mac,
        hostname,
        requested: parseIPv4(offer.address),
        server: offer.server ? parseIPv4(offer.server) : undefined,
      }),
    );
    if (!ack || ack.type !== DHCP.ACK) throw new Error(ack ? "DHCP NAK" : "no DHCP ack");
    return {
      address: ack.address,
      prefix: ack.mask ? prefixFromMask(parseIPv4(ack.mask)) : 24,
      gateway: ack.router,
      dns: ack.dns,
      server: ack.server,
      leaseSeconds: ack.leaseSeconds,
    };
  } finally {
    socket.close();
  }
}

export function resolvConf(dns: string[]): string {
  return dns.map(server => `nameserver ${server}\n`).join("");
}

export function hostsFile(hostname?: string): string {
  return `127.0.0.1\tlocalhost${hostname ? ` ${hostname}` : ""}\n::1\tlocalhost\n`;
}

function sysfs(name: string, file: string): string {
  return readFileSync(`/sys/class/net/${name}/${file}`, "utf8").trim();
}

/** Brings up lo and `config.interface`, then configures it; returns the lease or static address. */
export async function configureNetwork(linux: Netlink, config: NetworkConfig, hostname?: string): Promise<Lease> {
  writeFileSync("/etc/hosts", hostsFile(hostname));
  setLinkUp(linux, Number(sysfs("lo", "ifindex")));
  addAddress(linux, Number(sysfs("lo", "ifindex")), Uint8Array.of(127, 0, 0, 1), 8);

  const name = config.interface ?? "eth0";
  const index = Number(sysfs(name, "ifindex"));
  setLinkUp(linux, index);

  let lease: Lease;
  if (config.address) {
    const { address, prefix } = parseCidr(config.address);
    lease = {
      address: formatIPv4(address),
      prefix,
      gateway: config.gateway,
      dns: config.dns ?? [],
    };
  } else {
    const mac = Uint8Array.from(sysfs(name, "address").split(":"), byte => parseInt(byte, 16));
    // Without an address the kernel has no route for 255.255.255.255: an
    // on-link default route carries the DHCP broadcasts until the lease is set.
    addDefaultRoute(linux, index);
    try {
      lease = await dhcpLease(mac, config.dhcpTimeout ?? 30, hostname);
    } finally {
      deleteDefaultRoute(linux, index);
    }
    if (config.gateway) lease.gateway = config.gateway;
    if (config.dns) lease.dns = config.dns;
  }
  addAddress(linux, index, parseIPv4(lease.address), lease.prefix);
  if (lease.gateway) addDefaultRoute(linux, index, parseIPv4(lease.gateway));
  if (lease.dns.length) writeFileSync("/etc/resolv.conf", resolvConf(lease.dns));
  return lease;
}
