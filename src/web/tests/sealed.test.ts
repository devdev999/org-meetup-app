import { afterEach, expect, test, vi } from "vitest";
import { seal, unseal } from "../sealed";

const secret = "a-secret-that-is-long-enough-for-the-tests-0123456789";

afterEach(() => vi.restoreAllMocks());

test("a sealed value comes back unchanged", () => {
  const token = seal({ memberId: "m-1" }, secret, 60_000);

  expect(unseal(token, secret)).toEqual({ memberId: "m-1" });
});

test("a value sealed with another secret is rejected", () => {
  const token = seal({ memberId: "m-1" }, "another-secret-that-is-also-long-enough-9876543210", 60_000);

  expect(unseal(token, secret)).toBeUndefined();
});

test("an altered payload or signature is rejected when the original signature ends in A", () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-18T09:00:00.007Z"));
  const [payload, signature] = seal({ memberId: "m-1" }, secret, 60_000).split(".") as [string, string];
  const altered = Buffer.from(JSON.stringify({ value: { memberId: "m-2" }, expiresAt: Date.now() + 60_000 })).toString(
    "base64url",
  );

  expect(unseal(`${altered}.${signature}`, secret)).toBeUndefined();
  const alteredSignature = signature.slice(0, -1) + (signature.endsWith("A") ? "E" : "A");
  expect(unseal(`${payload}.${alteredSignature}`, secret)).toBeUndefined();
});

test("an expired value is rejected", () => {
  const token = seal({ memberId: "m-1" }, secret, -1);

  expect(unseal(token, secret)).toBeUndefined();
});

test("malformed tokens are rejected, never thrown on", () => {
  const [payload] = seal({ memberId: "m-1" }, secret, 60_000).split(".") as [string, string];
  const multiByteButSameLength = "é".repeat(43);

  expect(unseal(`${payload}.${multiByteButSameLength}`, secret)).toBeUndefined();
  expect(unseal(`${payload}.`, secret)).toBeUndefined();
  expect(unseal("no-dot-at-all", secret)).toBeUndefined();
  expect(unseal("a.b.c", secret)).toBeUndefined();
  expect(unseal(`${Buffer.from("[]").toString("base64url")}.x`, secret)).toBeUndefined();
  expect(unseal(undefined, secret)).toBeUndefined();
});
