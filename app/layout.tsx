import type { Metadata } from "next";
import Link from "next/link";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";

import { getOptionalViewer } from "@/lib/server/auth";
import { SignOutButton } from "@/components/auth/sign-out-button";

import "./globals.css";

const headlineFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-headline"
});

const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"]
});

export const metadata: Metadata = {
  description: "AI-assisted marketplace intelligence for eBay and Kleinanzeigen listings.",
  icons: {
    icon: "/favicon.ico"
  },
  title: "Marketplace Advisor"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const viewer = await getOptionalViewer();

  return (
    <html className={`${headlineFont.variable} ${monoFont.variable}`} lang="en">
      <body suppressHydrationWarning>
        <div className="page-shell">
          <header className="site-header">
            <Link className="brand" href="/">
              <span className="brand__mark" />
              <span>
                <strong>Marketplace Advisor</strong>
                <small>crawl, compare, inspect</small>
              </span>
            </Link>

            <nav className="row gap-sm wrap">
              <Link className="button button--ghost" href="/dashboard">
                Dashboard
              </Link>
              <Link className="button button--ghost" href="/admin">
                Admin
              </Link>
              {viewer ? (
                <SignOutButton />
              ) : (
                <Link className="button button--primary" href="/login">
                  Sign in
                </Link>
              )}
            </nav>
          </header>

          <main className="page-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
