import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMemberPastWelcome } from "../../../web/session";
import { InterestGroups } from "../../_components/interest-groups";
import { FlagForm } from "../../flags/form";

export default async function MemberPage({ params }: { params: Promise<{ memberId: string }> }) {
  const { member } = await requireMemberPastWelcome();
  const { memberId } = await params;
  const profile = await member.viewMember(memberId);
  if (!profile) notFound();
  return (
    <main>
      <nav className="member-nav" aria-label="Member navigation"><Link href="/members">Find Members</Link><Link href="/profile">Your profile</Link></nav>
      <h1>{profile.name}</h1>
      <dl>
        <dt>Department</dt><dd>{profile.department ?? "Not set"}</dd>
        <dt>Site</dt><dd>{profile.site ?? "Not set"}</dd>
      </dl>
      <h2>Interests</h2>
      <InterestGroups interests={profile.interests} />
      <FlagForm target={{ kind: "member", id: profile.memberId }} />
    </main>
  );
}
