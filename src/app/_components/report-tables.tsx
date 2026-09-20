import type { Report, ReportPeriod } from "../../application";

export function ReportPeriodFields({ period }: { period: ReportPeriod }) {
  return <>
    <label>From<input type="date" name="from" defaultValue={period.from} required /></label>
    <label>Through<input type="date" name="to" defaultValue={period.to} required /></label>
  </>;
}

export function ReportTables({ report, memberId, exportPath = "/admin/reports/export", filters = {} }: { report: Report; memberId?: string; exportPath?: string; filters?: Record<string, string> }) {
  return <>{report.tables.map((table) => {
    const query = new URLSearchParams({ ...filters, ...report.period, table: table.id, ...(memberId ? { memberId } : {}) });
    return <section key={table.id} className="report-section">
      <h3 id={table.id}>{table.title}</h3>
      <p>{table.basis}</p>
      <p><a href={`${exportPath}?${query}`} download>Export {table.title} as CSV</a></p>
      <div className="table-scroll" tabIndex={0} role="region" aria-labelledby={table.id}>
        <table>
          <thead><tr>{table.columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
          <tbody>{table.rows.length ? table.rows.map((row, index) => <tr key={index}>
            {row.map((cell, cellIndex) => <td key={cellIndex}>{cell ?? "Not available"}</td>)}
          </tr>) : <tr><td colSpan={table.columns.length}>No data for this table.</td></tr>}</tbody>
        </table>
      </div>
    </section>;
  })}</>;
}
