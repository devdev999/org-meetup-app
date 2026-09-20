import Link from "next/link";
import type { ReactNode } from "react";
import { requireOrganisationAdmin } from "../../web/session";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireOrganisationAdmin();
  return (
    <main className="admin-area">
      <h1>Organisation Admin</h1>
      <nav aria-label="Administration">
        <Link href="/admin/roster">Roster</Link>
        <Link href="/admin/lists">Departments, Sites and Activities</Link>
        <Link href="/admin/events">Events</Link>
        <Link href="/admin/moderation">Moderation</Link>
        <Link href="/admin/attendance">Attendance and ratings</Link>
        <Link href="/admin/notices">Unknown logins</Link>
        <Link href="/admin/audit">Audit log</Link>
        <Link href="/profile">My profile</Link>
      </nav>
      {children}
    </main>
  );
}
