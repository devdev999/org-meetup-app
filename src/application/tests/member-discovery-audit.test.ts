import { expect, test } from "vitest";
import { ana, ministryA, ministryB, signInAndAcknowledgeAs, withDepartmentAndSiteClaims } from "./fixtures";
import { harness, START_OF_TEST } from "./harness";

const h = harness();
const adminPerson = { sub: "olivia", email: "olivia@ministry-a.example", name: "Olivia Admin" };

async function adminAndMember() {
  await h.app.bootstrap({ ...withDepartmentAndSiteClaims(ministryA), organisationAdmin: adminPerson });
  const actor = await signInAndAcknowledgeAs(h, "ministry-a", adminPerson);
  const member = await signInAndAcknowledgeAs(h, "ministry-a", { ...ana, ou: "Legal", building: "Harbour House" });
  const sql = (await member.interests()).find((interest) => interest.name === "SQL")!;
  await member.confirmInterest({ phrase: "sql", selection: { interestId: sql.interestId }, stance: "seeks" });
  return { actor, admin: await actor.organisationAdmin(), memberId: (await member.profile()).memberId };
}

test("an Organisation Admin's Member profile view records the actor, Member and access time", async () => {
  const { actor, admin, memberId } = await adminAndMember();
  const actorMemberId = (await actor.profile()).memberId;
  h.clock.advance(60_000);

  expect(await actor.viewMember(memberId)).toMatchObject({
    memberId,
    interests: [{ name: "SQL", stance: "seeks" }],
  });
  expect(await admin.auditLog()).toEqual([
    expect.objectContaining({
      actorMemberId,
      actorName: "Olivia Admin",
      action: "member-profile",
      filter: { memberId },
      createdAt: new Date(START_OF_TEST.getTime() + 60_000),
    }),
  ]);
});

test("an Organisation Admin's Member search records its effective filters and time on every request", async () => {
  const { actor, admin, memberId } = await adminAndMember();
  const actorMemberId = (await actor.profile()).memberId;
  const filter = { interest: "  sql ", department: " Legal ", site: " HARBOUR HOUSE " };

  expect(await actor.searchMembers(filter)).toMatchObject([{ memberId, interests: [{ name: "SQL", stance: "seeks" }] }]);
  h.clock.advance(60_000);
  expect(await actor.searchMembers({ interest: "missing" })).toEqual([]);
  h.clock.advance(60_000);
  await actor.searchMembers({ interest: " ", department: " ", site: " " });

  expect(await admin.auditLog()).toEqual([
    expect.objectContaining({
      actorMemberId,
      action: "member-search",
      filter: { interest: "sql", department: "legal", site: "harbour house" },
      createdAt: START_OF_TEST,
    }),
    expect.objectContaining({
      actorMemberId,
      action: "member-search",
      filter: { interest: "missing" },
      createdAt: new Date(START_OF_TEST.getTime() + 60_000),
    }),
    expect.objectContaining({
      actorMemberId,
      action: "member-search",
      filter: {},
      createdAt: new Date(START_OF_TEST.getTime() + 120_000),
    }),
  ]);
});

test.each(["Member", "Platform Admin"])("Member discovery by a %s without the Organisation Admin role creates no admin audit entries", async (role) => {
  const { admin, memberId } = await adminAndMember();
  const claims = role === "Platform Admin"
    ? { sub: "pat", ...ministryA.platformAdmin }
    : { sub: "bo", email: "bo@ministry-a.example", name: "Bo" };
  const viewer = await signInAndAcknowledgeAs(h, "ministry-a", claims);
  expect(await viewer.profile()).toMatchObject({ isOrganisationAdmin: false });

  expect(await viewer.viewMember(memberId)).toMatchObject({ memberId, interests: [{ name: "SQL", stance: "seeks" }] });
  expect(await viewer.searchMembers({ interest: "SQL" })).toMatchObject([{ memberId }]);
  expect(await admin.auditLog()).toEqual([]);
});

test("Member discovery and its audit log stay inside the Organisation Admin's Organisation", async () => {
  const { actor, admin, memberId } = await adminAndMember();
  const otherPerson = { sub: "admin-b", email: "admin@ministry-b.example", name: "Other Admin" };
  await h.app.bootstrap({ ...ministryB, organisationAdmin: otherPerson });
  const otherActor = await signInAndAcknowledgeAs(h, "ministry-b", otherPerson);
  const otherAdmin = await otherActor.organisationAdmin();
  const otherMemberId = (await otherActor.profile()).memberId;
  const sql = (await otherActor.interests()).find((interest) => interest.name === "SQL")!;
  await otherActor.confirmInterest({ phrase: "sql", selection: { interestId: sql.interestId }, stance: "seeks" });

  expect(await actor.viewMember(otherMemberId)).toBeUndefined();
  expect(await actor.viewMember(memberId)).toMatchObject({ memberId });
  expect(await actor.searchMembers({ interest: "SQL" })).toMatchObject([{ memberId }]);
  expect(await otherAdmin.auditLog()).toEqual([]);
  expect(await otherActor.searchMembers({ interest: "SQL" })).toEqual([]);

  const auditLog = await admin.auditLog();
  expect(auditLog).toHaveLength(2);
  expect(auditLog).toContainEqual(expect.objectContaining({ action: "member-profile", filter: { memberId } }));
  expect(await otherAdmin.auditLog()).toEqual([
    expect.objectContaining({ actorMemberId: otherMemberId, action: "member-search", filter: { interest: "SQL" } }),
  ]);
});

test.each(["profile", "search"])("an Organisation Admin's Member %s query exposes no result when auditing fails", async (view) => {
  const { actor, admin, memberId } = await adminAndMember();
  h.clock.set(new Date(Number.NaN));

  const result = view === "profile" ? actor.viewMember(memberId) : actor.searchMembers({ interest: "SQL" });
  await expect(result).rejects.toThrow();
  h.clock.set(START_OF_TEST);
  expect(await admin.auditLog()).toEqual([]);
});
