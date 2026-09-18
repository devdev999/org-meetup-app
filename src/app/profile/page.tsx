import { requireMemberPastWelcome } from "../../web/session";
import { signOut, updateProfile } from "./actions";

export default async function ProfilePage() {
  const member = await requireMemberPastWelcome();
  const [profile, choices] = await Promise.all([member.profile(), member.departmentsAndSites()]);

  return (
    <main>
      <h1>{profile.name}</h1>
      <dl>
        <dt>Organisation</dt>
        <dd>{profile.organisation.name}</dd>
        <dt>Email</dt>
        <dd>{profile.email}</dd>
        <dt>Department</dt>
        <dd>{profile.department ?? <span className="muted">Not set</span>}</dd>
        <dt>Site</dt>
        <dd>{profile.site ?? <span className="muted">Not set</span>}</dd>
        {profile.isPlatformAdmin && (
          <>
            <dt>Role</dt>
            <dd>Platform Admin</dd>
          </>
        )}
      </dl>

      <h2>Where you work</h2>
      <p className="muted">
        {profile.department === null || profile.site === null
          ? "Your login did not tell us all of this. Fill it in so colleagues can find you."
          : "Correct these if they are wrong."}
      </p>
      <form action={updateProfile}>
        <label>
          Department
          <input name="department" list="department-choices" defaultValue={profile.department ?? ""} autoComplete="off" />
        </label>
        <datalist id="department-choices">
          {choices.departments.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <label>
          Site
          <input name="site" list="site-choices" defaultValue={profile.site ?? ""} autoComplete="off" />
        </label>
        <datalist id="site-choices">
          {choices.sites.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <button type="submit">Save</button>
      </form>

      <form action={signOut}>
        <button type="submit" className="secondary">
          Sign out
        </button>
      </form>
    </main>
  );
}
