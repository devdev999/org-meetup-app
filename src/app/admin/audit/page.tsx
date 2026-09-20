import { requireOrganisationAdmin } from "../../../web/session";
import { AuditTable } from "../../_components/audit-table";

export default async function AuditPage() {
  const admin = await requireOrganisationAdmin();
  const entries = await admin.auditLog();
  return (
    <>
      <h2>Audit log</h2>
      <p>Individual data access and exports within your Organisation.</p>
      <p><a href="/admin/audit/export" download>Export audit log as CSV</a></p>
      <AuditTable entries={entries} />
    </>
  );
}
