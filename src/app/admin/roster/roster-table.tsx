import type { RosterRow } from "../../../application/index";

export function RosterTable({ rows }: { rows: (RosterRow & { status?: string; label?: string })[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Department</th>
            <th>Site</th>
            <th>Staff identifier</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.email}-${index}`}>
              <td>
                {row.label && (
                  <strong>
                    {row.label}
                    <br />
                  </strong>
                )}
                {row.name}
              </td>
              <td>{row.email}</td>
              <td>{row.department ?? "Not set"}</td>
              <td>{row.site ?? "Not set"}</td>
              <td>{row.staffIdentifier ?? "Not set"}</td>
              <td className="member-status">{row.status ?? "Provisioned"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
