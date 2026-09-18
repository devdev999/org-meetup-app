import { requireOrganisationAdmin } from "../../../web/session";

export default async function NoticesPage() {
  const admin = await requireOrganisationAdmin();
  const notices = await admin.unknownLoginNotices();
  return (
    <>
      <h2>Unknown logins</h2>
      <p>
        These Members first signed in without a roster row. Add them to your next roster if they belong to your
        Organisation.
      </p>
      {notices.length === 0 ? (
        <p>No unknown logins.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Email</th>
                <th>First login</th>
              </tr>
            </thead>
            <tbody>
              {notices.map((notice) => (
                <tr key={notice.memberId}>
                  <td>{notice.name}</td>
                  <td>{notice.email}</td>
                  <td>{notice.createdAt.toISOString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
