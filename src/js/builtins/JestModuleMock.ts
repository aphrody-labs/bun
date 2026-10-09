// Jest's automock of a module's exports (`jest.mock(specifier)` without a factory): functions become mock
// functions that return undefined, keeping their own members mocked; a function's prototype methods are
// mocked too, so a mocked class can still be constructed; objects are mocked member by member; arrays become
// empty arrays; every other value is kept. A value reached twice gets the same mock.
export function createAutomock(actual: object, mockFn: (implementation?: unknown) => Function) {
  const mocks = new Map<unknown, unknown>();
  const objectPrototype = Object.prototype;
  const functionPrototype = Function.prototype;
  const skippedFunctionKeys = new Set(["length", "name", "arguments", "caller", "prototype"]);

  const ownKeys = (object: object) => {
    const keys: string[] = [];
    const seen = new Set<string>();
    for (let current = object; current && current !== objectPrototype && current !== functionPrototype; ) {
      for (const key of Object.getOwnPropertyNames(current)) {
        if (key === "constructor" || key === "__proto__" || seen.$has(key)) continue;
        seen.$add(key);
        keys.push(key);
      }
      // A module namespace or a plain object only lists its own members; a class instance or prototype also
      // lists the methods it inherits.
      const proto = Object.getPrototypeOf(current);
      if (!proto || proto === objectPrototype || $isCallable(current)) break;
      current = proto;
    }
    return keys;
  };

  const read = (object: object, key: string) => {
    try {
      return object[key];
    } catch {
      return undefined;
    }
  };

  const mockMembers = (target: object, source: object, skip?: Set<string>) => {
    for (const key of ownKeys(source)) {
      if (skip && skip.$has(key)) continue;
      try {
        target[key] = mockValue(read(source, key));
      } catch {}
    }
  };

  const mockValue = (value: unknown) => {
    if (value === null || (typeof value !== "object" && typeof value !== "function")) return value;
    if (mocks.$has(value)) return mocks.$get(value);

    if ($isCallable(value)) {
      const mock = mockFn();
      mocks.$set(value, mock);
      mockMembers(mock, value as object, skippedFunctionKeys);
      const prototype = read(value as object, "prototype");
      if (prototype && typeof prototype === "object") {
        const mockPrototype = {};
        mocks.$set(prototype, mockPrototype);
        mockMembers(mockPrototype, prototype);
        try {
          mock.prototype = mockPrototype;
        } catch {}
      }
      return mock;
    }

    if ($isArray(value)) {
      const mock = [];
      mocks.$set(value, mock);
      return mock;
    }

    if (value instanceof RegExp) return value;

    const mock = {};
    mocks.$set(value, mock);
    mockMembers(mock, value as object);
    return mock;
  };

  const result = {};
  mocks.$set(actual, result);
  mockMembers(result, actual);
  return result;
}
