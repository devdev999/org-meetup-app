import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Queryable } from "./departments-and-sites";
import { InvalidInputError } from "./errors";
import { ministries, organisations } from "./schema";
import { aggregateReport } from "./reports";
import type { Report, ReportPeriod } from "./report-types";

const scopeSchema = z.object({ kind: z.enum(["organisation", "ministry"]), id: z.uuid() }).strict();
export type PlatformReportScope = z.infer<typeof scopeSchema>;

export async function platformReport(db: Queryable, input: PlatformReportScope, period: ReportPeriod, now: Date, tableId?: string): Promise<Report> {
  const parsed = scopeSchema.safeParse(input);
  if (!parsed.success) throw new InvalidInputError("invalid-report", "Choose an Organisation or Ministry.");
  const scope = parsed.data;
  const table = scope.kind === "ministry" ? ministries : organisations;
  const [selected] = await db.select({ name: table.name }).from(table).where(eq(table.id, scope.id));
  if (!selected) throw new InvalidInputError("invalid-report", "Choose an existing Organisation or Ministry.");
  const included = await db.select({ id: organisations.id }).from(organisations)
    .where(scope.kind === "ministry" ? eq(organisations.ministryId, scope.id) : eq(organisations.id, scope.id));
  const ids = included.map((organisation) => organisation.id);
  await db.select({ id: organisations.id }).from(organisations).where(inArray(organisations.id, ids)).orderBy(organisations.id).for("update");
  const report = await aggregateReport(db, ids, period, now, tableId);
  const basis = scope.kind === "ministry"
    ? `Ministry: ${selected.name}. Combined counts for its ${ids.length} Organisations. Departments, Sites and Activities group by exact name; Interests group by exact name and kind. Availability overlaps stay within each Organisation.`
    : `Organisation: ${selected.name}.`;
  return { ...report, tables: report.tables.map((entry) => ({ ...entry, basis: `${basis} ${entry.basis}` })) };
}
