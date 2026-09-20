import { csvDownload } from "../../../../web/reports";
import { requireOrganisationAdmin } from "../../../../web/session";

export async function GET(request: Request) {
  return csvDownload(async () => {
    const admin = await requireOrganisationAdmin();
    const memberId = new URL(request.url).searchParams.get("memberId");
    return memberId ? admin.exportMemberAttendance(memberId) : admin.exportRatings();
  });
}
