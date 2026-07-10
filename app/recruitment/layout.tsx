import type { Metadata } from "next";
import { RecruitmentShell } from "@/components/recruitment/shell";

export const metadata: Metadata = {
  title: "Recruitment — Ebright HR",
  description: "Ebright HR recruitment tracking",
};

// Access is enforced by middleware.ts (the /recruitment prefix is gated to
// SUPER_ADMIN / ADMIN / HR / HOD via the portal's NextAuth session). The shell
// provides the module's emerald sidebar + top bar (with the dark-mode toggle).
export default function RecruitmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RecruitmentShell>{children}</RecruitmentShell>;
}
