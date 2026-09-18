import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Sealed values for cookies: a JSON payload with an expiry, signed with
 * HMAC-SHA256 so the browser can hold it but not forge or alter it.
 */

export function seal(value: unknown, secret: string, timeToLiveMs: number): string {
  const payload = Buffer.from(JSON.stringify({ value, expiresAt: Date.now() + timeToLiveMs }), "utf8").toString(
    "base64url",
  );
  return `${payload}.${signature(payload, secret)}`;
}

/** The sealed value, or undefined if the token is missing, altered or expired. */
export function unseal(token: string | undefined, secret: string): unknown {
  if (!token) return undefined;
  const parts = token.split(".");
  if (parts.length !== 2) return undefined;
  const [payload, given] = parts as [string, string];
  const expected = signature(payload, secret);
  if (expected.length !== given.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(given))) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const { value, expiresAt } = parsed as { value: unknown; expiresAt: unknown };
    if (typeof expiresAt !== "number" || expiresAt < Date.now()) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
