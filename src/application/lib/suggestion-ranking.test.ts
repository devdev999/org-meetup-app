import { expect, test } from "vitest";
import { rankInvitees, rankMeetups, type InviteRankingCandidate } from "./suggestion-ranking";

const sql = { interestId: "sql", name: "SQL", kind: "skill" as const };
const running = { interestId: "running", name: "Running", kind: "hobby" as const };
const rust = { interestId: "rust", name: "Rust", kind: "skill" as const };

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
  expect(result[0]?.reasons).toContain("They Seek Running, a relevant Interest for this Meetup.");
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

test.each(["relevant", "compatible"] as const)("one %s overlap ties two learn-together overlaps in both rankers", (overlap) => {
  const learning = [{ ...running, stance: "seeks" as const }, { ...rust, stance: "seeks" as const }];
  const hostInterests = overlap === "compatible" ? [{ ...sql, stance: "shares" as const }] : [];
  const relevantInterests = overlap === "relevant" ? [sql] : [];
  const memberInterests = [{ ...sql, stance: "seeks" as const }];
  for (const connections of [0, 1]) {
    const expected = connections === 0 ? ["single", "learners"] : ["learners", "single"];
    const invited = rankInvitees({
      seed: "meetup-a", hostDepartmentId: null, hostInterests: [...hostInterests, ...learning], relevantInterests,
      candidates: [
        candidate("single", { interests: memberInterests, connectionCount: connections }),
        candidate("learners", { interests: learning, connectionCount: 1 - connections }),
      ],
    });
    expect(invited.map((entry) => entry.memberId)).toEqual(expected);
    const startsAt = new Date("2026-09-20T10:00:00Z");
    const home = rankMeetups([...memberInterests, ...learning], [
      { meetupId: "single", interests: relevantInterests, hostInterests, connectionCount: connections, startsAt },
      { meetupId: "learners", interests: [], hostInterests: learning, connectionCount: 1 - connections, startsAt },
    ]);
    expect(home.map((entry) => entry.meetupId)).toEqual(expected);
  }
});

test("home ranking uses canonical Interests regardless of Stance, then Connections and start time", () => {
  const candidates = [
    { meetupId: "soon-unrelated", interests: [], hostInterests: [], connectionCount: 0, startsAt: new Date("2026-09-19T08:00:00Z") },
    { meetupId: "known", interests: [sql], hostInterests: [], connectionCount: 2, startsAt: new Date("2026-09-19T09:00:00Z") },
    { meetupId: "later", interests: [sql], hostInterests: [], connectionCount: 0, startsAt: new Date("2026-09-20T10:00:00Z") },
    { meetupId: "sooner", interests: [sql], hostInterests: [], connectionCount: 0, startsAt: new Date("2026-09-19T10:00:00Z") },
    { meetupId: "more-overlap", interests: [sql, running], hostInterests: [], connectionCount: 3, startsAt: new Date("2026-09-21T10:00:00Z") },
  ];
  const result = rankMeetups([{ ...sql, stance: "seeks" }, { ...running, stance: "shares" }], candidates);
  expect(result.map((entry) => entry.meetupId)).toEqual(["more-overlap", "sooner", "later", "known", "soon-unrelated"]);
  expect(result[0]?.reasons).toContain("Relevant Interests: SQL, Running.");
  expect(rankMeetups([{ ...sql, stance: "shares" }, { ...running, stance: "seeks" }], candidates)).toEqual(result);
});

test("home ranking includes compatible Host Interests before Connections and start time", () => {
  const candidates = [
    { meetupId: "unrelated", interests: [], hostInterests: [], connectionCount: 0, startsAt: new Date("2026-09-19T08:00:00Z") },
    { meetupId: "learn-together", interests: [], hostInterests: [{ ...sql, stance: "seeks" as const }], connectionCount: 0, startsAt: new Date("2026-09-19T09:00:00Z") },
    { meetupId: "learn-from-host", interests: [], hostInterests: [{ ...sql, stance: "shares" as const }], connectionCount: 1, startsAt: new Date("2026-09-20T10:00:00Z") },
    { meetupId: "host-and-relevant", interests: [running], hostInterests: [{ ...sql, stance: "shares" as const }], connectionCount: 2, startsAt: new Date("2026-09-21T10:00:00Z") },
  ];
  const result = rankMeetups([{ ...sql, stance: "seeks" }, { ...running, stance: "seeks" }], candidates);
  expect(result.map((entry) => entry.meetupId)).toEqual(["host-and-relevant", "learn-from-host", "learn-together", "unrelated"]);
  expect(result[0]?.reasons).toContain("The Host Shares SQL, which you Seek.");
  expect(result[2]?.reasons).toContain("Learn SQL together with the Host.");
});

test.each([
  { host: "shares", member: "shares", order: ["target", "learner"], inviteReason: "You both Share SQL.", homeReason: "You and the Host Share SQL." },
  { host: "shares", member: "seeks", order: ["target", "learner"], inviteReason: "You Share SQL, which they Seek.", homeReason: "The Host Shares SQL, which you Seek." },
  { host: "seeks", member: "shares", order: ["target", "learner"], inviteReason: "They Share SQL, which you Seek.", homeReason: "You Share SQL, which the Host Seeks." },
  { host: "seeks", member: "seeks", order: ["learner", "target"], inviteReason: "Learn SQL together.", homeReason: "Learn SQL together with the Host." },
] as const)("both rankers weight and explain Host $host with Member $member", (pair) => {
  const invited = rankInvitees({
    seed: "meetup-a", hostDepartmentId: "finance", relevantInterests: [],
    hostInterests: [{ ...sql, stance: pair.host }, { ...running, stance: "seeks" }],
    candidates: [
      candidate("target", { interests: [{ ...sql, stance: pair.member }], connectionCount: 1 }),
      candidate("learner", { interests: [{ ...running, stance: "seeks" }] }),
    ],
  });
  expect(invited.map((entry) => entry.memberId)).toEqual(pair.order);
  expect(invited.find((entry) => entry.memberId === "target")?.reasons).toContain(pair.inviteReason);
  const home = rankMeetups([{ ...sql, stance: pair.member }, { ...running, stance: "seeks" }], [
    { meetupId: "target", interests: [], hostInterests: [{ ...sql, stance: pair.host }], connectionCount: 1, startsAt: new Date("2026-09-20T10:00:00Z") },
    { meetupId: "learner", interests: [], hostInterests: [{ ...running, stance: "seeks" }], connectionCount: 0, startsAt: new Date("2026-09-19T10:00:00Z") },
  ]);
  expect(home.map((entry) => entry.meetupId)).toEqual(pair.order);
  expect(home.find((entry) => entry.meetupId === "target")?.reasons).toContain(pair.homeReason);
});
