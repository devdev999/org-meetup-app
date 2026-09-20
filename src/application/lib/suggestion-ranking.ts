import { createHash } from "node:crypto";
import type { Interest, MemberInterest } from "./interests";

export interface InviteRankingCandidate {
  memberId: string;
  interests: MemberInterest[];
  departmentId: string | null;
  connectionCount: number;
}

export interface MeetupRankingCandidate {
  meetupId: string;
  interests: Interest[];
  hostInterests: MemberInterest[];
  connectionCount: number;
  startsAt: Date;
}

export function rankMeetups(interests: MemberInterest[], candidates: MeetupRankingCandidate[]): { meetupId: string; reasons: string[] }[] {
  return candidates.map((candidate) => {
    const overlap = candidate.interests.filter((interest) => interests.some((entry) => entry.interestId === interest.interestId));
    let score = overlap.length * 2;
    const reasons = overlap.length ? [`Relevant Interests: ${overlap.map((interest) => interest.name).join(", ")}.`] : [];
    for (const host of candidate.hostInterests) {
      const member = interests.find((interest) => interest.interestId === host.interestId);
      if (!member) continue;
      const learningTogether = member.stance === "seeks" && host.stance === "seeks";
      score += learningTogether ? 1 : 2;
      reasons.push(learningTogether ? `Learn ${host.name} together with the Host.`
        : member.stance === host.stance ? `You and the Host Share ${host.name}.`
        : host.stance === "shares" ? `The Host Shares ${host.name}, which you Seek.`
        : `You Share ${host.name}, which the Host Seeks.`);
    }
    if (!reasons.length) reasons.push("An open Meetup coming up.");
    reasons.push(`${candidate.connectionCount} recorded Connections with Participants.`);
    return { ...candidate, score, reasons };
  }).sort((a, b) => b.score - a.score || a.connectionCount - b.connectionCount
    || a.startsAt.getTime() - b.startsAt.getTime() || a.meetupId.localeCompare(b.meetupId))
    .map(({ meetupId, reasons }) => ({ meetupId, reasons }));
}

export function rankInvitees(input: {
  seed: string;
  hostDepartmentId: string | null;
  hostInterests: MemberInterest[];
  relevantInterests: Interest[];
  candidates: InviteRankingCandidate[];
}): { memberId: string; reasons: string[] }[] {
  return input.candidates.map((candidate) => {
    let score = 0;
    const reasons: string[] = [];
    for (const interest of candidate.interests) {
      const host = input.hostInterests.find((entry) => entry.interestId === interest.interestId);
      if (host) {
        const learningTogether = interest.stance === "seeks" && host.stance === "seeks";
        score += learningTogether ? 1 : 2;
        reasons.push(learningTogether ? `Learn ${interest.name} together.`
          : interest.stance === host.stance ? `You both Share ${interest.name}.`
          : interest.stance === "shares" ? `They Share ${interest.name}, which you Seek.`
          : `You Share ${interest.name}, which they Seek.`);
      }
      if (input.relevantInterests.some((entry) => entry.interestId === interest.interestId)) {
        score += 2;
        reasons.push(`They ${interest.stance === "shares" ? "Share" : "Seek"} ${interest.name}, a relevant Interest for this Meetup.`);
      }
    }
    const newFace = candidate.connectionCount === 0;
    const differentDepartment = input.hostDepartmentId !== null && candidate.departmentId !== null
      && input.hostDepartmentId !== candidate.departmentId;
    if (newFace) reasons.push("No recorded Connection with you.");
    if (differentDepartment) reasons.push("From a different Department.");
    if (!reasons.length) reasons.push("Stable order for this Meetup.");
    const tie = createHash("sha256").update(`${input.seed}:${candidate.memberId}`).digest("hex");
    return { memberId: candidate.memberId, reasons, score, newFace, differentDepartment, tie };
  }).sort((a, b) => b.score - a.score || Number(b.newFace) - Number(a.newFace)
    || Number(b.differentDepartment) - Number(a.differentDepartment) || a.tie.localeCompare(b.tie) || a.memberId.localeCompare(b.memberId))
    .map(({ memberId, reasons }) => ({ memberId, reasons }));
}
