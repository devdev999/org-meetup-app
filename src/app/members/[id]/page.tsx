import { notFound } from "next/navigation";
import { requireMemberPastWelcome } from "../../../web/session";

/** A colleague's profile. The application returns nothing for Members of other Organisations. */
export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const member = await requireMemberPastWelcome();
  const { id } = await params;
  const colleague = await member.viewMember(id);
  if (!colleague) notFound();

  return (
    <main>
      <h1>{colleague.name}</h1>
      <dl>
        <dt>Department</dt>
        <dd>{colleague.department ?? <span className="muted">Not set</span>}</dd>
        <dt>Site</dt>
        <dd>{colleague.site ?? <span className="muted">Not set</span>}</dd>
      </dl>
      <p>
        <a href="/profile">Back to your profile</a>
      </p>
    </main>
  );
}
