import Link from "next/link";
import { notFound } from "next/navigation";
import { isAccessDeniedError, isInvalidInputError, type Report } from "../../../../application";
import { selectedReportPeriod } from "../../../../web/reports";
import { requireOrganisationAdmin } from "../../../../web/session";
import { ReportPeriodFields, ReportTables } from "../../../_components/report-tables";

export default async function MemberReportPage({ searchParams }: { searchParams: Promise<{ memberId?: string; from?: string; to?: string }> }) {
  const admin = await requireOrganisationAdmin();
  const params = await searchParams;
  const period = selectedReportPeriod(params);
  const memberId = params.memberId ?? "";
  let report: Report | undefined;
  let error: string | undefined;
  try { report = await admin.memberReport(memberId, period); }
  catch (caught) {
    if (isAccessDeniedError(caught)) notFound();
    if (!isInvalidInputError(caught)) throw caught;
    error = caught.message;
  }
  return <>
    <h2>Member report</h2>
    <p><Link href={`/admin/reports?${new URLSearchParams({ ...period })}`}>Back to reports</Link></p>
    <p>Every view and export is recorded in the audit log. Dates and times use UTC.</p>
    <form><input type="hidden" name="memberId" value={memberId} /><ReportPeriodFields period={period} /><button type="submit">Update Member report</button></form>
    {error && <p role="alert">{error}</p>}
    {report && <ReportTables report={report} memberId={memberId} />}
  </>;
}
