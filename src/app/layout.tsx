import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Organisation Meetups",
  description: "Find colleagues who share your interests and arrange to meet.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <a href="/">Organisation Meetups</a>
        </header>
        {children}
      </body>
    </html>
  );
}
