import { expect, test } from "vitest";
import type { RawClaims } from "../ports";
import { ana, ministryA, ministryB, signInAndAcknowledgeAs, signInForId, withDepartmentAndSiteClaims } from "./fixtures";
import { harness } from "./harness";

const h = harness();

const bo: RawClaims = { sub: "bo-1", email: "bo@ministry-a.example", name: "Bo Chen" };
const cleo: RawClaims = { sub: "cleo-1", email: "cleo@ministry-b.example", name: "Cleo Marsh" };

test("a Member sees another Member of their own Organisation and nothing of another Organisation's Member", async () => {
  await h.app.bootstrap(ministryA);
  await h.app.bootstrap(ministryB);
  const anaId = await signInForId(h, "ministry-a", ana);
  const cleoId = await signInForId(h, "ministry-b", cleo);
  const boActor = await signInAndAcknowledgeAs(h, "ministry-a", bo);

  expect(await boActor.viewMember(anaId)).toEqual({ memberId: anaId, name: "Ana Silva", department: null, site: null, interests: [] });
  expect(await boActor.viewMember(cleoId)).toBeUndefined();
});

test("the same email signing in with two Organisations' issuers is two separate Members", async () => {
  await h.app.bootstrap(ministryA);
  await h.app.bootstrap(ministryB);

  const inA = await signInAndAcknowledgeAs(h, "ministry-a", ana);
  const inB = await signInAndAcknowledgeAs(h, "ministry-b", ana);

  const profileA = await inA.profile();
  const profileB = await inB.profile();
  expect(profileA.memberId).not.toBe(profileB.memberId);
  expect(profileA.organisation.slug).toBe("ministry-a");
  expect(profileB.organisation.slug).toBe("ministry-b");
});

test("Departments and Sites are settings of one Organisation: never offered to, nor choosable by, another", async () => {
  await h.app.bootstrap(ministryA);
  await h.app.bootstrap(withDepartmentAndSiteClaims(ministryB));
  const cleoActor = await signInAndAcknowledgeAs(h, "ministry-b", { ...cleo, ou: "Finance", building: "Harbour House" });
  const anaActor = await signInAndAcknowledgeAs(h, "ministry-a", ana);

  expect(await anaActor.departmentsAndSites()).toEqual({ departments: [], sites: [] });
  await expect(anaActor.updateProfile({ department: "Finance", site: null })).rejects.toMatchObject({
    code: "unknown-department",
  });
  await expect(anaActor.updateProfile({ department: null, site: "Harbour House" })).rejects.toMatchObject({
    code: "unknown-site",
  });
  expect(await cleoActor.profile()).toMatchObject({ department: "Finance", site: "Harbour House" });
});
