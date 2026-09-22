import Link from "next/link";
import { Avatar, Icon } from "../../_components/ui";
import { notFound } from "next/navigation";
import { requireMemberPastWelcome } from "../../../web/session";
import { InterestGroups } from "../../_components/interest-groups";
import { FlagForm } from "../../flags/form";

export default async function MemberPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { member } = await requireMemberPastWelcome();
  const { memberId } = await params;
  const profile = await member.viewMember(memberId);
  if (!profile) notFound();
  return (
    <main>
      <p className="back-link">
        <Link href="/members">
          <Icon name="back" size={17} />
          Find Members
        </Link>
      </p>
      <div className="profile-layout">
        <aside className="profile-card">
          <Avatar name={profile.name} large />
          <h1>{profile.name}</h1>
          <dl>
            <dt>Department</dt>
            <dd>{profile.department ?? "Not set"}</dd>
            <dt>Site</dt>
            <dd>{profile.site ?? "Not set"}</dd>
          </dl>
        </aside>
        <div className="profile-content">
          <h2>Interests</h2>
          <InterestGroups interests={profile.interests} />
          <FlagForm target={{ kind: "member", id: profile.memberId }} />
        </div>
      </div>
    </main>
  );
}
