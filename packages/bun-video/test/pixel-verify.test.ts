import { expect, test } from "bun:test";
import { compareRGBAFrames } from "../src/pixel-verify";
test("pixel comparison detects channel and alpha differences with exact default", () => {
  const reference = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128]);
  expect(compareRGBAFrames(reference, reference, { width: 2, height: 1 })).toMatchObject({
    passed: true,
    exact: true,
    differingPixels: 0,
    maxChannelError: 0,
  });
  const candidate = reference.slice();
  candidate[7] = 127;
  expect(compareRGBAFrames(reference, candidate, { width: 2, height: 1 })).toMatchObject({
    passed: false,
    exact: false,
    differingPixels: 1,
    differingPixelRatio: 0.5,
    maxChannelError: 1,
  });
  expect(compareRGBAFrames(reference, candidate, { width: 2, height: 1, channelTolerance: 1 })).toMatchObject({
    passed: true,
    exact: false,
  });
});
test("comparison rejects ambiguous sizes and invalid tolerances", () => {
  expect(() => compareRGBAFrames(new Uint8Array(4), new Uint8Array(3), { width: 1, height: 1 })).toThrow("lengths");
  expect(() =>
    compareRGBAFrames(new Uint8Array(4), new Uint8Array(4), { width: 1, height: 1, maxDifferingPixelRatio: NaN }),
  ).toThrow("tolerance");
});
