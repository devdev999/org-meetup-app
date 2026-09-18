import { redirect } from "next/navigation";
import { requireMember } from "../../web/session";
import { acknowledgeAdminVisibilityNotice } from "./actions";

/** The first-login notice: what Organisation Admins can see (ADR 0006). Shown once. */
export default async function WelcomePage() {
  const member = await requireMember();
  const profile = await member.profile();
  if (profile.adminVisibilityNoticeAcknowledgedAt !== null) redirect("/profile");

  return (
    <main>
      <h1>Welcome, {profile.name}</h1>
      <p>Before you start, here is what the Organisation Admins of {profile.organisation.name} can see about you.</p>
      <div className="notice">
        <p>
          <strong>Organisation Admins can see, for each Member:</strong>
        </p>
        <ul>
          <li>your name, Department, Site and when you were last active;</li>
          <li>the Interests you declare, including whether you Share or Seek each one;</li>
          <li>
            the Meetups and Events you host, join and attend, including when you said you were going and did not come,
            your Connections and your Availability;
          </li>
          <li>the Flags you raise and any raised about you.</li>
        </ul>
        <p>
          Every time an Organisation Admin looks at a Member's individual data or exports it, that access is written
          to an audit log. Platform Admins see totals only, never individual Members.
        </p>
        <p>Other Members see your name, Department, Site and Interests.</p>
      </div>
      <form action={acknowledgeAdminVisibilityNotice}>
        <button type="submit">I understand</button>
      </form>
    </main>
  );
}
