import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { ADMIN_ROLES, ROLE_VALUES } from '@/lib/roles';
import bcrypt from 'bcryptjs';

// `role` is constrained to the canonical list in lib/roles.ts. The DB column
// is still a free-form string for backwards compatibility, but these checks
// prevent the API from ever writing an off-list value — closing the
// "POST /api/users with role: 'SuperAdmin_X'" escalation vector.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_SET: ReadonlySet<string> = new Set(ROLE_VALUES);

function bad(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

type Obj = Record<string, unknown>;
function asObj(v: unknown): Obj | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;
}

function parseCreate(raw: unknown):
  | { ok: true; data: { name: string | null; email: string; password: string; role: string; branchName: string | null } }
  | { ok: false; error: string } {
  const b = asObj(raw);
  if (!b) return { ok: false, error: 'Invalid JSON body' };
  if (typeof b.email !== 'string' || !EMAIL_RE.test(b.email)) return { ok: false, error: 'email must be a valid email' };
  if (typeof b.password !== 'string' || b.password.length < 8) return { ok: false, error: 'password must be at least 8 characters' };
  if (typeof b.role !== 'string' || !ROLE_SET.has(b.role)) return { ok: false, error: 'role must be one of ' + ROLE_VALUES.join(', ') };
  if (b.name !== undefined && typeof b.name !== 'string') return { ok: false, error: 'name must be a string' };
  if (b.branchName !== undefined && typeof b.branchName !== 'string') return { ok: false, error: 'branchName must be a string' };
  return {
    ok: true,
    data: {
      email: b.email,
      password: b.password,
      role: b.role,
      name: (b.name as string | undefined) ?? null,
      branchName: (b.branchName as string | undefined) ?? null,
    },
  };
}

function parseUpdate(raw: unknown):
  | { ok: true; data: { id: number; name?: string; email?: string; password?: string; role?: string; branchName?: string } }
  | { ok: false; error: string } {
  const b = asObj(raw);
  if (!b) return { ok: false, error: 'Invalid JSON body' };
  if (typeof b.id !== 'number' || !Number.isInteger(b.id)) return { ok: false, error: 'id must be an integer' };
  if (b.email !== undefined && (typeof b.email !== 'string' || !EMAIL_RE.test(b.email))) return { ok: false, error: 'email must be a valid email' };
  if (b.password !== undefined && (typeof b.password !== 'string' || b.password.length < 8)) return { ok: false, error: 'password must be at least 8 characters' };
  if (b.role !== undefined && (typeof b.role !== 'string' || !ROLE_SET.has(b.role))) return { ok: false, error: 'role must be one of ' + ROLE_VALUES.join(', ') };
  if (b.name !== undefined && typeof b.name !== 'string') return { ok: false, error: 'name must be a string' };
  if (b.branchName !== undefined && typeof b.branchName !== 'string') return { ok: false, error: 'branchName must be a string' };
  return {
    ok: true,
    data: {
      id: b.id,
      name:       b.name       as string | undefined,
      email:      b.email      as string | undefined,
      password:   b.password   as string | undefined,
      role:       b.role       as string | undefined,
      branchName: b.branchName as string | undefined,
    },
  };
}

type Overrides = Record<string, 'ALLOWED' | 'DENIED'>;

