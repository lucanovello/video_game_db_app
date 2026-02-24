import type { Metadata } from "next";
import Link from "next/link";
import { Fraunces, Space_Grotesk } from "next/font/google";
import NavLink from "./nav-link";
import ThemeToggle from "./theme-toggle";
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

const themeInitScript = `
(() => {
  try {
    const stored = window.localStorage.getItem("theme");
    const theme = stored === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
  } catch {
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.style.colorScheme = "dark";
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en' data-theme='dark' suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${bodyFont.variable} ${headingFont.variable}`}>
        <div className='app-shell'>
          <header className='topbar'>
            <Link className='brand' href='/'>
              video-game-db-app
            </Link>
            <div className='topbar-right'>
              <nav className='topnav'>
                <NavLink href='/games'>Games</NavLink>
                <NavLink href='/platforms'>Platforms</NavLink>
                <NavLink href='/u/demo_user'>Profile</NavLink>
              </nav>
              <ThemeToggle />
            </div>
          </header>
          <main className='page-wrap'>{children}</main>
        </div>
      </body>
    </html>
  );
}
