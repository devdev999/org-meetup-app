import { expect, test } from "vitest";
import type { BootstrapConfig } from "../index";
import { ana, ministryA, signInAs } from "./fixtures";
import { harness } from "./harness";

const h = harness();

/** Ministry A's issuer also states where people work. */
const ministryAWithPlacement: BootstrapConfig = {
  ...ministryA,
  oidc: {
    ...ministryA.oidc,
    claimMapping: { email: "email", name: "name", department: "ou", site: "building", staffIdentifier: "employee_number" },
  },
};

test("a login that states Department and Site places the Member", async () => {
  await h.app.bootstrap(ministryAWithPlacement);

  const actor = await signInAs(h, "ministry-a", { ...ana, ou: "Finance", building: "Harbour House", employee_number: "E-1001" });

  expect(await actor.profile()).toMatchObject({ department: "Finance", site: "Harbour House" });
});

test("a Member whose login stated no Department or Site fills them in themselves", async () => {
  await h.app.bootstrap(ministryA);
  const actor = await signInAs(h, "ministry-a", ana);
  expect(await actor.profile()).toMatchObject({ department: null, site: null });

  await actor.updateProfile({ department: "Finance", site: "Harbour House" });

  expect(await actor.profile()).toMatchObject({ department: "Finance", site: "Harbour House" });
});

test("Departments and Sites already in the Organisation are offered as choices, in name order", async () => {
  await h.app.bootstrap(ministryAWithPlacement);
  await signInAs(h, "ministry-a", { ...ana, ou: "Finance", building: "Harbour House" });
  const bo = await signInAs(h, "ministry-a", { sub: "bo-1", email: "bo@ministry-a.example", name: "Bo Chen", ou: "Legal" });

  expect(await bo.departmentsAndSites()).toEqual({ departments: ["Finance", "Legal"], sites: ["Harbour House"] });
});

test("naming an existing Department in a different case reuses it instead of adding a second one", async () => {
  await h.app.bootstrap(ministryA);
  const actor = await signInAs(h, "ministry-a", ana);
  await actor.updateProfile({ department: "Finance", site: null });

  await actor.updateProfile({ department: "  finance ", site: null });

  expect(await actor.profile()).toMatchObject({ department: "Finance" });
  expect(await actor.departmentsAndSites()).toEqual({ departments: ["Finance"], sites: [] });
});

test("a Member's own correction survives the next login", async () => {
  await h.app.bootstrap(ministryAWithPlacement);
  const actor = await signInAs(h, "ministry-a", { ...ana, ou: "Finance" });
  await actor.updateProfile({ department: "Treasury", site: null });

  const again = await signInAs(h, "ministry-a", { ...ana, ou: "Finance" });

  expect(await again.profile()).toMatchObject({ department: "Treasury", site: null });
});
