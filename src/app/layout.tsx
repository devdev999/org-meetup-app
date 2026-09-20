import type { Metadata } from "next";
import type { ReactNode } from "react";
import { connection } from "next/server";
import { application } from "../web/application";
import { Calendar } from "./_components/calendar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Organisation Meetups",
  description: "Find the people in your Organisation who share your interests and arrange to meet.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection();
  const timeZone = await application().timeZone();
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <a href="/">Organisation Meetups</a>
        </header>
        <Calendar timeZone={timeZone}>{children}</Calendar>
      </body>
    </html>
  );
}
