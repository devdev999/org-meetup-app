import { assertFakeIssuerAllowed, fakeIssuerEnabled } from "../config/env";

/**
 * Stops the web process when the fake issuer is switched on where it must not
 * be. Next.js would otherwise log the error and keep serving.
 */
export function refuseUnsafeIdentityConfiguration(): void {
  if (!fakeIssuerEnabled()) return;
  try {
    assertFakeIssuerAllowed();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
