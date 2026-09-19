import { expect, test } from "vitest";
import { parseRosterCsv } from "../../adapters/roster/csv";
import type { RosterRow } from "../index";
import { ana, ministryA, ministryB, signInAndAcknowledgeAs, signInForId } from "./fixtures";
import { harness } from "./harness";

const h = harness();
const adminPerson = { email: "olivia@ministry-a.example", name: "Olivia Admin" };
const config = { ...ministryA, organisationAdmin: adminPerson };
const administrators: RosterRow[] = [adminPerson, ministryA.platformAdmin].map((person) => ({
  ...person,
  department: null,
  site: null,
}));
const anaRow: RosterRow = {
  email: "ana.silva@ministry-a.example",
  name: "Ana Silva",
  department: "Legal",
  site: "Harbour House",
  staffIdentifier: "E-1001",
};

async function signInAdmin() {
  const member = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "olivia", ...adminPerson });
  return member.organisationAdmin();
}

test("only an Organisation Admin can open their Organisation's admin area", async () => {
  await h.app.bootstrap(config);
  const admin = await signInAdmin();
  expect(await admin.roster()).toEqual(expect.arrayContaining([expect.objectContaining(adminPerson)]));

  const member = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const platformAdmin = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "pat", ...ministryA.platformAdmin });
  await expect(member.organisationAdmin()).rejects.toMatchObject({ name: "AccessDeniedError" });
  await expect(platformAdmin.organisationAdmin()).rejects.toMatchObject({ name: "AccessDeniedError" });
});

test("re-upload previews changes and departures, preserves identities and refuses Departed Members", async () => {
  await h.app.bootstrap(config);
  const admin = await signInAdmin();
  const boRow = { email: "bo@ministry-a.example", name: "Bo Chen", department: null, site: null };
  const original = [...administrators, anaRow, boRow];
  await admin.commitRoster(original, (await admin.previewRoster(original)).revision);
  const anaActor = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const boActor = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "bo", ...boRow });
  const boId = (await boActor.profile()).memberId;
  const anaId = (await anaActor.profile()).memberId;
  const corrected = { ...anaRow, name: "Ana Santos", department: "Finance", site: "Annex", staffIdentifier: "E-1002" };
  const updated = [...administrators, corrected];
  const preview = await admin.previewRoster(updated);

  expect(preview.changes).toEqual([
    {
      before: expect.objectContaining({ ...anaRow, memberId: anaId, status: "active" }),
      after: { ...corrected, status: "active" },
    },
  ]);
  expect(preview.departures).toEqual([expect.objectContaining({ email: boRow.email, status: "active" })]);
  expect(await anaActor.viewMember(boId)).toBeDefined();
  await admin.commitRoster(updated, preview.revision);

  expect(await anaActor.profile()).toMatchObject({
    memberId: anaId,
    name: "Ana Santos",
    status: "active",
    department: "Finance",
    site: "Annex",
  });
  expect(await anaActor.viewMember(boId)).toBeUndefined();
  expect(await h.app.asMember(boId)).toBeUndefined();
  await expect(boActor.profile()).rejects.toMatchObject({ name: "AccessDeniedError" });
  await expect(signInForId(h, "ministry-a", { sub: "bo", ...boRow })).rejects.toMatchObject({
    name: "SignInError",
    code: "inactive-member",
  });
  expect(await admin.roster()).toContainEqual(
    expect.objectContaining({ memberId: boId, email: boRow.email, status: "departed" }),
  );
  expect(await admin.previewRoster(updated)).toMatchObject({ additions: [], changes: [], departures: [] });
});

test("preview leaves Members unchanged and committing provisions visible Members with their roster data", async () => {
  await h.app.bootstrap(config);
  const admin = await signInAdmin();
  const rows = [...administrators, anaRow];
  const preview = await admin.previewRoster(rows);

  expect(preview.additions).toEqual([anaRow]);
  expect(preview.changes).toEqual([]);
  expect(preview.departures).toEqual([]);
  expect(await admin.roster()).toHaveLength(2);

  await admin.commitRoster(rows, preview.revision);
  const provisioned = (await admin.roster()).find((member) => member.email === anaRow.email)!;
  expect(provisioned).toMatchObject({ ...anaRow, status: "provisioned" });
  const viewer = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "pat", ...ministryA.platformAdmin });
  expect(await viewer.viewMember(provisioned.memberId)).toEqual({
    memberId: provisioned.memberId,
    name: "Ana Silva",
    department: "Legal",
    site: "Harbour House",
    interests: [],
  });

  const signedIn = await signInAndAcknowledgeAs(h, "ministry-a", { ...ana, name: "Name from login" });
  expect(await signedIn.profile()).toMatchObject({
    memberId: provisioned.memberId,
    name: "Ana Silva",
    status: "active",
    department: "Legal",
    site: "Harbour House",
  });
  expect((await admin.roster()).find((member) => member.email === anaRow.email)?.staffIdentifier).toBe("E-1001");
});

