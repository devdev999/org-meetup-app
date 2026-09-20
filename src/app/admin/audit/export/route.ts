import { csvDownload } from "../../../../web/reports";
import { requireOrganisationAdmin } from "../../../../web/session";

export async function GET() {
  return csvDownload(async () => (await requireOrganisationAdmin()).exportAuditLog());
}
