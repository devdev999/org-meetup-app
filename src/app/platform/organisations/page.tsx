import Link from "next/link";
import { requirePlatformAdmin } from "../../../web/session";
import { ActionForm } from "../action-form";
import { createOrganisation, setFirstOrganisationAdmin } from "../actions";

export default async function OrganisationsPage() {
  const admin = await requirePlatformAdmin();
  const organisations = await admin.organisations();
  return <>
    <h2>Organisations</h2>
    <ul className="member-list">{organisations.map((organisation) => <li key={organisation.id}>
      <h3>{organisation.name}</h3>
      <p>{organisation.signInReady ? "Ready for sign-in" : "Sign-in awaiting OIDC credential"}</p>
      <dl className="organisation-details">
        <dt>Sign-in identifier</dt><dd>{organisation.slug}</dd>
        <dt>Issuer</dt><dd>{organisation.oidc.issuer}</dd>
        <dt>Client ID</dt><dd>{organisation.oidc.clientId}</dd>
        <dt>Credential reference</dt><dd>{organisation.oidc.credentialRef ?? "Public client"}</dd>
      </dl>
      {!organisation.signInReady && <p>An operator must install the credential under this reference in the environment and restart the services.</p>}
      {organisation.hasOrganisationAdmin ? <p>First Organisation Admin appointed.</p> : <details>
        <summary>Appoint the first Organisation Admin</summary>
        <ActionForm action={setFirstOrganisationAdmin.bind(null, organisation.id)} label="Appoint Organisation Admin">
          <label>Name<input name="name" required maxLength={120} /></label>
          <label>Email<input name="email" type="email" required /></label>
        </ActionForm>
      </details>}
      <p><Link href={`/platform/reports?kind=organisation&id=${organisation.id}`}>View aggregate reports</Link></p>
    </li>)}</ul>
    <section>
      <h2>Create an Organisation</h2>
      <p>The first Organisation Admin can sign in with the email below. Starter Interests and Activities are added automatically.</p>
      <ActionForm action={createOrganisation} label="Create Organisation">
        <label>Organisation name<input name="name" required maxLength={120} /></label>
        <label>Sign-in identifier<input name="slug" required maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="agency-name" /></label>
        <label>OIDC issuer<input name="issuer" type="url" required /></label>
        <label>OIDC client ID<input name="clientId" required maxLength={120} /></label>
        <label>Credential reference, optional<input name="credentialRef" maxLength={200} pattern="[A-Za-z0-9][A-Za-z0-9_.-]*" /></label>
        <p>Leave the reference blank for a public client. For a client that requires a secret, enter the reference an operator uses for its environment credential.</p>
        <fieldset>
          <legend>OIDC claim names</legend>
          <label>Email claim<input name="claim-email" required defaultValue="email" /></label>
          <label>Name claim<input name="claim-name" required defaultValue="name" /></label>
          <label>Department claim, optional<input name="claim-department" /></label>
          <label>Site claim, optional<input name="claim-site" /></label>
          <label>Staff identifier claim, optional<input name="claim-staffIdentifier" /></label>
        </fieldset>
        <fieldset>
          <legend>First Organisation Admin</legend>
          <label>Organisation Admin name<input name="adminName" required maxLength={120} /></label>
          <label>Organisation Admin email<input name="adminEmail" type="email" required /></label>
        </fieldset>
      </ActionForm>
    </section>
  </>;
}
