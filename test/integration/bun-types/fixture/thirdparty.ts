import dotenv, { config, populate } from "dotenv";
import { pack, unpack } from "erlpack";
import picocolors, { createColors, red } from "picocolors";
import invariant from "tiny-invariant";
import zlibSync, { Inflate, Z_SYNC_FLUSH } from "zlib-sync";
import * as tsd from "./utilities";

tsd.expectType<Record<string, string>>(dotenv.parse(Buffer.from("A=1")));
tsd.expectType<Record<string, string>>(populate({}, { A: "1" }, { override: true }));
tsd.expectType<Error | undefined>(config({ path: ["one.env", new URL("file:///two.env")] }).error);
tsd.expectType<Buffer>(pack({ a: 1 }));
tsd.expectType<unknown>(unpack(new Uint8Array([131, 106])));
tsd.expectType<string>(red(42));
tsd.expectType<string>(createColors(false).bold(undefined));
tsd.expectType<boolean>(picocolors.isColorSupported);
const inflate = new Inflate({ chunkSize: 65535, to: "string" });
tsd.expectType<void>(inflate.push(Buffer.alloc(8), Z_SYNC_FLUSH));
tsd.expectType<Buffer | string | null>(inflate.result);
tsd.expectType<number>(zlibSync.Z_DATA_ERROR);

function narrowed(value: string | null) {
  invariant(value, () => "Expected a string");
  tsd.expectType<string>(value);
}
void narrowed;

// @ts-expect-error Erlang input must be bytes.
unpack("invalid");
// @ts-expect-error Inflate accepts an ArrayBuffer view, not arbitrary text.
inflate.push("invalid");
