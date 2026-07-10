import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { createRateLimiter } from '@/lib/rate-limit';

// POST /api/auth/change-password
//   Body: { currentPassword: string, newPassword: string }
//
// Verifies the supplied currentPassword against User.passwordHash for the
// signed-in caller, then writes a fresh bcrypt hash of newPassword.
//
// Session note: the app runs NextAuth with the JWT strategy, so the caller's
// existing cookie remains valid until its natural expiry. The success response
// includes `signOut: true` so the client can call NextAuth's signOut() to
// force the user back through /login with their new password.

const MIN_LEN = 8;

// 5 failed attempts inside a 15-minute rolling window locks the user out
// from further change-password attempts. Successful changes reset the
// counter. Module-level so the Map survives between requests but resets on
// process restart — acceptable for a single-container deploy. For a
// multi-instance setup, swap createRateLimiter for a Redis-backed
// implementation with the same interface.
const passwordChangeLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max:      5,
});

export async function POST(request: Request) {
  const { session, error } = await requireSession();
  if (error) return error;

  const email = (session.user as { email?: string | null } | undefined)?.email;
  if (!email) {
    return NextResponse.json({ error: 'Session is missing an email' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const obj = body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
  const currentPassword = obj && typeof obj.currentPassword === 'string' ? obj.currentPassword : null;
  const newPassword     = obj && typeof obj.newPassword     === 'string' ? obj.newPassword     : null;

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: 'currentPassword and newPassword are required' },
      { status: 400 },
    );
  }
  if (newPassword.length < MIN_LEN) {
    return NextResponse.json(
      { error: `New password must be at least ${MIN_LEN} characters` },
      { status: 400 },
    );
  }
  if (newPassword === currentPassword) {
    return NextResponse.json(
      { error: 'New password must be different from the current password' },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where:  { email },
    select: { id: true, passwordHash: true, status: true },
  });
  if (!user || user.status !== 'ACTIVE') {
    // Don't reveal whether the account exists; treat as auth failure.
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Per-user rate limit — protects against a stolen-cookie brute-force of
  // the current password. Keyed by user.id so re-logging in doesn't reset
  // the counter.
  const rlKey = `change-pw:${user.id}`;
  const gate  = passwordChangeLimiter.check(rlKey);
  if (gate.blocked) {
    return NextResponse.json(
      {
        error:         'Too many failed attempts. Try again later.',
        retryAfterSec: gate.retryAfterSec,
      },
      {
        status:  429,
        headers: { 'Retry-After': String(gate.retryAfterSec) },
      },
    );
  }

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) {
    passwordChangeLimiter.record(rlKey);
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
  }
  // Successful auth — clear any prior failure counter for this user.
  passwordChangeLimiter.reset(rlKey);

  const newHash = await bcrypt.hash(newPassword, 10);
  const now     = new Date();

  // Two writes:
  //   1) Update the password hash on the User row. In production that row is
  //      crm."User", an FDW view; postgres_fdw passes the UPDATE through to
  //      ebright_hrfs.public."User".
  //   2) Stamp the local crm.SessionRevocation table with revokedAfter = now.
  //      The nextauth jwt() callback and middleware.ts both compare this
  //      against the JWT's iat on every request; any token issued before
  //      this instant becomes invalid, kicking every other active session
  //      for this user.
  //
  // Password update goes first. If it throws, no revocation row is written
  // and the caller's session keeps working with the old password.
  await prisma.user.update({
    where: { id: user.id },
    data:  { passwordHash: newHash },
  });
  await prisma.sessionRevocation.upsert({
    where:  { email },
    create: { email, revokedAfter: now },
    update: { revokedAfter: now },
  });

  return NextResponse.json({
    success: true,
    message: 'Password updated. Please sign in again with your new password.',
    signOut: true,
  });
}
