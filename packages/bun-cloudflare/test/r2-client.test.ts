import { expect, test } from "bun:test";
import { createR2Client } from "../src/api";

test("native R2 client preserves explicitly selected temporary session credentials", () => {
  const client = createR2Client({
    bucket: "fixture-bucket",
    env: {
      R2_ENDPOINT: "https://fixture.r2.cloudflarestorage.com",
      R2_ACCESS_KEY_ID: "fixture-access",
      R2_SECRET_ACCESS_KEY: "fixture-secret",
      R2_SESSION_TOKEN: "fixture-session",
      AWS_SESSION_TOKEN: "fixture-other-session",
    },
  });
  const url = new URL(client.file("fixture.txt").presign({ method: "GET", expiresIn: 60 }));
  expect(url.searchParams.get("X-Amz-Security-Token")).toBe("fixture-session");
});
