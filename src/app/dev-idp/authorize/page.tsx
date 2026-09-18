import { notFound } from "next/navigation";
import { fakeIssuerEnabled, webConfig } from "../../../config/env";

/** Whether this page exists depends on the environment at run time, never at build time. */
export const dynamic = "force-dynamic";

/**
 * The in-memory issuer's sign-in page, for local runs only (IDENTITY_PROVIDER=fake).
 * It plays the Organisation's identity provider: whoever you say you are, you are.
 */
export default async function DevIdpAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!fakeIssuerEnabled()) notFound();
  const params = await searchParams;
  const authorizationUrl = new URL("/dev-idp/authorize", webConfig().APP_URL);
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") authorizationUrl.searchParams.set(key, value);
  }
  if (!authorizationUrl.searchParams.get("state") || !authorizationUrl.searchParams.get("redirect_uri")) {
    notFound();
  }

  return (
    <main>
      <h1>Development sign-in</h1>
      <p className="notice">
        This is the built-in fake identity provider. It stands in for your Organisation's real login while developing
        locally. Whoever you say you are, you are.
      </p>
      <form action="/dev-idp/claims" method="post">
        <input type="hidden" name="authorization_url" value={authorizationUrl.href} />
        <label>
          Email
          <input name="email" type="email" required defaultValue="pat@ministry-a.example" />
        </label>
        <label>
          Name
          <input name="name" required defaultValue="Pat Platform" />
        </label>
        <label>
          Department <span className="muted">(optional)</span>
          <input name="department" />
        </label>
        <label>
          Site <span className="muted">(optional)</span>
          <input name="site" />
        </label>
        <button type="submit">Sign in as this person</button>
      </form>
    </main>
  );
}
