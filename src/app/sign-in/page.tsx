import { redirect } from "next/navigation";
import { application } from "../../web/application";
import { currentMember } from "../../web/session";

/** Plain-language explanations for the reasons a sign-in can fail. */
const SIGN_IN_ERRORS: Record<string, string> = {
  expired: "That sign-in took too long. Please start again.",
  rejected: "Your Organisation's login did not accept that sign-in. Please start again.",
  "unknown-organisation": "That Organisation is not set up on this platform.",
  "no-email": "Your Organisation's login did not tell us your email address, so we cannot find you. Ask your Organisation Admin.",
  "no-pending": "We could not match that login to a sign-in started in this browser. Please start again.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentMember()) redirect("/profile");
  const { error } = await searchParams;
  const options = await application().signInOptions();

  return (
    <main>
      <h1>Sign in</h1>
      {error && <p className="error">{SIGN_IN_ERRORS[error] ?? "Something went wrong signing you in. Please start again."}</p>}
      {options.length === 0 ? (
        <p className="muted">No Organisation is set up yet.</p>
      ) : (
        <>
          <p className="muted">Sign in with your Organisation's own login.</p>
          <ul className="options">
            {options.map((option) => (
              <li key={option.slug}>
                <a href={`/sign-in/${encodeURIComponent(option.slug)}`}>{option.name}</a>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
