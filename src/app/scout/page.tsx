import Link from "next/link";
import { requireMemberPastWelcome } from "../../web/session";
import { ScoutConversation } from "./conversation";

export default async function ScoutPage() {
  const { profile } = await requireMemberPastWelcome();
  return <main>
    <h1>Scout</h1>
    <p>Ask who is free now, who Shares or Seeks an Interest, what is on this week, or who you have met.</p>
    <p>Scout reads what you can see and links to the screens where you can act.</p>
    <ScoutConversation key={profile.memberId} />
    <p><Link href="/">Back to home</Link></p>
  </main>;
}
