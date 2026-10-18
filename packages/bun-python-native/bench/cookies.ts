// Load browser-exported cookies (bench/.cookies.json, git-ignored) into a Bun cookie jar.
type Exported = { name: string; value: string; domain: string; path: string; secure: boolean; httpOnly: boolean; sameSite: string | null; expirationDate?: number; session?: boolean };

export async function loadCookies(file = import.meta.dir + "/.cookies.json"): Promise<Bun.CookieMap> {
  const list = (await Bun.file(file).json()) as Exported[];
  const jar = new Bun.CookieMap();
  for (const c of list) {
    jar.set({
      name: c.name,
      value: c.value,
      domain: c.domain.replace(/^\./, ""),
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite === "no_restriction" ? "none" : (c.sameSite ?? undefined) as "lax" | "strict" | "none" | undefined,
      expires: c.session || !c.expirationDate ? undefined : new Date(c.expirationDate * 1000),
    });
  }
  return jar;
}

if (import.meta.main) {
  const jar = await loadCookies();
  console.log("cookies loaded:", jar.size, [...jar.keys()].join(", "));
}
