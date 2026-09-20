import { csvDownload } from "../../../../web/reports";
import { requirePlatformAdmin } from "../../../../web/session";

export async function GET() {
  return csvDownload(async () => (await requirePlatformAdmin()).exportAuditLog());
}
