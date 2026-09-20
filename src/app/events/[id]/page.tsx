import { notFound } from "next/navigation";
import { requireMemberPastWelcome } from "../../../web/session";
import { OccurrenceDetail } from "../../meetups/occurrence-detail";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { member } = await requireMemberPastWelcome();
  const { id } = await params;
  const event = await member.viewEvent(id);
  if (!event) notFound();
  return <OccurrenceDetail meetup={event} />;
}
