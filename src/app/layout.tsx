import type { Metadata } from "next";
import type { ReactNode } from "react";
import { connection } from "next/server";
import { application } from "../web/application";
import { Calendar } from "./_components/calendar";
import { AppNavigation } from "./_components/navigation";
import { currentMember } from "../web/session";
import {
  isAccessDeniedError,
  isAdminVisibilityNoticeRequiredError,
} from "../application";
import "./globals.css";

export const metadata: Metadata = {
  title: "Organisation Meetups",
  description:
    "Find the people in your Organisation who share your interests and arrange to meet.",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  await connection();
  const [timeZone, member] = await Promise.all([
    application().timeZone(),
    currentMember(),
  ]);
  const profile = member
    ? await member.profile().catch((error: unknown) => {
        if (
          isAccessDeniedError(error) ||
          isAdminVisibilityNoticeRequiredError(error)
        )
          return undefined;
        throw error;
      })
    : undefined;
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#page-content">
          Skip to content
        </a>
        <div className="app-frame">
          <AppNavigation
            identity={
              profile && {
                name: profile.name,
                organisation: profile.organisation.name,
                isOrganisationAdmin: profile.isOrganisationAdmin,
                isPlatformAdmin: profile.isPlatformAdmin,
              }
            }
          />
          <div id="page-content" tabIndex={-1}>
            <Calendar timeZone={timeZone}>{children}</Calendar>
          </div>
          <footer className="site-footer">
            <span>Organisation Meetups</span>
            <span>A little time for each other.</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
