import type { ReactNode } from "react";
import { requireOrganisationAdmin } from "../../web/session";
import { SectionNavigation } from "../_components/navigation";
import { PageHeading } from "../_components/ui";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireOrganisationAdmin();
  return (
    <main className="admin-area">
      <PageHeading
        title="Organisation Admin"
        description="Manage your population, support Events and understand participation."
      />
      <SectionNavigation
        label="Administration"
        links={[
          { href: "/admin/reports", label: "Reports" },
          { href: "/scout", label: "Scout" },
          { href: "/admin/roster", label: "Roster" },
          { href: "/admin/lists", label: "Departments, Sites and Activities" },
          { href: "/admin/interests", label: "Interests" },
          { href: "/admin/events", label: "Events" },
          { href: "/admin/moderation", label: "Moderation" },
          { href: "/admin/attendance", label: "Attendance and ratings" },
          { href: "/admin/notices", label: "Unknown logins" },
          { href: "/admin/audit", label: "Audit log" },
        ]}
      />
      <div className="admin-content">{children}</div>
    </main>
  );
}
