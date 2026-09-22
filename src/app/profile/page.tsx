import Link from "next/link";
import { Avatar } from "../_components/ui";
import { requireMemberPastWelcome } from "../../web/session";
import { signOut, updateProfile } from "./actions";

export default async function ProfilePage() {
  const { member, profile } = await requireMemberPastWelcome();
  const choices = await member.departmentsAndSites();
  const nothingToChoose =
    choices.departments.length === 0 &&
    choices.sites.length === 0 &&
    profile.department === null &&
    profile.site === null;

  return (
    <main className="profile-layout">
      <aside className="profile-card">
        <Avatar name={profile.name} large />
        <h1>{profile.name}</h1>
        {profile.isOrganisationAdmin && (
          <p>
            <Link href="/admin">Open Organisation Admin area</Link>
          </p>
        )}
        {profile.isPlatformAdmin && (
          <p>
            <Link href="/platform">Open Platform Admin area</Link>
          </p>
        )}
        <dl>
          <dt>Organisation</dt>
          <dd>{profile.organisation.name}</dd>
          <dt>Email</dt>
          <dd>{profile.email}</dd>
          <dt>Department</dt>
          <dd>
            {profile.department ?? <span className="muted">Not set</span>}
          </dd>
          <dt>Site</dt>
          <dd>{profile.site ?? <span className="muted">Not set</span>}</dd>
          {profile.isPlatformAdmin && (
            <>
              <dt>Role</dt>
              <dd>Platform Admin</dd>
            </>
          )}
        </dl>
      </aside>
      <div className="profile-content">
        <nav className="profile-links" aria-label="Your account">
          <Link href="/attendance">Your Attendance history</Link>
          <Link href="/notifications">Notification settings</Link>
          <Link href="/inbox">Your inbox</Link>
        </nav>

        <h2>Where you work</h2>
        {nothingToChoose ? (
          <p className="muted">
            Your Organisation has no Departments or Sites listed yet. Your
            Organisation Admin adds them; until then there is nothing to choose
            from.
          </p>
        ) : (
          <>
            <p className="muted">
              {profile.department === null || profile.site === null
                ? "Your login did not tell us all of this. Choose so other Members can find you."
                : "Correct these if they are wrong."}
            </p>
            <form action={updateProfile}>
              <label>
                Department
                <select
                  name="department"
                  defaultValue={profile.department ?? ""}
                >
                  <option value="">Not set</option>
                  {profile.department &&
                    !choices.departments.includes(profile.department) && (
                      <option value={profile.department}>
                        {profile.department}, retired
                      </option>
                    )}
                  {choices.departments.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Site
                <select name="site" defaultValue={profile.site ?? ""}>
                  <option value="">Not set</option>
                  {profile.site && !choices.sites.includes(profile.site) && (
                    <option value={profile.site}>
                      {profile.site}, retired
                    </option>
                  )}
                  {choices.sites.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit">Save</button>
            </form>
          </>
        )}

        <form action={signOut}>
          <button type="submit" className="secondary">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
