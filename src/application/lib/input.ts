/** Helpers for values that arrive from outside: forms, cookies, URLs and claims. */

/** Trims, and turns an empty or missing value into null. */
export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres rejects a malformed uuid with an error rather than an empty result, so ids are checked first. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
