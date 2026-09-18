import { requireOrganisationAdmin } from "../../../web/session";

export default async function AuditPage() {
  const admin = await requireOrganisationAdmin();
  const entries = await admin.auditLog();
  return (
    <>
      <h2>Audit log</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Organisation Admin</th>
              <th>Viewed</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.actorName}</td>
                <td>{entry.action.replaceAll("-", " ")}</td>
                <td>{entry.createdAt.toISOString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
