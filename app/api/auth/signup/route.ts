import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { hrfsPrisma } from "@/lib/hrfs";
import { createRateLimiter } from "@/lib/rate-limit";
import { normalizeRole, ROLES } from "@/lib/roles";

// POST /api/auth/signup
//   Body: { email: string, password: string, confirmPassword: string }
//
// Step 2 of the two-step sign-up flow. Re-runs every eligibility check from
// /verify server-side (the client gate is convenience only, never trusted),
// then creates the login account.
//
// The new User inherits its role/branch/name from the matching BranchStaff
// record, and User.role is stored as the BranchStaff job-title label verbatim
// (e.g. "PT Coach") so the two tables stay in sync. The auth layer understands
// those labels via normalizeRole(), which is also used here to guard: a role
// that doesn't resolve to a known access Role falls back to the lowest-
// privilege role (INTERN) rather than being stored as a value that would lock
// the new user out at the middleware.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_LEN = 8;

const signupLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const obj = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  const email = obj && typeof obj.email === "string" ? obj.email.trim().toLowerCase() : "";
  const password = obj && typeof obj.password === "string" ? obj.password : "";
  const confirmPassword = obj && typeof obj.confirmPassword === "string" ? obj.confirmPassword : "";

  if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  if (!password) return NextResponse.json({ error: "Password is required." }, { status: 400 });
  if (password.length < MIN_LEN) {
    return NextResponse.json({ error: `Password must be at least ${MIN_LEN} characters.` }, { status: 400 });
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ error: "Passwords do not match." }, { status: 400 });
  }

  const rlKey = `signup:${email}`;
  const gate = signupLimiter.check(rlKey);
  if (gate.blocked) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSec) } },
    );
  }

  // Re-check both gates server-side.
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return NextResponse.json(
      { error: "This email is already registered. Please sign in instead." },
      { status: 409 },
    );
  }

  const staff = await prisma.branchStaff.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { name: true, branch: true, role: true },
  });
  if (!staff) {
    signupLimiter.record(rlKey);
    return NextResponse.json(
      { error: "This email isn't registered in our staff records. Please contact HR at 01116491088 to update your email." },
      { status: 404 },
    );
  }

  // Store the BranchStaff job-title label verbatim so User.role mirrors
  // BranchStaff.role — but only when it resolves to a known access Role.
  // Otherwise fall back to INTERN so an unrecognised label can never lock the
  // user out (normalizeRole(label) === null → middleware would reject them).
  const staffRole = (staff.role ?? "").trim();
  const role = staffRole && normalizeRole(staffRole) ? staffRole : ROLES.INTERN;
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    // Insert via hrfsPrisma → ebright_hrfs.public."User" (the real table).
    // Writing through the crm "User" FDW view fails: the id sequence default
    // doesn't propagate across postgres_fdw, so the INSERT errors with a
    // misleading P2011 null-constraint. The crm view reflects this row live for
    // login. (Reads/dupe-checks above can stay on the crm view.)
    await hrfsPrisma.user.create({
      data: {
        email,
        passwordHash,
        name: staff.name ?? null,
        branchName: staff.branch ?? null,
        role,
        status: "ACTIVE",
      },
    });
  } catch (err) {
    // Unique-constraint race: someone registered this email between our check
    // and the insert. Treat as "already registered".
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "This email is already registered. Please sign in instead." },
        { status: 409 },
      );
    }
    console.error("signup: failed to create user", err);
    return NextResponse.json({ error: "Could not create your account. Please try again." }, { status: 500 });
  }

  signupLimiter.reset(rlKey);
  return NextResponse.json({ success: true });
}
