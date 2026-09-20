import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireMemberPastWelcome } from "../../../web/session";
import { MeetupForm } from "../meetup-form";

export default async function NewMeetupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { member } = await requireMemberPastWelcome();
  const params = await searchParams;
  const hasOverlap = params.ownAvailabilityId !== undefined || params.otherAvailabilityId !== undefined;
  const [choices, interests, availability] = await Promise.all([
    member.meetupChoices(), member.interests(),
    hasOverlap ? member.availabilityMeetup({
      ownAvailabilityId: typeof params.ownAvailabilityId === "string" ? params.ownAvailabilityId : "",
      otherAvailabilityId: typeof params.otherAvailabilityId === "string" ? params.otherAvailabilityId : "",
    }) : undefined,
  ]);
  return (
    <main>
      <p><Link href="/meetups">Back to Meetups</Link></p>
      <h1>Create a Meetup</h1>
      {hasOverlap && !availability ? (
        <p>This Availability overlap is no longer available. <Link href="/availability">Check Availability again.</Link></p>
      ) : choices.activities.length === 0 ? (
        <p>Your Organisation Admin needs to add an Activity before you can create a Meetup.</p>
      ) : (
        <MeetupForm choices={choices} interests={interests} suggestionSeed={randomUUID()} availability={availability} />
      )}
    </main>
  );
}
