import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

// GET — list all users
export async function GET() {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        branchName: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(users);
  } catch (error) {
    console.error('GET /api/users error:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

// POST — create a new user
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, password, role, branchName } = body;

    if (!email || !password || !role) {
      return NextResponse.json({ error: 'email, password, and role are required' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name: name ?? null, email, passwordHash, role, branchName: branchName ?? null, status: 'ACTIVE' },
      select: { id: true, name: true, email: true, role: true, branchName: true, status: true, createdAt: true },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error('POST /api/users error:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}

// PUT — edit a user (name, email, role, branchName, password)
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, email, role, branchName, password } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // If email is changing, ensure no conflict
    if (email) {
      const conflict = await prisma.user.findFirst({ where: { email, NOT: { id: Number(id) } } });
      if (conflict) {
        return NextResponse.json({ error: 'Email already in use by another account' }, { status: 409 });
      }
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (role !== undefined) updateData.role = role;
    if (branchName !== undefined) updateData.branchName = branchName;
    if (password) updateData.passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.update({
      where: { id: Number(id) },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, branchName: true, status: true, createdAt: true },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error('PUT /api/users error:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

// PATCH — toggle status (ACTIVE ↔ INACTIVE) or change role only
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, action, role } = body;

    if (!id || !action) {
      return NextResponse.json({ error: 'id and action are required' }, { status: 400 });
    }

    let updateData: Record<string, unknown> = {};

    if (action === 'toggle-status') {
      const current = await prisma.user.findUnique({ where: { id: Number(id) }, select: { status: true } });
      if (!current) return NextResponse.json({ error: 'User not found' }, { status: 404 });
      updateData.status = current.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    } else if (action === 'change-role') {
      if (!role) return NextResponse.json({ error: 'role is required for change-role action' }, { status: 400 });
      updateData.role = role;
    } else {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: Number(id) },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, branchName: true, status: true, createdAt: true },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error('PATCH /api/users error:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

// DELETE — remove a user
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id query param is required' }, { status: 400 });
    }

    await prisma.user.delete({ where: { id: Number(id) } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/users error:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
