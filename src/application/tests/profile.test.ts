import { expect, test } from "vitest";
import type { RawClaims } from "../ports";
import { ana, ministryA, signInAndAcknowledgeAs, withDepartmentAndSiteClaims } from "./fixtures";
import { harness } from "./harness";

const h = harness();

/** Bo's login states where Bo works, which puts those names on Ministry A's lists. */
const bo: RawClaims = { sub: "bo-1", email: "bo@ministry-a.example", name: "Bo Chen", ou: "Finance", building: "Harbour House" };

test("a login that states Department and Site places the Member", async () => {
  await h.setupOrganisation(withDepartmentAndSiteClaims(ministryA));

  const actor = await signInAndAcknowledgeAs(h, "ministry-a", { ...ana, ou: "Legal", building: "Harbour House", employee_number: "E-1001" });

  expect(await actor.profile()).toMatchObject({ department: "Legal", site: "Harbour House" });
});

test("a Member whose login stated no Department or Site chooses them from the Organisation's lists", async () => {
  await h.setupOrganisation(withDepartmentAndSiteClaims(ministryA));
  await signInAndAcknowledgeAs(h, "ministry-a", bo);
  const actor = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  expect(await actor.profile()).toMatchObject({ department: null, site: null });

  await actor.updateProfile({ department: "Finance", site: "Harbour House" });

  expect(await actor.profile()).toMatchObject({ department: "Finance", site: "Harbour House" });
});

test("Departments and Sites already in the Organisation are offered as choices, in name order", async () => {
  await h.setupOrganisation(withDepartmentAndSiteClaims(ministryA));
  await signInAndAcknowledgeAs(h, "ministry-a", bo);
  const actor = await signInAndAcknowledgeAs(h, "ministry-a", { ...ana, ou: "Legal" });

  expect(await actor.departmentsAndSites()).toEqual({ departments: ["Finance", "Legal"], sites: ["Harbour House"] });
});

test("a choice is matched by name regardless of case and spacing", async () => {
  await h.setupOrganisation(withDepartmentAndSiteClaims(ministryA));
  await signInAndAcknowledgeAs(h, "ministry-a", bo);
  const actor = await signInAndAcknowledgeAs(h, "ministry-a", ana);

  await actor.updateProfile({ department: "  finance ", site: "HARBOUR HOUSE" });

  expect(await actor.profile()).toMatchObject({ department: "Finance", site: "Harbour House" });
});

test("a name that is not one of the Organisation's Departments or Sites is refused", async () => {
  await h.setupOrganisation(withDepartmentAndSiteClaims(ministryA));
  await signInAndAcknowledgeAs(h, "ministry-a", bo);
  const actor = await signInAndAcknowledgeAs(h, "ministry-a", ana);

  await expect(actor.updateProfile({ department: "Treasury", site: null })).rejects.toMatchObject({
    name: "InvalidInputError",
    code: "unknown-department",
  });
  await expect(actor.updateProfile({ department: null, site: "Annex" })).rejects.toMatchObject({
    name: "InvalidInputError",
    code: "unknown-site",
  });
  expect(await actor.departmentsAndSites()).toEqual({ departments: ["Finance"], sites: ["Harbour House"] });
});

test("a Member can clear their Department and Site", async () => {
  await h.setupOrganisation(withDepartmentAndSiteClaims(ministryA));
  const actor = await signInAndAcknowledgeAs(h, "ministry-a", { ...ana, ou: "Legal", building: "Harbour House" });

  await actor.updateProfile({ department: null, site: "" });

  expect(await actor.profile()).toMatchObject({ department: null, site: null });

  const again = await signInAndAcknowledgeAs(h, "ministry-a", { ...ana, ou: "Legal", building: "Harbour House" });
  expect(await again.profile()).toMatchObject({ department: null, site: null });
});

test("a Member's own correction survives the next login", async () => {
  await h.setupOrganisation(withDepartmentAndSiteClaims(ministryA));
  await signInAndAcknowledgeAs(h, "ministry-a", bo);
  const actor = await signInAndAcknowledgeAs(h, "ministry-a", { ...ana, ou: "Legal" });
  await actor.updateProfile({ department: "Finance", site: null });

  const again = await signInAndAcknowledgeAs(h, "ministry-a", { ...ana, ou: "Legal" });

  expect(await again.profile()).toMatchObject({ department: "Finance", site: null });
});

test.each([
  { initially: { ou: "Legal" }, expected: { department: null, site: "Harbour House" } },
  { initially: { building: "Harbour House" }, expected: { department: "Legal", site: null } },
])("clearing a populated field leaves the other untouched blank eligible for login data: $initially", async ({ initially, expected }) => {
  await h.setupOrganisation(withDepartmentAndSiteClaims(ministryA));
  const actor = await signInAndAcknowledgeAs(h, "ministry-a", { ...ana, ...initially });
  await actor.updateProfile({ department: null, site: null });

  const again = await signInAndAcknowledgeAs(h, "ministry-a", { ...ana, ou: "Legal", building: "Harbour House" });

  expect(await again.profile()).toMatchObject(expected);
});
