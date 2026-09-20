import { isInvalidInputError, type Report } from "../../../application";
import { selectedReportPeriod } from "../../../web/reports";
import { requireOrganisationAdmin } from "../../../web/session";
import { ReportPeriodFields, ReportTables } from "../../_components/report-tables";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const admin = await requireOrganisationAdmin();
  const period = await selectedReportPeriod(await searchParams);
  let report: Report | undefined;
  let error: string | undefined;
  try { report = await admin.reports(period); }
  catch (caught) {
    if (!isInvalidInputError(caught)) throw caught;
    error = caught.message;
  }
  const roster = await admin.roster();
  return <>
    <h2>Reports</h2>
    <p>Dates include both endpoints and use {report?.timeZone ?? "the deployment time zone"}. Each table states which population and dates it uses.</p>
    <form><ReportPeriodFields period={period} /><button type="submit">Update reports</button></form>
    {error && <p role="alert">{error}</p>}
    <section>
      <h3>Individual Member report</h3>
      <form action="/admin/reports/member">
        <input type="hidden" name="from" value={period.from} /><input type="hidden" name="to" value={period.to} />
        <label>Member<select name="memberId" required defaultValue="">
          <option value="" disabled>Choose a Member</option>
          {roster.map((member) => <option key={member.memberId} value={member.memberId}>{member.name}, {member.email}</option>)}
        </select></label>
        <button type="submit">View Member report</button>
      </form>
      <p>Individual views and every export are recorded in the audit log. Historical reports include Suspended and Departed Members.</p>
    </section>
    {report && <ReportTables report={report} />}
  </>;
}
