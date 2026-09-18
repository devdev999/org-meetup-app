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
  if (isInvalidInputError(error)) return { error: error.message };
  if (isAccessDeniedError(error)) return { error: "This Meetup is unavailable, or you cannot make this change." };
  throw error;
}

function refreshMeetups(meetupId: string) {
  revalidatePath("/meetups");
  revalidatePath(`/meetups/${meetupId}`);
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