test("CSV upload handles quoted names, a byte-order mark and optional staff identifiers", async () => {
  await h.app.bootstrap(config);
  const admin = await signInAdmin();
  const rows = parseRosterCsv(
    '\uFEFFEmail,Name,Department,Site,Staff identifier\r\n ANA.SILVA@ministry-a.example ,"Silva, Ana","Policy, Planning",Harbour House,E-1001\r\n',
  );
  const preview = await admin.previewRoster([...administrators, ...rows]);
  expect(preview.additions).toEqual([
    {
      email: "ana.silva@ministry-a.example",
      name: "Silva, Ana",
      department: "Policy, Planning",
      site: "Harbour House",
      staffIdentifier: "E-1001",
    },
  ]);
  await admin.commitRoster([...administrators, ...rows], preview.revision);
  expect(await admin.roster()).toContainEqual(
    expect.objectContaining({ name: "Silva, Ana", staffIdentifier: "E-1001", department: "Policy, Planning" }),
  );
  expect(parseRosterCsv("email,name,department,site\na@ministry-a.example,Ana,,\n")).toEqual([
    { email: "a@ministry-a.example", name: "Ana", department: null, site: null, staffIdentifier: null },
  ]);
});

test("CSV size is checked in UTF-8 bytes before preview and commit", async () => {
  await h.app.bootstrap(config);
  const admin = await signInAdmin();
  const preview = await admin.previewRoster(administrators);
  const csv = `email,name,department,site\nana.silva@ministry-a.example,${"é".repeat(500_000)},,\n`;

  await expect(async () =>
    admin.commitRoster([...administrators, ...parseRosterCsv(csv)], preview.revision),
  ).rejects.toMatchObject({ code: "invalid-roster" });
  expect(() => parseRosterCsv(csv)).toThrow("Choose a CSV file up to 1 MB.");
  expect(await admin.roster()).toHaveLength(2);
});

test("CSV at the size limit retains quoted multiline values through form submission", async () => {
  await h.app.bootstrap(config);
  const admin = await signInAdmin();
  const csv = 'email,name,department,site\nana.silva@ministry-a.example,"Ana\nSilva",Legal,Harbour House\n'.padEnd(
    1_000_000,
    "\n",
  );
  const preview = await admin.previewRoster([...administrators, ...parseRosterCsv(csv)]);
  const form = new FormData();
  form.set("csv", csv);
  const submitted = await new Request("http://localhost/admin/roster", { method: "POST", body: form }).formData();

  await admin.commitRoster([...administrators, ...parseRosterCsv(submitted.get("csv")!.toString())], preview.revision);

  expect(await admin.roster()).toContainEqual(
    expect.objectContaining({ email: anaRow.email, name: "Ana\nSilva", status: "provisioned" }),
  );
});

test("roster changes and preview revisions cannot cross Organisations", async () => {
  await h.app.bootstrap(config);
  await h.app.bootstrap({ ...ministryB, organisationAdmin: adminPerson });
  const admin = await signInAdmin();
  const otherMember = await signInAndAcknowledgeAs(h, "ministry-b", { sub: "other-admin", ...adminPerson });
  const otherAdmin = await otherMember.organisationAdmin();
  const rows = [...administrators, anaRow];
  const preview = await admin.previewRoster(rows);
  await expect(otherAdmin.commitRoster(rows, preview.revision)).rejects.toMatchObject({ code: "stale-roster" });
  await admin.commitRoster(rows, preview.revision);
  expect(await otherAdmin.roster()).toHaveLength(2);
  expect(await otherMember.departmentsAndSites()).toEqual({ departments: [], sites: [] });
  const inA = (await admin.roster()).find((member) => member.email === anaRow.email)!;
  expect(await otherMember.viewMember(inA.memberId)).toBeUndefined();
  const otherRows = [
    { ...ministryB.platformAdmin, department: null, site: null },
    { ...adminPerson, department: null, site: null },
    { ...anaRow, name: "Ana in B" },
  ];
  await otherAdmin.commitRoster(otherRows, (await otherAdmin.previewRoster(otherRows)).revision);
  expect((await otherAdmin.roster()).find((member) => member.email === anaRow.email)).toMatchObject({
    name: "Ana in B",
  });
  expect((await admin.roster()).find((member) => member.email === anaRow.email)).toMatchObject({
    name: "Ana Silva",
    status: "provisioned",
  });
});

