import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createRateLimiter } from "@/lib/rate-limit";

// POST /api/auth/signup/verify
//   Body: { email: string }
//
// Step 1 of the two-step sign-up flow. Confirms the email is eligible to
// register before the client reveals the password fields:
//   - it must belong to a known staff record (BranchStaff.email), and
//   - it must NOT already have a login account (User.email).
//
// This only proves the email is a recognised staff address — it does NOT prove
// the person submitting the form owns that inbox (no verification link is
// sent). For an internal HR tool that is the intended bar; revisit if sign-up
// is ever exposed beyond trusted staff.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 20 lookups per 15 min per email — generous for honest typos, tight enough to
// blunt staff-directory enumeration from a single client.
const verifyLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const obj = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  const email = obj && typeof obj.email === "string" ? obj.email.trim().toLowerCase() : "";

  if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });

  const rlKey = `signup-verify:${email}`;
  const gate = verifyLimiter.check(rlKey);
  if (gate.blocked) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } },
    );
  }
  verifyLimiter.record(rlKey);

  // Already has a login account → send them to sign in.
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return NextResponse.json(
      { eligible: false, error: "This email is already registered. Please sign in instead." },
      { status: 409 },
    );
  }

  // Must match a staff record. BranchStaff.email is free-text, so compare
  // case-insensitively.
  const staff = await prisma.branchStaff.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { name: true },
  });
  if (!staff) {
    return NextResponse.json(
      { eligible: false, error: "This email isn't registered in our staff records. Please contact HR at 01116491088 to update your email." },
      { status: 404 },
    );
  }

  // Clear the limiter on success so a verified user isn't penalised for the
  // lookups it took to get here.
  verifyLimiter.reset(rlKey);
  return NextResponse.json({ eligible: true, name: staff.name ?? null });
}
