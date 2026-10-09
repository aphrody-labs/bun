// SPDX-License-Identifier: Apache-2.0
/** The WebOS home as the page (or a page worker) sees it: the server's /api/os/vfs routes. */

export interface Vfs {
  exists(path: string): Promise<boolean>;
  size(path: string): Promise<number>;
  read(path: string): Promise<Uint8Array>;
  write(path: string, data: Uint8Array): Promise<void>;
}

const q = (path: string) => `?path=${encodeURIComponent(path)}`;

export const serverVfs: Vfs = {
  async exists(path) {
    return (await fetch(`/api/os/vfs/read${q(path)}`)).ok;
  },
  async size(path) {
    const res = await fetch(`/api/os/vfs/read${q(path)}`);
    if (!res.ok) throw new Error(`${path}: ${(await res.json()).error ?? res.status}`);
    return (await res.json()).size;
  },
  async read(path) {
    const res = await fetch(`/api/os/vfs/raw${q(path)}`);
    if (!res.ok) throw new Error(`${path}: ${(await res.json()).error ?? res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  },
  async write(path, data) {
    const res = await fetch("/api/os/vfs/write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, text: new TextDecoder().decode(data) }),
    });
    if (!res.ok) throw new Error(`${path}: ${(await res.json()).error ?? res.status}`);
  },
};
