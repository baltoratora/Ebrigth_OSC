import type { Metadata } from "next";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import "./pcm-globals.css";
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
  title: "PCM System — eBright",
  description: "Pro-Class Mastery management for eBright Public Speaking",
};

// Nested layout — does NOT redefine <html>/<body>. The OSC root layout owns
// those. We attach font CSS variables to a wrapper div so styling stays
// scoped inside /pcm-system/*. The `fa-system` class is kept so the shared
// component styles (.fa-card, .fa-btn-primary, .fa-mono, etc.) still apply
// here without duplicating the entire CSS file.
export default function PCMSystemLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`fa-system pcm-system ${inter.variable} ${fraunces.variable} ${jetbrainsMono.variable}`}>
      <SessionSync />
      {children}
    </div>
  );
}
