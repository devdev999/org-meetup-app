import { parse } from "csv-parse/sync";
import { InvalidInputError, type RosterRow } from "../../application/index";

export function parseRosterCsv(csv: string): RosterRow[] {
  let records: string[][];
  try {
    records = parse(csv.replace(/\r\n?/g, "\n"), { bom: true, trim: true, skip_empty_lines: true });
  } catch {
    throw new InvalidInputError("invalid-roster", "the CSV has an invalid row or quotation mark");
  }
  const [header, ...rows] = records;
  const columns = header?.map((column) => column.toLowerCase().replace(/[\s_-]/g, "")) ?? [];
  const required = ["email", "name", "department", "site"];
  if (
    !required.every((column) => columns.includes(column)) ||
    new Set(columns).size !== columns.length ||
    columns.some((column) => ![...required, "staffidentifier"].includes(column))
  ) {
    throw new InvalidInputError(
      "invalid-roster",
      "use email, name, Department, Site and optional staff identifier as the CSV columns",
    );
  }
  return rows.map((row) => {
    const value = (column: string) => row[columns.indexOf(column)]?.trim() || null;
    return {
      email: value("email") ?? "",
      name: value("name") ?? "",
      department: value("department"),
      site: value("site"),
      staffIdentifier: value("staffidentifier"),
    };
  });
}
