import { opaque, privacyPass, randomness, star } from "bun:privacy";
import { describe, expect, test } from "bun:test";

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("star", () => {
  const options = { threshold: 2, epoch: "t" };

  test("STARLite tag and ciphertext are deterministic per measurement", () => {
    const a = star.parse(star.encode("hello world", options).message);
    const b = star.parse(star.encode("hello world", options).message);
    const other = star.parse(star.encode("hello there", options).message);
    expect(hex(a.tag)).toBe(hex(b.tag));
    expect(hex(a.ciphertext)).toBe(hex(b.ciphertext));
    expect(hex(a.share)).not.toBe(hex(b.share));
    expect(hex(other.tag)).not.toBe(hex(a.tag));
    expect(a.tag.byteLength).toBe(32);
  });

  test("recovers the measurement and aux at the threshold", () => {
    const messages = [
      star.encode("hello world", { ...options, aux: "a" }).message,
      star.encode("hello world", { ...options, aux: "b" }).message,
      star.encode("hello world", options).message,
    ];
    const { measurement, aux } = star.recover(messages, options);
    expect({ measurement: text(measurement), aux: aux.map(text) }).toEqual({
      measurement: "hello world",
      aux: ["a", "b", ""],
    });
  });

  test("below the threshold or with mixed tags, recovery fails", () => {
    const one = star.encode("hello world", options).message;
    expect(() => star.recover([one], options)).toThrow("threshold");
    const other = star.encode("hello there", options).message;
    expect(() => star.recover([one, other], options)).toThrow("different tags");
    expect(() => star.encode("x", { threshold: 1, epoch: "t" })).toThrow();
  });

  test("explicit randomness decides the tag", () => {
    const r = new Uint8Array(32).fill(7);
    const a = star.encode("x", { ...options, randomness: r });
    const b = star.encode("y", { ...options, randomness: r });
    expect(hex(a.tag)).toBe(hex(b.tag));
    expect(() => star.encode("x", { ...options, randomness: new Uint8Array(31) })).toThrow("32 bytes");
  });
});

describe("randomness", () => {
  test("blind rejects nothing and unblind rejects invalid points", () => {
    const { blinded, blind } = randomness.blind("hello world");
    expect(blinded.byteLength).toBe(32);
    expect(blind.byteLength).toBe(32);
    expect(() => randomness.unblind(new Uint8Array(32).fill(0xff), blind)).toThrow("Ristretto255");
    expect(() => randomness.finalize("x", 256, blinded)).toThrow();
  });
});

describe("privacyPass", () => {
  test("issue, unblind, redeem and verify", () => {
    const key = privacyPass.createSigningKey();
    const publicKey = privacyPass.publicKey(key);
    const tokens = privacyPass.createTokens(3);
    expect(tokens.map(t => t.byteLength)).toEqual([96, 96, 96]);
    const blinded = privacyPass.blind(tokens);
    const { signed, proof } = privacyPass.sign(key, blinded);
    expect(proof.byteLength).toBe(64);
    const unblinded = privacyPass.unblind({ tokens, blinded, signed, proof, publicKey });
    expect(unblinded).toHaveLength(3);

    const redemption = privacyPass.redeem(unblinded[1], "GET /resource");
    expect(privacyPass.verify(key, redemption, "GET /resource")).toBe(true);
    expect(privacyPass.verify(key, redemption, "GET /other")).toBe(false);
    expect(privacyPass.verify(privacyPass.createSigningKey(), redemption, "GET /resource")).toBe(false);
  });

  test("a proof from another key is rejected", () => {
    const tokens = privacyPass.createTokens(1);
    const blinded = privacyPass.blind(tokens);
    const { signed, proof } = privacyPass.sign(privacyPass.createSigningKey(), blinded);
    const publicKey = privacyPass.publicKey(privacyPass.createSigningKey());
    expect(() => privacyPass.unblind({ tokens, blinded, signed, proof, publicKey })).toThrow();
  });
});

describe("opaque", () => {
  test("registration and login agree on the session key", () => {
    const setup = opaque.createServerSetup();
    const reg = opaque.clientRegistrationStart("hunter2");
    const response = opaque.serverRegistrationStart(setup, reg.request, "alice");
    const finished = opaque.clientRegistrationFinish(reg.state, "hunter2", response);
    const file = opaque.serverRegistrationFinish(finished.upload);

    const login = (password: string, passwordFile: Uint8Array | null) => {
      const client = opaque.clientLoginStart(password);
      const server = opaque.serverLoginStart(setup, passwordFile, client.request, "alice");
      const done = opaque.clientLoginFinish(client.state, password, server.response);
      return { done, serverKey: opaque.serverLoginFinish(server.state, done.finalization) };
    };

    const { done, serverKey } = login("hunter2", file);
    expect(hex(done.sessionKey)).toBe(hex(serverKey));
    expect(hex(done.exportKey)).toBe(hex(finished.exportKey));
    expect(hex(done.serverPublicKey)).toBe(hex(finished.serverPublicKey));

    expect(() => login("wrong", file)).toThrow(expect.objectContaining({ code: "ERR_OPAQUE_INVALID_LOGIN" }));
    expect(() => login("hunter2", null)).toThrow(expect.objectContaining({ code: "ERR_OPAQUE_INVALID_LOGIN" }));
  });
});
