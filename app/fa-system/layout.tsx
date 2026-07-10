import type { Metadata } from "next";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import "./fa-globals.css";
import { SessionSync } from "./_components/SessionSync";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz", "SOFT", "WONK"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FA System — eBright",
  description: "Foundation Appraisal management for eBright Public Speaking",
};

// Nested layout — does NOT redefine <html>/<body>. The OSC root layout owns
// those. We just attach the FA font CSS variables to a wrapper div so FA's
// styling applies inside /fa-system/* without leaking out.
export default function FASystemLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`fa-system ${inter.variable} ${fraunces.variable} ${jetbrainsMono.variable}`}>
      <SessionSync />
      {children}
    </div>
  );
}
