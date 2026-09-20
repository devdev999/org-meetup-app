import type { AdminAuditEntry } from "../../application";

export function AuditTable({ entries }: { entries: AdminAuditEntry[] }) {
  return <div className="table-scroll" tabIndex={0} role="region" aria-label="Audit entries">
    <table>
      <thead><tr><th>Organisation</th><th>Accessing admin</th><th>Action</th><th>Filters</th><th>Time in UTC</th></tr></thead>
      <tbody>{entries.map((entry) => <tr key={entry.id}>
        <td>{entry.organisationName}</td><td>{entry.actorName}<br /><small>{entry.actorMemberId}</small></td><td>{entry.action}</td>
        <td className="audit-filters">{JSON.stringify(entry.filter)}</td><td>{entry.createdAt.toISOString()}</td>
      </tr>)}</tbody>
    </table>
    {!entries.length && <p>No audit entries recorded yet.</p>}
  </div>;
}
