import { notFound } from "next/navigation";
import { requireMemberPastWelcome } from "../../../web/session";
import { OccurrenceDetail } from "../occurrence-detail";

export default async function MeetupPage({ params }: { params: Promise<{ id: string }> }) {
  const { member } = await requireMemberPastWelcome();
  const { id } = await params;
  const meetup = await member.viewMeetup(id);
  if (!meetup) notFound();
  return <OccurrenceDetail meetup={meetup} attendance={await member.attendance(id)} />;
}
