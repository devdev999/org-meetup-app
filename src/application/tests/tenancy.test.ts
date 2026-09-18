import { expect, test } from "vitest";
import type { RawClaims } from "../ports";
import { ana, ministryA, ministryB, signInAs, signInForId } from "./fixtures";
import { harness } from "./harness";

const h = harness();

const bo: RawClaims = { sub: "bo-1", email: "bo@ministry-a.example", name: "Bo Chen" };
const cleo: RawClaims = { sub: "cleo-1", email: "cleo@ministry-b.example", name: "Cleo Marsh" };

test("a Member sees a colleague of their own Organisation and nothing of another Organisation's Member", async () => {
  await h.app.bootstrap(ministryA);
  await h.app.bootstrap(ministryB);
  const anaId = await signInForId(h, "ministry-a", ana);
  const cleoId = await signInForId(h, "ministry-b", cleo);
  const boActor = await signInAs(h, "ministry-a", bo);

  expect(await boActor.viewMember(anaId)).toEqual({ memberId: anaId, name: "Ana Silva", department: null, site: null });
  expect(await boActor.viewMember(cleoId)).toBeUndefined();
});

test("the same email signing in with two Organisations' issuers is two separate Members", async () => {
  await h.app.bootstrap(ministryA);
  await h.app.bootstrap(ministryB);

  const inA = await signInAs(h, "ministry-a", ana);
  const inB = await signInAs(h, "ministry-b", ana);

  const profileA = await inA.profile();
  const profileB = await inB.profile();
  expect(profileA.memberId).not.toBe(profileB.memberId);
  expect(profileA.organisation.slug).toBe("ministry-a");
  expect(profileB.organisation.slug).toBe("ministry-b");
});

test("Departments and Sites are settings of one Organisation and never offered to another", async () => {
  await h.app.bootstrap(ministryA);
  await h.app.bootstrap(ministryB);
  const cleoActor = await signInAs(h, "ministry-b", cleo);
  await cleoActor.updateProfile({ department: "Finance", site: "Harbour House" });
  const anaActor = await signInAs(h, "ministry-a", ana);

  expect(await anaActor.departmentsAndSites()).toEqual({ departments: [], sites: [] });

  await anaActor.updateProfile({ department: "Finance", site: null });

  expect(await anaActor.departmentsAndSites()).toEqual({ departments: ["Finance"], sites: [] });
  expect(await cleoActor.departmentsAndSites()).toEqual({ departments: ["Finance"], sites: ["Harbour House"] });
});
