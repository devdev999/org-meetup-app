import { expect, test } from "vitest";
import { ana, ministryA, ministryB, signInAndAcknowledgeAs, signInAs } from "./fixtures";
import { harness } from "./harness";

const h = harness();
const adminPerson = { email: "olivia@ministry-a.example", name: "Olivia Admin" };

async function adminAndMember() {
  await h.setupOrganisation({ ...ministryA, organisationAdmin: adminPerson });
  const actor = await signInAndAcknowledgeAs(h, "ministry-a", { sub: "olivia", ...adminPerson });
  return { admin: await actor.organisationAdmin(), member: await signInAndAcknowledgeAs(h, "ministry-a", ana) };
}

test("an Organisation Admin creates, renames and retires lists while existing profiles keep their references", async () => {
  const { admin, member } = await adminAndMember();
  expect((await admin.lists()).activities.map((entry) => entry.name)).toEqual([
    "coffee",
    "game",
    "learning session",
    "lunch",
    "other",
    "sport",
    "walk",
  ]);
  const department = await admin.createListEntry("department", "Legal");
  const site = await admin.createListEntry("site", "Harbour House");
  const activity = await admin.createListEntry("activity", "board games");
  await member.updateProfile({ department: "Legal", site: "Harbour House" });

  await admin.renameListEntry("department", department.id, "Finance");
  await admin.renameListEntry("site", site.id, "Annex");
  await admin.renameListEntry("activity", activity.id, "chess");
  expect(await member.profile()).toMatchObject({ department: "Finance", site: "Annex" });

  await admin.retireListEntry("department", department.id);
  await admin.retireListEntry("site", site.id);
  await admin.retireListEntry("activity", activity.id);
  expect(await member.departmentsAndSites()).toEqual({ departments: [], sites: [] });
  expect(await member.updateProfile({ department: "Finance", site: "Annex" })).toMatchObject({
    department: "Finance",
    site: "Annex",
  });
  expect((await admin.lists()).activities).toContainEqual({ id: activity.id, name: "chess", retired: true });
  const another = await signInAndAcknowledgeAs(h, "ministry-a", {
    sub: "bo",
    email: "bo@ministry-a.example",
    name: "Bo",
  });
  await expect(another.updateProfile({ department: "Finance", site: null })).rejects.toMatchObject({
    code: "unknown-department",
  });
  await expect(another.updateProfile({ department: null, site: "Annex" })).rejects.toMatchObject({
    code: "unknown-site",
  });
  await h.app.initializePlatform(ministryA);
  expect((await admin.lists()).activities.filter((entry) => entry.name === "coffee")).toHaveLength(1);
});

test("unknown-login notices and audit entries belong to the Organisation Admin's own Organisation", async () => {
  const { admin, member } = await adminAndMember();
  await h.setupOrganisation({ ...ministryB, organisationAdmin: adminPerson });
  const otherMember = await signInAndAcknowledgeAs(h, "ministry-b", { sub: "olivia-b", ...adminPerson });
  const otherAdmin = await otherMember.organisationAdmin();
  await signInAndAcknowledgeAs(h, "ministry-a", ana);

  expect(await otherAdmin.unknownLoginNotices()).toEqual([]);
  expect(await admin.unknownLoginNotices()).toEqual([
    {
      memberId: (await member.profile()).memberId,
      name: "Ana Silva",
      email: "ana.silva@ministry-a.example",
      createdAt: h.clock.now(),
    },
  ]);
  await admin.roster();
  await admin.previewRoster([]);
  expect((await admin.auditLog()).map((entry) => entry.action).sort()).toEqual([
    "roster",
    "roster-preview",
    "unknown-login-notices",
  ]);
  expect((await otherAdmin.auditLog()).map((entry) => entry.action)).toEqual(["unknown-login-notices"]);
});

test("an Organisation Admin must acknowledge the notice before using the admin area", async () => {
  await h.setupOrganisation({ ...ministryA, organisationAdmin: adminPerson });
  const actor = await signInAs(h, "ministry-a", { sub: "olivia", ...adminPerson });
  await expect(actor.organisationAdmin()).rejects.toMatchObject({ name: "AdminVisibilityNoticeRequiredError" });
  await actor.acknowledgeAdminVisibilityNotice();
  expect(await actor.organisationAdmin()).toBeDefined();
});

test.each(["department", "site", "activity"] as const)(
  "%s names are unique within an Organisation and changes cannot cross Organisations",
  async (kind) => {
    const { admin } = await adminAndMember();
    await h.setupOrganisation({ ...ministryB, organisationAdmin: adminPerson });
    const other = await signInAndAcknowledgeAs(h, "ministry-b", { sub: "olivia-b", ...adminPerson });
    const otherAdmin = await other.organisationAdmin();
    const entry = await admin.createListEntry(kind, "Research");
    await expect(admin.createListEntry(kind, " research ")).rejects.toMatchObject({ code: "duplicate-list-entry" });
    await expect(admin.createListEntry(kind, " ")).rejects.toMatchObject({ code: "invalid-list-entry" });
    await expect(otherAdmin.renameListEntry(kind, entry.id, "Policy")).rejects.toMatchObject({
      code: "invalid-list-entry",
    });
    await expect(otherAdmin.retireListEntry(kind, entry.id)).rejects.toMatchObject({ code: "invalid-list-entry" });
    const inB = await otherAdmin.createListEntry(kind, "Research");
    expect(inB.id).not.toBe(entry.id);
    await admin.retireListEntry(kind, entry.id);
    expect(Object.values(await otherAdmin.lists()).flat()).toContainEqual({ ...inB, retired: false });
  },
);

test("repeating initial setup keeps renamed and retired starter Activities", async () => {
  const { admin } = await adminAndMember();
  const coffee = (await admin.lists()).activities.find((entry) => entry.name === "coffee")!;
  await admin.renameListEntry("activity", coffee.id, "tea");
  await admin.retireListEntry("activity", coffee.id);
  await h.app.initializePlatform(ministryA);
  const activities = (await admin.lists()).activities;
  expect(activities).toHaveLength(7);
  expect(activities).toContainEqual({ id: coffee.id, name: "tea", retired: true });
  expect(activities.some((entry) => entry.name === "coffee")).toBe(false);
});
