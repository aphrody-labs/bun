// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { CRUNCHYROLL_WATCH_URL, planChromeSiteApp } from "./crunchyroll-app";

const profile = {
  pid: 123,
  executable: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  userDataDir: "C:/Users/fixture/AppData/Local/Google/Chrome/User Data",
  profileDirectory: "Profile 1",
};

test("site app uses the official page and exact existing Chrome profile", () => {
  const plan = planChromeSiteApp(profile);
  expect(plan.command).toEqual([
    profile.executable,
    `--user-data-dir=${profile.userDataDir}`,
    "--profile-directory=Profile 1",
    `--app=${CRUNCHYROLL_WATCH_URL}`,
  ]);
  expect(plan.mode).toBe("chrome-site-app");
  expect(plan.installedPwaValidated).toBe(false);
  expect(plan.offlinePlayback).toBe(false);
});

test("invalid profile paths are rejected before any process launch", () => {
  expect(() => planChromeSiteApp({ ...profile, profileDirectory: "../another-profile" })).toThrow(
    "single directory",
  );
  expect(() => planChromeSiteApp({ ...profile, profileDirectory: ".." })).toThrow(
    "single directory",
  );
  expect(() => planChromeSiteApp({ ...profile, executable: "chrome.exe" })).toThrow(
    "absolute paths",
  );
});
