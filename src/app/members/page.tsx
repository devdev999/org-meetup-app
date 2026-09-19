import Link from "next/link";
import { requireMemberPastWelcome } from "../../web/session";
import { InterestGroups } from "../_components/interest-groups";

type SearchParameters = { interest?: string | string[]; department?: string | string[]; site?: string | string[] };

export default async function MembersPage({ searchParams }: { searchParams: Promise<SearchParameters> }) {
  const { member } = await requireMemberPastWelcome();
  const parameters = await searchParams;
  const interest = typeof parameters.interest === "string" ? parameters.interest.trim() : "";
  const department = typeof parameters.department === "string" ? parameters.department.trim() : "";
  const site = typeof parameters.site === "string" ? parameters.site.trim() : "";
  const [choices, catalog, members] = await Promise.all([
    member.departmentsAndSites(),
    member.interests(),
    member.searchMembers({ interest, department, site }),
  ]);
  return (
    <main>
      <nav className="member-nav" aria-label="Member navigation"><Link href="/profile">Your profile</Link><Link href="/interests">Your Interests</Link></nav>
      <h1>Find Members</h1>
      <p>Browse Members in your Organisation by Interest, Department and Site.</p>
      <form action="/members">
        <label>
          Interest
          <input name="interest" defaultValue={interest} list="interest-catalog" placeholder="Any Interest" />
          <datalist id="interest-catalog">
            {catalog.map((item) => <option key={item.interestId} value={item.name}>{item.kind === "skill" ? "Skill" : "Hobby"}</option>)}
          </datalist>
        </label>
        <label>
          Department
          <select name="department" defaultValue={department}>
            <option value="">Any Department</option>
            {department && !choices.departments.includes(department) && <option value={department}>{department}</option>}
            {choices.departments.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label>
          Site
          <select name="site" defaultValue={site}>
            <option value="">Any Site</option>
            {site && !choices.sites.includes(site) && <option value={site}>{site}</option>}
            {choices.sites.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <div className="form-actions"><button>Search Members</button><Link href="/members">Clear filters</Link></div>
      </form>
      <h2>{`${members.length} ${members.length === 1 ? "Member" : "Members"}`}</h2>
      {members.length === 0 ? <p className="muted">No Members match these filters.</p> : (
        <ul className="member-list">
          {members.map((person) => (
            <li key={person.memberId} className="notice">
              <h2><Link href={`/members/${person.memberId}`}>{person.name}</Link></h2>
              <dl>
                <dt>Department</dt><dd>{person.department ?? "Not set"}</dd>
                <dt>Site</dt><dd>{person.site ?? "Not set"}</dd>
              </dl>
              <InterestGroups interests={person.interests} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
