"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  isAccessDeniedError,
  isInvalidInputError,
  type EditMeetupInput,
  type CreateMeetupInput,
  type MeetupAudience,
} from "../../application/index";
import { application } from "../../web/application";
import { formText } from "../../web/forms";
import { requireMemberPastWelcome } from "../../web/session";

export interface MeetupActionState {
  error?: string;
  message?: string;
}

function meetupInput(form: FormData): EditMeetupInput {
  return {
    startsAt: new Date(formText(form.get("startsAt")) ?? ""),
    durationMinutes: Number(form.get("durationMinutes")),
    place: form.get("placeKind") === "virtual"
      ? { kind: "virtual", url: formText(form.get("url")) ?? "" }
      : { kind: "physical", siteId: formText(form.get("siteId")) ?? "", spot: formText(form.get("spot")) ?? "" },
    capacity: Number(form.get("capacity")),
    description: formText(form.get("description")) ?? "",
    relevantInterests: JSON.parse(formText(form.get("relevantInterests")) ?? "[]"),
  };
}

function audienceInput(form: FormData): MeetupAudience | undefined {
  switch (form.get("audience")) {
    case "organisation": return { kind: "open", scope: "organisation" };
    case "site": return { kind: "open", scope: "site", siteId: formText(form.get("audienceSiteId")) ?? "" };
    case "invite-only": return { kind: "invite-only" };
    default: return undefined;
  }
}

function actionError(error: unknown): MeetupActionState {
  if (error instanceof SyntaxError) return { error: "Choose valid relevant Interests." };
  if (isInvalidInputError(error)) return { error: error.message };
  if (isAccessDeniedError(error)) return { error: "This action is unavailable, or you cannot make this change." };
  throw error;
}

function refreshMeetups(meetupId: string, kind: "meetups" | "events" = "meetups") {
  revalidatePath("/");
  revalidatePath(`/${kind}`);
  revalidatePath(`/${kind}/${meetupId}`);
  revalidatePath(`/${kind}/${meetupId}/invite`);
  revalidatePath(`/${kind}/${meetupId}/edit`);
  revalidatePath("/inbox");
}

export async function saveMeetup(meetupId: string | null, form: FormData, mode: "meetup" | "event" | "event-direct" = "meetup"): Promise<MeetupActionState> {
  const { member } = await requireMemberPastWelcome();
  let savedId: string;
  if (form.get("timeZone") !== await application().timeZone()) return { error: "The deployment time zone changed. Reload and review the times before saving." };
  try {
    const fields = meetupInput(form);
    const eventFields = { ...fields, capacity: formText(form.get("capacity")) ? fields.capacity : null };
    if (meetupId) {
      if (mode === "meetup") await member.editMeetup(meetupId, fields);
      else await member.editEvent(meetupId, eventFields);
      savedId = meetupId;
    } else {
      const frequency = form.get("frequency");
      if (frequency !== null && !["once", "weekly", "fortnightly", "monthly"].includes(String(frequency))) return { error: "Choose a valid repeat schedule." };
      const input: CreateMeetupInput = {
        ...fields,
        activityId: formText(form.get("activityId")) ?? "",
        audience: audienceInput(form),
        recurrence: frequency === "weekly" || frequency === "fortnightly" || frequency === "monthly"
          ? { frequency, endsOn: formText(form.get("endsOn")) || null } : undefined,
        invitedMemberIds: form.getAll("invitedMemberId").map((value) => formText(value) ?? ""),
        availabilityOverlap: form.has("ownAvailabilityId") || form.has("otherAvailabilityId") ? {
          ownAvailabilityId: formText(form.get("ownAvailabilityId")) ?? "",
          otherAvailabilityId: formText(form.get("otherAvailabilityId")) ?? "",
        } : undefined,
      };
      const meetup = mode === "meetup" ? await member.createMeetup(input)
        : mode === "event-direct" ? await (await member.organisationAdmin()).createEvent({ ...input, capacity: eventFields.capacity })
          : await member.proposeEvent({ ...input, capacity: eventFields.capacity });
      savedId = meetup.id;
    }
  } catch (error) {
    return actionError(error);
  }
  refreshMeetups(savedId, mode === "meetup" ? "meetups" : "events");
  revalidatePath("/events/proposals");
  revalidatePath("/admin/events");
  redirect(mode === "event" && !meetupId ? "/events/proposals" : `/${mode === "meetup" ? "meetups" : "events"}/${savedId}`);
}

