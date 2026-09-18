/**
 * Runs once when the web server starts. The checks use Node.js APIs, so they
 * live in a separate module loaded only in the Node.js runtime; Next.js also
 * compiles this hook for the Edge runtime.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { refuseUnsafeIdentityConfiguration } = await import("./web/startup-checks");
    refuseUnsafeIdentityConfiguration();
  }
}
