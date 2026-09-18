import type { OrganisationListKind } from "../../../application/index";
import { requireOrganisationAdmin } from "../../../web/session";
import { createListEntry, renameListEntry, retireListEntry } from "./actions";

export default async function ListsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const admin = await requireOrganisationAdmin();
  const lists = await admin.lists();
  const { error } = await searchParams;
  const sections: { kind: OrganisationListKind; title: string; entries: typeof lists.departments }[] = [
    { kind: "department", title: "Departments", entries: lists.departments },
    { kind: "site", title: "Sites", entries: lists.sites },
    { kind: "activity", title: "Activities", entries: lists.activities },
  ];
  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p>Retired entries keep their existing references and are no longer offered as profile choices.</p>
      {sections.map(({ kind, title, entries }) => (
        <section key={kind}>
          <h2>{title}</h2>
          <form action={createListEntry.bind(null, kind)} className="list-entry">
            <label>
              New {kind}
              <input name="name" required />
            </label>
            <button>Add</button>
          </form>
          <ul className="managed-list">
            {entries.map((entry) => (
              <li key={entry.id}>
                <form action={renameListEntry.bind(null, kind, entry.id)} className="list-entry">
                  <label>
                    {entry.retired ? "Retired" : "Name"}
                    <input name="name" defaultValue={entry.name} required aria-label={`${title}: ${entry.name}`} />
                  </label>
                  <button className="secondary">Rename</button>
                </form>
                {!entry.retired && (
                  <form action={retireListEntry.bind(null, kind, entry.id)}>
                    <button className="secondary" aria-label={`Retire ${entry.name}`}>
                      Retire
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