export async function changeSeries(seriesId: string, operation: "join" | "leave" | "stop"): Promise<MeetupActionState> {
  const { member } = await requireMemberPastWelcome();
  try {
    if (operation === "join") await member.joinSeries(seriesId);
    else if (operation === "leave") await member.leaveSeries(seriesId);
    else if (operation === "stop") await member.stopSeries(seriesId);
    else return { error: "Choose a series action." };
    revalidatePath("/meetups", "layout");
    revalidatePath("/events", "layout");
    revalidatePath("/");
    revalidatePath("/inbox");
    return { message: operation === "join" ? "You joined the series. Check each occurrence for your place or waitlist position."
      : operation === "leave" ? "You left the series and its future occurrences." : "Series stopped. Future occurrences are cancelled." };
  } catch (error) {
    return actionError(error);
  }
}

export async function answerRsvp(meetupId: string, form: FormData, kind: "meetup" | "event" = "meetup"): Promise<MeetupActionState> {
  const { member } = await requireMemberPastWelcome();
  const answer = form.get("answer");
  if (answer !== "going" && answer !== "not-going") return { error: "Choose Going or Not going." };
  try {
    const membership = await member.answerRsvp(meetupId, answer);
    refreshMeetups(meetupId, kind === "event" ? "events" : "meetups");
    return { message: membership === null ? "Not going recorded for this occurrence."
      : membership === "waitlisted" ? "Going recorded. You are on the waitlist." : "Going recorded. You have a place." };
  } catch (error) {
    return actionError(error);
  }
}

export async function changeMeetup(
  meetupId: string,
  operation: "join" | "leave" | "cancel" | "hand-over",
  form: FormData,
  kind: "meetup" | "event" = "meetup",
): Promise<MeetupActionState> {
  const { member } = await requireMemberPastWelcome();
  let message: string;
  const label = kind === "event" ? "Event" : "Meetup";
  try {
    switch (operation) {
      case "join": {
        const membership = await (kind === "event" ? member.joinEvent(meetupId) : member.joinMeetup(meetupId));
        message = membership === "waitlisted" ? "You are on the waitlist." : `You joined this ${label}.`;
        break;
      }
      case "leave":
        await (kind === "event" ? member.leaveEvent(meetupId) : member.leaveMeetup(meetupId));
        message = `You left this ${label}.`;
        break;
      case "cancel":
        await (kind === "event" ? member.cancelEvent(meetupId) : member.cancelMeetup(meetupId));
        message = `${label} cancelled. Members have been notified.`;
        break;
      case "hand-over":
        await (kind === "event" ? member.handOverEvent : member.handOverMeetup)(meetupId, formText(form.get("participantMemberId")) ?? "");
        message = "The Participant is now the Host.";
        break;
      default:
        return { error: `Choose an action for this ${label}.` };
    }
  } catch (error) {
    return actionError(error);
  }
  refreshMeetups(meetupId, kind === "event" ? "events" : "meetups");
  return { message };
}

export async function sendInvite(meetupId: string, form: FormData, source: "manual" | "suggestion" = "manual", kind: "meetup" | "event" = "meetup"): Promise<MeetupActionState> {
  const { member } = await requireMemberPastWelcome();
  try {
    const memberId = formText(form.get("memberId")) ?? "";
    const invite = source === "suggestion"
      ? await (kind === "event" ? member.inviteSuggestedMemberToEvent : member.inviteSuggestedMember)(meetupId, memberId, formText(form.get("previousInviteId")) || undefined)
      : await (kind === "event" ? member.inviteToEvent : member.inviteMember)(meetupId, memberId);
    refreshMeetups(meetupId, kind === "event" ? "events" : "meetups");
    return { message: invite.state === "pending" ? "Invite sent." : `This Invite is already ${invite.state}.` };
  } catch (error) {
    return actionError(error);
  }
}

export async function answerInvite(inviteId: string, form: FormData): Promise<MeetupActionState> {
  const { member } = await requireMemberPastWelcome();
  const answer = form.get("answer");
  if (answer !== "accept" && answer !== "decline") return { error: "Choose Accept or Decline." };
  try {
    const result = await member.answerInvite(inviteId, answer);
    refreshMeetups(result.eventId ?? result.meetupId, result.eventId ? "events" : "meetups");
    return { message: result.state === "declined" ? "Invite declined."
      : result.membership === null ? `Your Invite was accepted, but you no longer have a place in this ${result.eventId ? "Event" : "Meetup"}.`
      : result.membership === "waitlisted" ? "Invite accepted. You are on the waitlist." : "Invite accepted." };
  } catch (error) {
    return actionError(error);
  }
}
