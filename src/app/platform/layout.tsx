import Link from "next/link";
import type { ReactNode } from "react";
import { requirePlatformAdmin } from "../../web/session";

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  await requirePlatformAdmin();
  return <main className="admin-area">
    <h1>Platform Admin</h1>
    <nav aria-label="Platform administration"><Link href="/platform/audit">Audit log</Link><Link href="/profile">My profile</Link></nav>
    {children}
  </main>;
}
