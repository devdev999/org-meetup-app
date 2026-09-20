"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  isAccessDeniedError,
  isInvalidInputError,
  type EditMeetupInput,
  type MeetupAudience,
} from "../../application/index";
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
  if (isAccessDeniedError(error)) return { error: "This Meetup is unavailable, or you cannot make this change." };
  throw error;
}

function refreshMeetups(meetupId: string) {
  revalidatePath("/");
  revalidatePath("/meetups");
  revalidatePath(`/meetups/${meetupId}`);
  revalidatePath(`/meetups/${meetupId}/invite`);
  revalidatePath(`/meetups/${meetupId}/edit`);
  revalidatePath("/inbox");
}

export async function saveMeetup(meetupId: string | null, form: FormData): Promise<MeetupActionState> {
  const { member } = await requireMemberPastWelcome();
  let savedId: string;
  try {
    if (meetupId) {
      await member.editMeetup(meetupId, meetupInput(form));
      savedId = meetupId;
    } else {
      const meetup = await member.createMeetup({
        ...meetupInput(form),
        activityId: formText(form.get("activityId")) ?? "",
        audience: audienceInput(form),
        invitedMemberIds: form.getAll("invitedMemberId").map((value) => formText(value) ?? ""),
        availabilityOverlap: form.has("ownAvailabilityId") || form.has("otherAvailabilityId") ? {
          ownAvailabilityId: formText(form.get("ownAvailabilityId")) ?? "",
          otherAvailabilityId: formText(form.get("otherAvailabilityId")) ?? "",
        } : undefined,
      });
      savedId = meetup.id;
    }
  } catch (error) {
    return actionError(error);
  }
  refreshMeetups(savedId);
  redirect(`/meetups/${savedId}`);
}

export async function changeMeetup(
  meetupId: string,
  operation: "join" | "leave" | "cancel" | "hand-over",
  form: FormData,
): Promise<MeetupActionState> {
  const { member } = await requireMemberPastWelcome();
  let message: string;
  try {
    switch (operation) {
      case "join": {
        const membership = await member.joinMeetup(meetupId);
        message = membership === "waitlisted" ? "You are on the waitlist." : "You joined this Meetup.";
        break;
      }
      case "leave":
        await member.leaveMeetup(meetupId);
        message = "You left this Meetup.";
        break;
      case "cancel":
        await member.cancelMeetup(meetupId);
        message = "Meetup cancelled. Members have been notified.";
        break;
      case "hand-over":
        await member.handOverMeetup(meetupId, formText(form.get("participantMemberId")) ?? "");
        message = "The Participant is now the Host.";
        break;
      default:
        return { error: "Choose a Meetup action." };
    }
  } catch (error) {
    return actionError(error);
  }
  refreshMeetups(meetupId);
  return { message };
}

export async function sendInvite(meetupId: string, form: FormData, source: "manual" | "suggestion" = "manual"): Promise<MeetupActionState> {
  const { member } = await requireMemberPastWelcome();
  try {
    const memberId = formText(form.get("memberId")) ?? "";
    const invite = source === "suggestion"
      ? await member.inviteSuggestedMember(meetupId, memberId, formText(form.get("previousInviteId")) || undefined)
      : await member.inviteMember(meetupId, memberId);
    refreshMeetups(meetupId);
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
    refreshMeetups(result.meetupId);
    return { message: result.state === "declined" ? "Invite declined."
      : result.membership === null ? "Your Invite was accepted, but you no longer have a place in this Meetup."
      : result.membership === "waitlisted" ? "Invite accepted. You are on the waitlist." : "Invite accepted." };
  } catch (error) {
    return actionError(error);
  }
}
