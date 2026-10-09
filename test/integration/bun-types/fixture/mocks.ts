import { jest, mock, vi } from "bun:test";
import { expectType } from "./utilities";

const mock1 = mock((arg: string) => {
  return arg.length;
});

const arg1 = mock1("1");
expectType<number>(arg1);
mock;

type arg2 = jest.Spied<() => string>;
declare var arg2: arg2;
arg2.mock.calls[0];
mock;

// @ts-expect-error
jest.fn<() => Promise<string>>().mockReturnValue("asdf");
// @ts-expect-error
jest.fn<() => string>().mockReturnValue(24);
jest.fn<() => string>().mockReturnValue("24");

jest.fn<() => Promise<string>>().mockResolvedValue("asdf");
// @ts-expect-error
jest.fn<() => string>().mockResolvedValue(24);
// @ts-expect-error
jest.fn<() => string>().mockResolvedValue("24");

jest.fn().mockClear();
jest.fn().mockReset();
jest.fn().mockRejectedValueOnce(new Error());

jest.mock("./math");
jest.mock("./math", () => ({ add: () => 42 }));
jest.doMock("./math", () => ({}));
expectType<typeof jest>(jest.unmock("./math").dontMock("./math").resetModules());
expectType<{ add(a: number, b: number): number }>(jest.requireActual<{ add(a: number, b: number): number }>("./math"));
jest.requireMock("./math").anything;
jest.isolateModules(() => {});
expectType<Promise<void>>(jest.isolateModulesAsync(async () => {}));
declare function readFileSync(path: string): string;
jest.mocked(readFileSync).mockReturnValue("contents");
// @ts-expect-error
jest.mocked(readFileSync).mockReturnValue(1);
expectType<string>(jest.mocked({ a: "a" }).a);
vi.doMock("./math", () => ({}));
vi.unmock("./math");
vi.doUnmock("./math");
vi.resetModules();
vi.mocked(readFileSync).mockReturnValue("contents");
