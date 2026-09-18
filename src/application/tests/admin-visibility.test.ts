import { expect, test } from "vitest";
import { ana, ministryA, signInAs, signInForId } from "./fixtures";
import { harness } from "./harness";

const h = harness();

test("a Member must acknowledge the notice before using protected commands and queries", async () => {
  await h.app.bootstrap(ministryA);
  const memberId = await signInForId(h, "ministry-a", ana);
  const actor = await signInAs(h, "ministry-a", ana);
  const noticeRequired = { name: "AdminVisibilityNoticeRequiredError" };

  await expect(actor.updateProfile({ department: null, site: null })).rejects.toMatchObject(noticeRequired);
  await expect(actor.profile()).rejects.toMatchObject(noticeRequired);
  await expect(actor.departmentsAndSites()).rejects.toMatchObject(noticeRequired);
  await expect(actor.viewMember(memberId)).rejects.toMatchObject(noticeRequired);

  await actor.acknowledgeAdminVisibilityNotice();

  expect(await actor.profile()).toMatchObject({ name: "Ana Silva", department: null, site: null });
  expect(await actor.updateProfile({ department: null, site: null })).toMatchObject({ memberId });
  expect(await actor.departmentsAndSites()).toEqual({ departments: [], sites: [] });
  expect(await actor.viewMember(memberId)).toMatchObject({ memberId, name: "Ana Silva" });
});
