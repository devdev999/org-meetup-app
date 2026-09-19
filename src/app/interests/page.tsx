import Link from "next/link";
import { requireMemberPastWelcome } from "../../web/session";
import { InterestGroups } from "../_components/interest-groups";
import { InterestDeclaration } from "./declaration";

export default async function InterestsPage() {
  const { member } = await requireMemberPastWelcome();
  const [catalog, interests] = await Promise.all([member.interests(), member.myInterests()]);
  return (
    <main>
      <nav className="member-nav" aria-label="Member navigation"><Link href="/profile">Your profile</Link><Link href="/members">Find Members</Link></nav>
      <h1>Your Interests</h1>
      <h2>Declared Interests</h2>
      <InterestGroups interests={interests} editable />
      <InterestDeclaration catalog={catalog} />
    </main>
  );
}
