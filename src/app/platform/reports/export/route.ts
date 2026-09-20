import { csvDownload, selectedPlatformScope, selectedReportPeriod } from "../../../../web/reports";
import { requirePlatformAdmin } from "../../../../web/session";

export async function GET(request: Request) {
  return csvDownload(async () => {
    const admin = await requirePlatformAdmin();
    const query = new URL(request.url).searchParams;
    const scope = selectedPlatformScope({ kind: query.get("kind") ?? undefined, id: query.get("id") ?? undefined });
    const period = await selectedReportPeriod({ from: query.get("from") ?? undefined, to: query.get("to") ?? undefined });
    return admin.exportReport(scope, query.get("table") ?? "", period);
  });
}
