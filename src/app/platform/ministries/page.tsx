import Link from "next/link";
import { requirePlatformAdmin } from "../../../web/session";
import { ActionForm } from "../../_components/action-form";
import { assignMinistry, createMinistry } from "../actions";

export default async function MinistriesPage() {
  const admin = await requirePlatformAdmin();
  const [ministries, organisations] = await Promise.all([admin.ministries(), admin.organisations()]);
  return <>
    <h2>Ministries</h2>
    <p>A Ministry groups Organisations for aggregate reports.</p>
    {ministries.length ? <ul>{ministries.map((ministry) => <li key={ministry.id}>
      <Link href={`/platform/reports?kind=ministry&id=${ministry.id}`}>{ministry.name}</Link>, {organisations.filter((organisation) => organisation.ministryId === ministry.id).length} Organisations
    </li>)}</ul> : <p>No Ministries have been created.</p>}
    <ActionForm action={createMinistry} label="Create Ministry">
      <label>Ministry name<input name="name" required maxLength={120} /></label>
    </ActionForm>
    <h3>Organisation grouping</h3>
    {organisations.map((organisation) => <section key={organisation.id}>
      <h4>{organisation.name}</h4>
      <ActionForm action={assignMinistry.bind(null, organisation.id)} label="Save grouping">
        <label>Ministry for {organisation.name}<select name="ministryId" defaultValue={organisation.ministryId ?? ""}>
          <option value="">No Ministry</option>
          {ministries.map((ministry) => <option key={ministry.id} value={ministry.id}>{ministry.name}</option>)}
        </select></label>
      </ActionForm>
    </section>)}
  </>;
}