function parsePatch(raw: unknown):
  | { ok: true; data: { id: number; action: 'toggle-status' | 'change-role' | 'update-permissions'; role?: string; overrides?: Overrides } }
  | { ok: false; error: string } {
  const b = asObj(raw);
  if (!b) return { ok: false, error: 'Invalid JSON body' };
  if (typeof b.id !== 'number' || !Number.isInteger(b.id)) return { ok: false, error: 'id must be an integer' };
  if (b.action !== 'toggle-status' && b.action !== 'change-role' && b.action !== 'update-permissions') {
    return { ok: false, error: "action must be 'toggle-status', 'change-role', or 'update-permissions'" };
  }
  if (b.role !== undefined && (typeof b.role !== 'string' || !ROLE_SET.has(b.role))) {
    return { ok: false, error: 'role must be one of ' + ROLE_VALUES.join(', ') };
  }

  let overrides: Overrides | undefined;
  if (b.action === 'update-permissions') {
    const o = asObj(b.overrides);
    if (!o) return { ok: false, error: 'overrides must be an object of { key: "ALLOWED" | "DENIED" }' };
    overrides = {};
    for (const [k, v] of Object.entries(o)) {
      if (typeof k !== 'string' || k.length === 0 || k.length > 80) {
        return { ok: false, error: `invalid override key "${k}"` };
      }
      if (v !== 'ALLOWED' && v !== 'DENIED') {
        return { ok: false, error: `override "${k}" must be "ALLOWED" or "DENIED"` };
      }
      overrides[k] = v;
    }
  }

  return {
    ok: true,
    data: { id: b.id, action: b.action, role: b.role as string | undefined, overrides },
  };
}

export async function GET() {
  const { error } = await requireRole(ADMIN_ROLES);
  if (error) return error;

  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, branchName: true, status: true, createdAt: true, lastLoggedInAt: true, dashboardOverrides: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(users);
  } catch (err) {
    console.error('GET /api/users error:', err);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { error } = await requireRole(ADMIN_ROLES);
  if (error) return error;

  try {
    const parsed = parseCreate(await req.json());
    if (!parsed.ok) return bad(parsed.error);
    const { name, email, password, role, branchName } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, passwordHash, role, branchName, status: 'ACTIVE' },
      select: { id: true, name: true, email: true, role: true, branchName: true, status: true, createdAt: true, lastLoggedInAt: true, dashboardOverrides: true },
    });
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    console.error('POST /api/users error:', err);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { error } = await requireRole(ADMIN_ROLES);
  if (error) return error;

  try {
    const parsed = parseUpdate(await req.json());
    if (!parsed.ok) return bad(parsed.error);
    const { id, name, email, role, branchName, password } = parsed.data;

    if (email) {
      const conflict = await prisma.user.findFirst({ where: { email, NOT: { id } } });
      if (conflict) {
        return NextResponse.json({ error: 'Email already in use by another account' }, { status: 409 });
      }
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined)       updateData.name       = name;
    if (email !== undefined)      updateData.email      = email;
    if (role !== undefined)       updateData.role       = role;
    if (branchName !== undefined) updateData.branchName = branchName;
    if (password)                 updateData.passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, branchName: true, status: true, createdAt: true, lastLoggedInAt: true, dashboardOverrides: true },
    });
    return NextResponse.json(user);
  } catch (err) {
    console.error('PUT /api/users error:', err);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { error } = await requireRole(ADMIN_ROLES);
  if (error) return error;

  try {
    const parsed = parsePatch(await req.json());
    if (!parsed.ok) return bad(parsed.error);
    const { id, action, role, overrides } = parsed.data;

    const updateData: Record<string, unknown> = {};

    if (action === 'toggle-status') {
      const current = await prisma.user.findUnique({ where: { id }, select: { status: true } });
      if (!current) return NextResponse.json({ error: 'User not found' }, { status: 404 });
      updateData.status = current.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    } else if (action === 'change-role') {
      if (!role) return NextResponse.json({ error: 'role is required for change-role' }, { status: 400 });
      updateData.role = role;
    } else {
      // update-permissions
      updateData.dashboardOverrides = overrides ?? {};
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, branchName: true, status: true, createdAt: true, lastLoggedInAt: true, dashboardOverrides: true },
    });
    return NextResponse.json(user);
  } catch (err) {
    console.error('PATCH /api/users error:', err);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { error } = await requireRole(ADMIN_ROLES);
  if (error) return error;

  try {
    const id = Number(new URL(req.url).searchParams.get('id'));
    if (!id || isNaN(id)) {
      return NextResponse.json({ error: 'id query param is required' }, { status: 400 });
    }
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/users error:', err);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
