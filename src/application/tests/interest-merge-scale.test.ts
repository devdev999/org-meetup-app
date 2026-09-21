import { expect, test } from "vitest";
import type { MemberActions } from "../index";
import { ministryA, signInAndAcknowledgeAs } from "./fixtures";
import { harness } from "./harness";

const h = harness();

test("splitting a large Organisation's Interest merge restores every Member's declarations", async () => {
  await h.setupOrganisation(ministryA);
  const names = Array.from({ length: 100 }, (_, index) => `Database language ${String(index + 1).padStart(3, "0")}`);
  const members: MemberActions[] = [];
  for (let start = 0; start < 132; start += 6) {
    await Promise.all(Array.from({ length: 6 }, async (_, offset) => {
      const index = start + offset;
      const member = await signInAndAcknowledgeAs(h, "ministry-a", {
        sub: `member-${index}`, name: `Member ${index}`, email: `member-${index}@example.test`,
      });
      members.push(member);
      for (const name of names) await member.confirmInterest({ phrase: name, selection: { name, kind: "skill" }, stance: "shares" });
    }));
  }
  const admin = await h.organisationAdmin();
  h.ai.clusteringResponses.push([names]);
  await admin.proposeInterestMerges();
  const proposal = (await admin.interestMergeProposals())[0]!;
  await admin.approveInterestMerge(proposal.id, proposal.interests[0]!.interestId);
  expect(await members[0]!.myInterests()).toHaveLength(1);

  await admin.splitInterestMerge(proposal.id);

  for (const member of members) {
    expect((await member.myInterests()).map(({ name, stance }) => ({ name, stance })))
      .toEqual(names.map((name) => ({ name, stance: "shares" })));
  }
  expect((await admin.interestMergeHistory())[0]).toMatchObject({ splitAt: h.clock.now(), canSplit: false });
}, 300_000);
