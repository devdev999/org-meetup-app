import Link from "next/link";
import { notFound } from "next/navigation";
import { isAccessDeniedError, isInvalidInputError, type InviteChoices } from "../../../../application/index";
import { requireMemberPastWelcome } from "../../../../web/session";
import { InviteForm } from "../../invite-form";

export default async function InvitePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ name?: string | string[]; page?: string | string[] }>;
}) {
  const { member } = await requireMemberPastWelcome();
  const { id } = await params;
  const meetup = await member.viewMeetup(id);
  if (!meetup || meetup.membership !== "host" || !meetup.canChange) notFound();
  const parameters = await searchParams;
  const name = typeof parameters.name === "string" ? parameters.name.trim() : "";
  const page = typeof parameters.page === "string" ? Number(parameters.page) : 0;
  let choices: InviteChoices;
  try {
    choices = await member.inviteChoices(id, { name, page });
  } catch (error) {
    if (isAccessDeniedError(error) || isInvalidInputError(error)) notFound();
    throw error;
  }
  const pageUrl = (number: number) => `/meetups/${id}/invite?${new URLSearchParams({ name, page: String(number) })}`;
  return (
    <main>
      <Link href={`/meetups/${id}`}>Back to Meetup</Link>
      <h1>Invite a Member</h1>
      <p>Choose a Member to invite to {meetup.activity.name}.</p>
      <form action={`/meetups/${id}/invite`}>
        <label>
          Member name
          <input name="name" defaultValue={name} maxLength={200} />
        </label>
        <button>Search Members</button>
      </form>
      {choices.members.length === 0 && <p className="muted">No Members match this search.</p>}
      <InviteForm key={`${name}:${page}`} meetupId={id} members={choices.members} />
      {(page > 0 || choices.hasMore) && (
        <nav className="member-nav" aria-label="Invite search pages">
          {page > 0 && <Link href={pageUrl(page - 1)}>Previous page</Link>}
          <span>Page {page + 1}</span>
          {choices.hasMore && <Link href={pageUrl(page + 1)}>Next page</Link>}
        </nav>
      )}
    </main>
  );
}
