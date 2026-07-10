import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { ADMIN_ROLES } from '@/lib/roles';
import { syncRangeToDb } from '@/lib/scanner-sync';

export const dynamic = 'force-dynamic';
// Backfill can take a long time — allow up to 5 minutes
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { error } = await requireRole(ADMIN_ROLES);
  if (error) return error;

  try {
    const body = await req.json().catch(() => ({})) as {
      startDate?: string;
      endDate?: string;
      daysBack?: number;
    };

    // Compute date range
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });

    let startDate: string;
    let endDate: string = today;

    if (body.startDate && body.endDate) {
      startDate = body.startDate;
      endDate   = body.endDate;
    } else {
      const daysBack = Math.min(body.daysBack ?? 90, 365); // cap at 1 year
      const start = new Date();
      start.setDate(start.getDate() - daysBack);
      startDate = start.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
    }

    console.log(`[backfill-scanner] Starting backfill from ${startDate} to ${endDate}`);

    const { processed, skipped } = await syncRangeToDb(startDate, endDate);

    console.log(`[backfill-scanner] Done — processed: ${processed}, skipped: ${skipped}`);

    return NextResponse.json({ ok: true, startDate, endDate, processed, skipped });
  } catch (err) {
    console.error('[backfill-scanner] Error:', err);
    return NextResponse.json(
      { error: 'Backfill failed', detail: String(err) },
      { status: 500 },
    );
  }
}
