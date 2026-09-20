import { InvalidInputError } from "./errors";
import type { Report, ReportPeriod, ReportTable } from "./report-types";

export interface ReportCsv { filename: string; content: string }

export function exportReportTable(report: Report, tableId: string): ReportCsv {
  const table = report.tables.find((entry) => entry.id === tableId);
  if (!table) throw new InvalidInputError("invalid-report", "Choose a table from this report.");
  return tableCsv(table, report.period, report.timeZone);
}

export function tableCsv(table: ReportTable, period?: ReportPeriod, timeZone = "UTC"): ReportCsv {
  const rows = [["Report", table.title], ...(period ? [["From", period.from], ["Through", period.to]] : []),
    ["Time zone", timeZone], ["Basis", table.basis], [], table.columns, ...table.rows];
  const content = rows.map((row) => row.map((cell) => {
    let text = cell === null ? "" : String(cell);
    if (typeof cell === "string" && /^\s*[=+@-]/u.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n");
  return { filename: `${table.id}${period ? `-${period.from}-${period.to}` : ""}.csv`, content: `\uFEFF${content}\r\n` };
}
