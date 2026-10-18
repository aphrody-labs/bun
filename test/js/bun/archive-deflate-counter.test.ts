import { expect, test } from "bun:test";

test("ZIP deflate blocks count output independently after caller resets z_stream totals", async () => {
  // Produced by Windows .NET System.IO.Compression.ZipArchive, not Bun's ZIP
  // writer. One entry contains 300000 ASCII 'A' bytes and crosses libarchive's
  // 256 KiB inflate buffer boundary. Local and central directory sizes agree.
  const zip = Buffer.from(
    "UEsDBBQAAAAIAAAAIVB7OuNWNQEAAOCTBAAPAAAAbXVsdGktYmxvY2sudHh07cEBDQAAAMKgbO9fyh4OKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA6MYAUEsBAhQAFAAAAAgAAAAhUHs641Y1AQAA4JMEAA8AAAAAAAAAAAAAAAAAAAAAAG11bHRpLWJsb2NrLnR4dFBLBQYAAAAAAQABAD0AAABiAQAAAAA=",
    "base64",
  );
  const entries = await new Bun.Archive(zip).files();
  expect([...entries.keys()]).toEqual(["multi-block.txt"]);
  const file = entries.get("multi-block.txt")!;
  expect(file.size).toBe(300000);
  expect(await file.text()).toBe("A".repeat(300000));
});
