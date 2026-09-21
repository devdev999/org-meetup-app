import { requireOrganisationAdmin } from "../../../web/session";
import { ActionForm } from "../../_components/action-form";
import { MeetupTime } from "../../meetups/meetup-time";
import { approveInterestMerge, proposeInterestMerges, splitInterestMerge, updateInterest } from "./actions";

export default async function InterestsPage() {
  const admin = await requireOrganisationAdmin();
  const [interests, proposals, history] = await Promise.all([admin.interests(), admin.interestMergeProposals(), admin.interestMergeHistory()]);
  return <>
    <h2>Interests</h2>
    <p>Review suggested duplicates, choose which Interest survives, or edit a name and kind.</p>
    <ActionForm action={proposeInterestMerges} label="Find duplicate Interests">
      <p>AI suggests duplicates each day. You can run another check now.</p>
    </ActionForm>
    <section aria-labelledby="interest-merge-queue">
      <h2 id="interest-merge-queue">Merge proposals</h2>
      {proposals.length === 0 ? <p>No merge proposals to review.</p> : <ul className="member-list">{proposals.map((proposal) => <li key={proposal.id}>
        <h3>{proposal.interests.map(({ name }) => name).join(" / ")}</h3>
        <ul>{proposal.interests.map((interest) => <li key={interest.interestId}>{interest.name}: {interest.count} {interest.count === 1 ? "Member" : "Members"}</li>)}</ul>
        <ActionForm action={approveInterestMerge.bind(null, proposal.id)} label="Approve merge">
          <label>Surviving Interest<select name="survivingInterestId">{proposal.interests.map((interest) =>
            <option key={interest.interestId} value={interest.interestId}>{interest.name}</option>)}</select></label>
          <p>The most recent Stance wins. Meetups and Events use the surviving Interest. You can split the merge later.</p>
        </ActionForm>
      </li>)}</ul>}
    </section>
    <section aria-labelledby="interest-merge-history">
      <h2 id="interest-merge-history">Merge history</h2>
      {history.length === 0 ? <p>No recorded merges.</p> : <ul className="member-list">{history.map((merge) => <li key={merge.id}>
        <h3>{merge.mergedInterests.map(({ name }) => name).join(", ")} merged into {merge.survivingInterest.name}</h3>
        <p>Merged <MeetupTime value={merge.mergedAt.toISOString()} />.</p>
        {merge.splitAt ? <p>Split <MeetupTime value={merge.splitAt.toISOString()} />.</p> : merge.canSplit ?
          <ActionForm action={splitInterestMerge.bind(null, merge.id)} label="Split merge">
            <p>Restore the original Interests and Aliases. Restore declarations and relevant Interests only where they remain untouched. Keep later Member and Host choices.</p>
          </ActionForm> : <p>Split a later merge involving these Interests first.</p>}
      </li>)}</ul>}
    </section>
    <section aria-labelledby="interest-catalog">
      <h2 id="interest-catalog">Interest list</h2>
      <ul className="member-list">{interests.map((interest) => <li key={`${interest.interestId}:${interest.name}:${interest.kind}`}>
        <details>
          <summary>Edit {interest.name}</summary>
          <ActionForm action={updateInterest.bind(null, interest.interestId)} label="Save Interest">
            <label>Interest name<input name="name" defaultValue={interest.name} required maxLength={120} /></label>
            <label>Kind<select name="kind" defaultValue={interest.kind}><option value="skill">Skill</option><option value="hobby">Hobby</option></select></label>
          </ActionForm>
        </details>
      </li>)}</ul>
    </section>
  </>;
}
