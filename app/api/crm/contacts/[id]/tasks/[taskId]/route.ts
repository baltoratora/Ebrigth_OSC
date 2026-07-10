import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/crm/auth'
import { prisma } from '@/lib/crm/db'
import { z } from 'zod'

const PatchTaskSchema = z.object({
  completedAt: z.string().datetime().nullable(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { taskId } = await params
    const body = await req.json()
    const parsed = PatchTaskSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation error' }, { status: 400 })
    }

    const task = await prisma.crm_task.update({
      where: { id: taskId },
      data: {
        completedAt: parsed.data.completedAt ? new Date(parsed.data.completedAt) : null,
      },
    })

    return NextResponse.json(task)
  } catch (err) {
    console.error('[PATCH /api/crm/contacts/[id]/tasks/[taskId]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
