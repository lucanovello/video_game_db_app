import type { Metadata } from "next";
import Link from "next/link";
import { Fraunces, Space_Grotesk } from "next/font/google";
import NavLink from "./nav-link";
import "./globals.css";

const bodyFont = Space_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
});

const headingFont = Fraunces({
  variable: "--font-heading",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "video-game-db-app",
  description: "Console-first game catalog and social logging app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en'>
      <body className={`${bodyFont.variable} ${headingFont.variable}`}>
        <div className='app-shell'>
          <header className='topbar'>
            <Link className='brand' href='/'>
              video-game-db-app
            </Link>
            <nav className='topnav'>
              <NavLink href='/games'>Games</NavLink>
              <NavLink href='/platforms'>Platforms</NavLink>
              <NavLink href='/u/demo_user'>Profile</NavLink>
            </nav>
          </header>
          <main className='page-wrap'>{children}</main>
        </div>
      </body>
    </html>
  );
}
