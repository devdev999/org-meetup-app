import { z } from "zod";
import type { OrganisationAdminActions } from "./organisation-admin";
import type { ScoutTool } from "./scout";
import type { Report, ReportPeriod } from "./report-types";

const emptySchema = z.strictObject({});
const periodSchema = z.strictObject({ from: z.iso.date().nullable(), to: z.iso.date().nullable() });

function limitedReport(report: Report) {
  return { ...report, tables: report.tables.map((table) => ({ ...table, rows: table.rows.slice(0, 20), totalRows: table.rows.length })) };
}

function reportHref(period: ReportPeriod): string {
  return `/admin/reports?from=${period.from}&to=${period.to}`;
}

export function adminScoutTools(reads: Pick<OrganisationAdminActions, "interestMergeProposals" | "reports">, defaultPeriod: ReportPeriod): ScoutTool[] {
  return [{
    definition: { name: "duplicate_interests", description: "Existing duplicate Interest proposals in your Organisation's merge queue. Reading the queue does not generate proposals or merge Interests.",
      parameters: z.toJSONSchema(emptySchema) },
    read: async (input) => {
      emptySchema.parse(input);
      const entries = await reads.interestMergeProposals();
      return { data: { items: entries.slice(0, 20), total: entries.length }, links: [
        { label: "Interest merge queue", href: "/admin/interests#interest-merge-queue" },
        { label: "Interest list", href: "/admin/interests#interest-catalog" },
      ] };
    },
  }, {
    definition: { name: "unshared_seeks", description: "Interests that current Active Members in your Organisation Seek but nobody Shares, from the normal report. This is current Interest data, independent of the selected report period. Rows may be limited; totalRows gives the full number of Interests.",
      parameters: z.toJSONSchema(emptySchema) },
    read: async (input) => {
      emptySchema.parse(input);
      const report = await reads.reports(defaultPeriod, "unmet-seeks");
      return { data: limitedReport(report), links: [
        { label: "Interest list", href: "/admin/interests#interest-catalog" },
        { label: "Seeks with no Shares", href: `${reportHref(report.period)}#unmet-seeks` },
      ] };
    },
  }, {
    definition: { name: "report_headlines", description: "Aggregate figures from your Organisation's normal dashboard. Dates are inclusive YYYY-MM-DD in the deployment time zone. Null from means the first day of this month; null to means today. Preserve each table's population and date basis. Rows may be limited; totalRows is the full row count. Never sum truncated rows as an Organisation total.",
      parameters: z.toJSONSchema(periodSchema) },
    read: async (input) => {
      const selected = periodSchema.parse(input);
      const report = await reads.reports({ from: selected.from ?? defaultPeriod.from, to: selected.to ?? defaultPeriod.to });
      return { data: limitedReport(report), links: [{ label: "Reports", href: reportHref(report.period) }] };
    },
  }];
}