test("stale previews, altered uploads and concurrent commits cannot apply unseen changes", async () => {
  await h.app.bootstrap(config);
  const admin = await signInAdmin();
  const rows = [...administrators, anaRow];
  const preview = await admin.previewRoster(rows);
  await expect(admin.commitRoster(administrators, preview.revision)).rejects.toMatchObject({ code: "stale-roster" });
  const results = await Promise.allSettled([
    admin.commitRoster(rows, preview.revision),
    admin.commitRoster(rows, preview.revision),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
  const beforeLogin = await admin.previewRoster(administrators);
  await signInAndAcknowledgeAs(h, "ministry-a", ana);
  await expect(admin.commitRoster(administrators, beforeLogin.revision)).rejects.toMatchObject({
    code: "stale-roster",
  });
  expect((await admin.roster()).find((member) => member.email === anaRow.email)?.status).toBe("active");
});

test.each([
  "",
  "email,name\nana@ministry-a.example,Ana",
  "email,name,department,site,email\na@ministry-a.example,Ana,,,b@ministry-a.example",
  'email,name,department,site\na@ministry-a.example,"unclosed,,',
  "email,name,department,site\na@ministry-a.example,Ana,Legal",
])("invalid CSV is refused before any roster change: %s", async (csv) => {
  await h.app.bootstrap(config);
  const admin = await signInAdmin();
  expect(() => parseRosterCsv(csv)).toThrow();
  expect(await admin.roster()).toHaveLength(2);
});

test("invalid roster rows and duplicate emails fail without changing the roster", async () => {
  await h.app.bootstrap(config);
  const admin = await signInAdmin();
  for (const rows of [
    [...administrators, { ...anaRow, email: "not-an-email" }],
    [...administrators, { ...anaRow, name: " " }],
    [...administrators, anaRow, { ...anaRow, email: " ANA.SILVA@ministry-a.example " }],
  ]) {
    await expect(admin.previewRoster(rows)).rejects.toMatchObject({ code: "invalid-roster" });
    await expect(admin.commitRoster(rows, "invalid")).rejects.toMatchObject({ code: "invalid-roster" });
  }
  expect(await admin.roster()).toHaveLength(2);
});

test("a Departed Organisation Admin loses every previously obtained actor capability", async () => {
  await h.app.bootstrap(config);
  const member = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "olivia", ...adminPerson });
  const admin = await member.organisationAdmin();
  const empty = await admin.previewRoster([]);
  await admin.commitRoster([], empty.revision);
  for (const operation of [
    () => member.profile(),
    () => member.adminVisibilityNotice(),
    () => member.acknowledgeAdminVisibilityNotice(),
    () => member.organisationAdmin(),
    () => admin.roster(),
    () => admin.previewRoster([]),
    () => admin.commitRoster([], empty.revision),
    () => admin.createListEntry("site", "Hidden"),
    () => admin.lists(),
    () => admin.unknownLoginNotices(),
    () => admin.auditLog(),
  ])
    await expect(operation()).rejects.toMatchObject({ name: "AccessDeniedError" });
});

test("re-uploading equivalent names is unchanged and returning Members keep their identity", async () => {
  await h.app.bootstrap(config);
  const admin = await signInAdmin();
  const rows = [...administrators, anaRow];
  await admin.commitRoster(rows, (await admin.previewRoster(rows)).revision);
  const actor = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const original = await actor.profile();
  const equivalent = [...administrators, { ...anaRow, department: " legal ", site: "HARBOUR HOUSE" }];
  expect(await admin.previewRoster(equivalent)).toMatchObject({ additions: [], changes: [], departures: [] });
  await admin.commitRoster(administrators, (await admin.previewRoster(administrators)).revision);
  await admin.commitRoster(rows, (await admin.previewRoster(rows)).revision);
  const returned = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  expect(await returned.profile()).toMatchObject({
    memberId: original.memberId,
    status: "active",
    adminVisibilityNoticeAcknowledgedAt: original.adminVisibilityNoticeAcknowledgedAt,
  });
  expect(await admin.unknownLoginNotices()).toEqual([]);
});
