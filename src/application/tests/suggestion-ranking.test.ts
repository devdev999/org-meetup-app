import { expect, test } from "vitest";
import { rankInvitees, rankMeetups, type InviteRankingCandidate } from "../index";

const sql = { interestId: "sql", name: "SQL", kind: "skill" as const };
const running = { interestId: "running", name: "Running", kind: "hobby" as const };

function candidate(memberId: string, changes: Partial<InviteRankingCandidate> = {}): InviteRankingCandidate {
  return { memberId, interests: [], departmentId: "finance", connectionCount: 0, ...changes };
}

test("Invite ranking puts compatible Stances and relevant Interests ahead of learn-together overlap", () => {
  const result = rankInvitees({
    seed: "meetup-a", hostDepartmentId: "finance", hostInterests: [{ ...sql, stance: "seeks" }], relevantInterests: [running],
    candidates: [
      candidate("none"),
      candidate("learner", { interests: [{ ...sql, stance: "seeks" }] }),
      candidate("sharer", { interests: [{ ...sql, stance: "shares" }] }),
      candidate("both", { interests: [{ ...sql, stance: "shares" }, { ...running, stance: "seeks" }] }),
    ],
  });
  expect(result.map((entry) => entry.memberId)).toEqual(["both", "sharer", "learner", "none"]);
  expect(result[0]?.reasons).toContain("They Share SQL, which you Seek.");
  expect(result[0]?.reasons).toContain("Interested in Running, a relevant Interest for this Meetup.");
  expect(result[2]?.reasons).toContain("Learn SQL together.");
});

test("Invite ranking prefers a new face before another Department, after Interest overlap", () => {
  const result = rankInvitees({
    seed: "meetup-a", hostDepartmentId: "finance", hostInterests: [{ ...sql, stance: "shares" }], relevantInterests: [],
    candidates: [
      candidate("connected", { connectionCount: 1, departmentId: "legal" }),
      candidate("same"),
      candidate("different", { departmentId: "legal" }),
      candidate("interest", { connectionCount: 1, interests: [{ ...sql, stance: "shares" }] }),
    ],
  });
  expect(result.map((entry) => entry.memberId)).toEqual(["interest", "different", "same", "connected"]);
  expect(result[1]?.reasons).toEqual(["No recorded Connection with you.", "From a different Department."]);
});

test("tied Invite Suggestions stay in the same seeded order even when candidate input order changes", () => {
  const candidates = Array.from({ length: 12 }, (_, index) => candidate(`member-${index}`));
  const input = { seed: "meetup-a", hostDepartmentId: null, hostInterests: [], relevantInterests: [], candidates };
  const first = rankInvitees(input);
  expect(rankInvitees({ ...input, candidates: [...candidates].reverse() })).toEqual(first);
  expect(rankInvitees({ ...input, seed: "meetup-b" })).not.toEqual(first);
});

test("home ranking uses canonical Interests regardless of Stance, then Connections and start time", () => {
  const candidates = [
    { meetupId: "soon-unrelated", interests: [], connectionCount: 0, startsAt: new Date("2026-09-19T08:00:00Z") },
    { meetupId: "known", interests: [sql], connectionCount: 2, startsAt: new Date("2026-09-19T09:00:00Z") },
    { meetupId: "later", interests: [sql], connectionCount: 0, startsAt: new Date("2026-09-20T10:00:00Z") },
    { meetupId: "sooner", interests: [sql], connectionCount: 0, startsAt: new Date("2026-09-19T10:00:00Z") },
    { meetupId: "more-overlap", interests: [sql, running], connectionCount: 3, startsAt: new Date("2026-09-21T10:00:00Z") },
  ];
  const result = rankMeetups([{ ...sql, stance: "seeks" }, { ...running, stance: "shares" }], candidates);
  expect(result.map((entry) => entry.meetupId)).toEqual(["more-overlap", "sooner", "later", "known", "soon-unrelated"]);
  expect(result[0]?.reasons).toContain("Relevant Interests: SQL, Running.");
  expect(rankMeetups([{ ...sql, stance: "shares" }, { ...running, stance: "seeks" }], candidates)).toEqual(result);
});
