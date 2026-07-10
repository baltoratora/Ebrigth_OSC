"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export interface ResetPasswordResult {
  ok: boolean;
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

export async function resetPassword(
  _: ResetPasswordResult | null,
  formData: FormData,
): Promise<ResetPasswordResult> {
  const email = str(formData, "email").trim().toLowerCase();
  const current = str(formData, "currentPassword");
  const next = str(formData, "newPassword");
  const confirm = str(formData, "confirmPassword");

  if (!email) return { ok: false, error: "Email is required." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Please enter a valid email address." };
  if (!current) return { ok: false, error: "Current password is required." };
  if (!next) return { ok: false, error: "New password is required." };
  if (next.length < 8) return { ok: false, error: "New password must be at least 8 characters long." };
  if (next !== confirm) return { ok: false, error: "New passwords do not match." };
  if (current === next) return { ok: false, error: "New password must differ from the current password." };

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, status: true },
  });

  // Generic message to avoid leaking whether the email is registered.
  const invalidCreds = { ok: false as const, error: "Email or current password is incorrect." };
  if (!user) return invalidCreds;
  if (user.status !== "ACTIVE") return invalidCreds;

  const valid = await bcrypt.compare(current, user.passwordHash);
  if (!valid) return invalidCreds;

  const hashed = await bcrypt.hash(next, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashed } });

  redirect("/login?reset=1");
}
