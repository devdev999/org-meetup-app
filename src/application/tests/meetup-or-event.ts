import type { CreateMeetupInput, MemberActions } from "../index";
import { ministryA, signInAndAcknowledgeAs } from "./fixtures";
import type { Harness } from "./harness";

export function participationFor(member: MemberActions, kind: "meetup" | "event") {
  return {
    ...member,
    join: kind === "meetup" ? member.joinMeetup : member.joinEvent,
    leave: kind === "meetup" ? member.leaveMeetup : member.leaveEvent,
    view: kind === "meetup" ? member.viewMeetup : member.viewEvent,
    list: kind === "meetup" ? member.listMeetups : member.listEvents,
    invite: kind === "meetup" ? member.inviteMember : member.inviteToEvent,
    edit: kind === "meetup" ? member.editMeetup : member.editEvent,
    cancel: kind === "meetup" ? member.cancelMeetup : member.cancelEvent,
    handOver: kind === "meetup" ? member.handOverMeetup : member.handOverEvent,
  };
}

export async function createMeetupOrEvent(h: Harness, host: MemberActions, input: CreateMeetupInput, kind: "meetup" | "event") {
  if (kind === "meetup") return host.createMeetup(input);
  const adminPerson = { email: "event-admin@example.test", name: "Event Admin" };
  await h.app.bootstrap({ ...ministryA, organisationAdmin: adminPerson });
  const admin = await (await signInAndAcknowledgeAs(h, "ministry-a", { sub: "event-admin", ...adminPerson })).organisationAdmin();
  const proposal = await host.proposeEvent(input);
  await admin.approveEvent(proposal.id);
  return (await host.viewEvent(proposal.id))!;
}
