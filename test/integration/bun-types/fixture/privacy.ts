import { opaque, privacyPass, randomness, star } from "bun:privacy";
import { expectTypeOf } from "bun:test";

const encoded = star.encode("m", { threshold: 2, epoch: "t", aux: new Uint8Array(1) });
expectTypeOf(encoded).toEqualTypeOf<{ message: Uint8Array; tag: Uint8Array }>();
expectTypeOf(star.recover([encoded.message], { threshold: 2, epoch: "t" }).aux).toEqualTypeOf<Uint8Array[]>();
expectTypeOf(randomness.blind("m").blind).toEqualTypeOf<Uint8Array>();
expectTypeOf(privacyPass.createTokens(2)).toEqualTypeOf<Uint8Array[]>();
expectTypeOf(privacyPass.verify(new Uint8Array(), { preimage: "", signature: "" }, "m")).toEqualTypeOf<boolean>();
expectTypeOf(opaque.serverLoginStart(new Uint8Array(), null, "", "id").state).toEqualTypeOf<Uint8Array>();
