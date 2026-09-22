import type { ReactNode } from "react";
import { requirePlatformAdmin } from "../../web/session";
import { SectionNavigation } from "../_components/navigation";
import { PageHeading } from "../_components/ui";

export default async function PlatformLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requirePlatformAdmin();
  return (
    <main className="admin-area">
      <PageHeading
        title="Platform Admin"
        description="Manage Organisations and deployment settings, and review aggregate participation."
      />
      <SectionNavigation
        label="Platform administration"
        links={[
          { href: "/platform/organisations", label: "Organisations" },
          { href: "/platform/ministries", label: "Ministries" },
          { href: "/platform/settings", label: "Settings" },
          { href: "/platform/reports", label: "Reports" },
          { href: "/platform/audit", label: "Audit log" },
        ]}
      />
      <div className="admin-content">{children}</div>
    </main>
  );
}
