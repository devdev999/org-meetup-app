import { requirePlatformAdmin } from "../../../web/session";
import { AuditTable } from "../../_components/audit-table";

export default async function PlatformAuditPage() {
  const platform = await requirePlatformAdmin();
  return <>
    <h2>Audit log</h2>
    <p>Access across Organisations. The accessing admin and time are visible; viewed Member identities and personal filters are omitted.</p>
    <p><a href="/platform/audit/export" download>Export audit log as CSV</a></p>
    <AuditTable entries={await platform.auditLog()} />
  </>;
}
