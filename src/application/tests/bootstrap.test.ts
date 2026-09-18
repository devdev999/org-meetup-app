import { expect, test } from "vitest";
import { ana, ministryA, ministryB, signInAndAcknowledgeAs } from "./fixtures";
import { harness } from "./harness";

const h = harness();

test("bootstrap seeds the first Organisation, which then appears as a sign-in option", async () => {
  await h.app.bootstrap(ministryA);

  expect(await h.app.signInOptions()).toEqual([{ slug: "ministry-a", name: "Ministry A" }]);
});

test("running bootstrap again changes nothing", async () => {
  await h.app.bootstrap(ministryA);
  await h.app.bootstrap(ministryA);

  expect(await h.app.signInOptions()).toEqual([{ slug: "ministry-a", name: "Ministry A" }]);
});

test("bootstrap of a second Organisation adds a second sign-in option, in name order", async () => {
  await h.app.bootstrap(ministryB);
  await h.app.bootstrap(ministryA);

  expect(await h.app.signInOptions()).toEqual([
    { slug: "ministry-a", name: "Ministry A" },
    { slug: "ministry-b", name: "Ministry B" },
  ]);
});

test("bootstrap supplies profile choices when the login has no Department or Site claims", async () => {
  await h.app.bootstrap({
    ...ministryA,
    organisation: { ...ministryA.organisation, departments: ["Finance"], sites: ["Harbour House"] },
  });
  const actor = await signInAndAcknowledgeAs(h, "ministry-a", ana);

  expect(await actor.departmentsAndSites()).toEqual({ departments: ["Finance"], sites: ["Harbour House"] });
  expect(await actor.profile()).toMatchObject({ department: null, site: null });
  await actor.updateProfile({ department: "Finance", site: "Harbour House" });
  expect(await actor.profile()).toMatchObject({ department: "Finance", site: "Harbour House" });
});

test("repeated bootstrap adds choices without duplicating names or removing existing choices", async () => {
  await h.app.bootstrap({
    ...ministryA,
    organisation: { ...ministryA.organisation, departments: ["Finance"], sites: ["Harbour House"] },
  });
  const actor = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  await actor.updateProfile({ department: "Finance", site: "Harbour House" });

  const updated = {
    ...ministryA,
    organisation: { ...ministryA.organisation, departments: [" finance ", "Legal"], sites: ["HARBOUR HOUSE"] },
  };
  await h.app.bootstrap(updated);
  await h.app.bootstrap(updated);
  await h.app.bootstrap(ministryA);

  expect(await actor.departmentsAndSites()).toEqual({ departments: ["Finance", "Legal"], sites: ["Harbour House"] });
  expect(await actor.profile()).toMatchObject({ department: "Finance", site: "Harbour House" });
});

test("bootstrap choices belong only to the configured Organisation", async () => {
  await h.app.bootstrap({
    ...ministryA,
    organisation: { ...ministryA.organisation, departments: ["Finance"], sites: ["Harbour House"] },
  });
  await h.app.bootstrap(ministryB);
  const other = await signInAndAcknowledgeAs(h, "ministry-b", ana);

  expect(await other.departmentsAndSites()).toEqual({ departments: [], sites: [] });
  await expect(other.updateProfile({ department: "Finance", site: null })).rejects.toMatchObject({
    code: "unknown-department",
  });
  await expect(other.updateProfile({ department: null, site: "Harbour House" })).rejects.toMatchObject({
    code: "unknown-site",
  });
});
