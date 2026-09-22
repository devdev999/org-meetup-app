"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, Icon } from "./ui";

type Identity = {
  name: string;
  organisation: string;
  isOrganisationAdmin: boolean;
  isPlatformAdmin: boolean;
};

export function AppNavigation({ identity }: { identity?: Identity }) {
  const pathname = usePathname();
  const personal = [
    "/profile",
    "/interests",
    "/availability",
    "/connections",
    "/attendance",
    "/notifications",
  ];
  const primary = [
    { href: "/", label: "Discover", active: pathname === "/" },
    {
      href: "/meetups",
      label: "Meetups",
      active: pathname.startsWith("/meetups"),
    },
    {
      href: "/events",
      label: "Events",
      active: pathname.startsWith("/events"),
    },
    {
      href: "/members",
      label: "Members",
      active: pathname.startsWith("/members"),
    },
    {
      href: "/profile",
      label: "Your space",
      active: personal.includes(pathname),
    },
  ];
  return (
    <>
      <header className="site-header">
        <Link href="/" className="brand" aria-label="Organisation Meetups home">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            <small>Organisation</small>
            <strong>Meetups</strong>
          </span>
        </Link>
        {identity && (
          <nav className="primary-nav" aria-label="Main navigation">
            {primary.map(({ href, label, active }) => (
              <Link
                href={href}
                key={href}
                aria-current={active ? "page" : undefined}
              >
                {label}
              </Link>
            ))}
          </nav>
        )}
        <div className="header-actions">
          {identity ? (
            <>
              {identity.isOrganisationAdmin && (
                <Link
                  className="icon-link"
                  href="/admin"
                  aria-label="Organisation Admin"
                >
                  <Icon name="shield" />
                </Link>
              )}
              {identity.isPlatformAdmin && (
                <Link
                  className="icon-link"
                  href="/platform"
                  aria-label="Platform Admin"
                >
                  <Icon name="people" />
                </Link>
              )}
              <Link className="icon-link" href="/inbox" aria-label="Inbox">
                <Icon name="bell" />
              </Link>
              <Link href="/profile" aria-label="Your profile">
                <Avatar name={identity.name} />
              </Link>
            </>
          ) : (
            <Link href="/sign-in" className="button secondary">
              Sign in
            </Link>
          )}
        </div>
      </header>
      {identity && (
        <div className="context-bar">
          <span>{identity.organisation}</span>
          <nav aria-label="Member shortcuts">
            <Link href="/interests">Your Interests</Link>
            <Link href="/availability">Availability</Link>
            <Link href="/connections">Connections</Link>
            <Link href="/scout">
              Scout <Icon name="chat" size={15} />
            </Link>
          </nav>
        </div>
      )}
    </>
  );
}

export function SectionNavigation({
  label,
  links,
}: {
  label: string;
  links: { href: string; label: string }[];
}) {
  const pathname = usePathname();
  return (
    <nav className="section-nav" aria-label={label}>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={pathname === link.href ? "page" : undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
