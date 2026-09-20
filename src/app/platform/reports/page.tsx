import { isInvalidInputError, type Report } from "../../../application";
import { selectedPlatformScope, selectedReportPeriod } from "../../../web/reports";
import { requirePlatformAdmin } from "../../../web/session";
import { ReportPeriodFields, ReportTables } from "../../_components/report-tables";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ scope?: string; kind?: string; id?: string; from?: string; to?: string }> }) {
  const admin = await requirePlatformAdmin();
  const [organisations, ministries, params] = await Promise.all([admin.organisations(), admin.ministries(), searchParams]);
  const period = await selectedReportPeriod(params);
  let scope = selectedPlatformScope({}, organisations[0]!.id);
  let report: Report | undefined;
  let error: string | undefined;
  try {
    scope = selectedPlatformScope(params, organisations[0]!.id);
    report = await admin.reports(scope, period);
  } catch (caught) {
    if (!isInvalidInputError(caught)) throw caught;
    error = caught.message;
  }
  return <>
    <h2>Aggregate reports</h2>
    <p>Dates include both endpoints and use {report?.timeZone ?? "the deployment time zone"}. Each table states its population and grouping rules.</p>
    <form>
      <label>Organisation or Ministry<select name="scope" defaultValue={`${scope.kind}:${scope.id}`}>
        <optgroup label="Organisations">{organisations.map((organisation) => <option key={organisation.id} value={`organisation:${organisation.id}`}>{organisation.name}</option>)}</optgroup>
        <optgroup label="Ministries">{ministries.map((ministry) => <option key={ministry.id} value={`ministry:${ministry.id}`}>{ministry.name}</option>)}</optgroup>
      </select></label>
      <ReportPeriodFields period={period} />
      <button type="submit">Update reports</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {report && <ReportTables report={report} exportPath="/platform/reports/export" filters={{ kind: scope.kind, id: scope.id }} />}
  </>;
}
