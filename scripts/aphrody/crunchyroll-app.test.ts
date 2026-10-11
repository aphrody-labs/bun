// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  CRUNCHYROLL_WATCH_URL,
  planChromeSiteApp,
  selectActiveGoogleChromeRoot,
} from "../../packages/bun-video/labs/crunchyroll-app";
import { planChromeSiteApp as compatibilityPlan } from "./crunchyroll-app";

test("legacy app entry forwards to the canonical package launcher", () => {
  expect(compatibilityPlan).toBe(planChromeSiteApp);
});

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

test("Google Chrome selection ignores concurrent BunChromium and refuses ambiguous Google roots", () => {
  const chromium = {
    ...profile,
    pid: 456,
    executable: "C:/Program Files/BunChromium/Application/chrome.exe",
  };
  expect(selectActiveGoogleChromeRoot([chromium, profile, { ...chromium, pid: 789 }])).toBe(
    profile,
  );
  const windows = {
    ...profile,
    executable: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  };
  expect(selectActiveGoogleChromeRoot([windows, chromium])).toBe(windows);
  expect(() => selectActiveGoogleChromeRoot([profile, { ...profile, pid: 321 }, chromium])).toThrow(
    "Exactly one",
  );
  expect(() => selectActiveGoogleChromeRoot([chromium])).toThrow("Exactly one");
  expect(() => selectActiveGoogleChromeRoot([])).toThrow("Exactly one");
});
