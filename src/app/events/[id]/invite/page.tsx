import { OccurrenceInvite } from "../../../meetups/occurrence-invite";

export default async function InvitePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ name?: string | string[]; page?: string | string[] }>;
}) {
  return <OccurrenceInvite id={(await params).id} kind="event" searchParams={searchParams} />;
}
