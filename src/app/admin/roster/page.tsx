import { requireOrganisationAdmin } from "../../../web/session";
import { RosterTable } from "./roster-table";
import { RosterUpload } from "./upload";

export default async function RosterPage() {
  const admin = await requireOrganisationAdmin();
  const roster = await admin.roster();
  return (
    <>
      <RosterUpload />
      <h2>Current Members</h2>
      <RosterTable rows={roster} />
    </>
  );
}
