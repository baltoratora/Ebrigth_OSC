import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./Providers"; // <-- Must match the file name exactly

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ebright HR System",
  description: "Ebright HR Management System",
  // Explicit, cache-busted favicon. The App Router serves app/favicon.ico at a
  // static, un-hashed /favicon.ico that browsers cache aggressively — pointing
  // at /01.ico with a version query forces the new portal icon to load.
  icons: {
    icon: "/01.ico?v=2",
    shortcut: "/01.ico?v=2",
    apple: "/01.ico?v=2",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}