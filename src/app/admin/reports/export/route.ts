import { csvDownload, selectedReportPeriod } from "../../../../web/reports";
import { requireOrganisationAdmin } from "../../../../web/session";

export async function GET(request: Request) {
  return csvDownload(async () => {
    const admin = await requireOrganisationAdmin();
    const query = new URL(request.url).searchParams;
    const period = selectedReportPeriod({ from: query.get("from") ?? undefined, to: query.get("to") ?? undefined });
    const memberId = query.get("memberId");
    const table = query.get("table") ?? "";
    return memberId ? admin.exportMemberReport(memberId, table, period) : admin.exportReport(table, period);
  });
}
