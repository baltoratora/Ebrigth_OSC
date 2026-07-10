import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendClockInEmail, sendClockOutEmail } from '@/lib/mailer';
import { readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HikvisionAccessEvent {
  ipAddress?: string;
  AccessControllerEvent?: {
    employeeNoString?: string;
    name?: string;
    time?: string;
    serialNo?: number | string;
    major?: number;
    minor?: number;
    type?: string;
  };
}

interface HikvisionEventNotification {
  ipAddress?: string;
  Events?: HikvisionAccessEvent[];
  AccessControllerEvent?: {
    employeeNoString?: string;
    name?: string;
    time?: string;
    serialNo?: number | string;
  };
}

interface CSVEmployee {
  name: string;
  email: string;
  scannerRef: string;
}

// ─── CSV helpers (same as test-scanner) ───────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const cols: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === ',' && !inQuotes) { cols.push(current.trim()); current = ''; }
    else { current += char; }
  }
  cols.push(current.trim());
  return cols.map(c => c.replace(/^"|"$/g, ''));
}

function loadEmployeesCSV(): CSVEmployee[] {
  try {
    const text = readFileSync(join(process.cwd(), 'public', 'employees.csv'), 'utf-8');
    return text.trim().split('\n').slice(2).map(line => {
      const cols = parseCSVLine(line);
      if (cols.length < 4) return null;
      const eid = (cols[8] ?? '').trim();
      const parts = eid.split(' ');
      const scannerRef = parts.length === 3 ? parts[1] + parts[0].substring(0, 2) + parts[2] : '';
      return {
        name: (cols[0] ?? '').trim(),
        email: (cols[10] ?? '').trim(),
        scannerRef,
      };
    }).filter((e): e is CSVEmployee => !!e && e.name !== '');
  } catch {
    return [];
  }
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

function todayMY(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}

function formatDisplayTime(isoTime: string): string {
  return new Date(isoTime).toLocaleTimeString('en-MY', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    timeZone: 'Asia/Kuala_Lumpur',
  });
}

// ─── Core upsert logic ────────────────────────────────────────────────────────

async function processEvent(empNo: string, scanTime: string, serialNo: string): Promise<void> {
  if (!empNo || empNo === '0') return;

  const employees = loadEmployeesCSV();
  const emp = employees.find(e => e.scannerRef === empNo);
  const empName = emp?.name ?? empNo;
  const empEmail = emp?.email ?? '';

  const today = todayMY();
  const clockTime = formatDisplayTime(scanTime);

  const existing = await prisma.attendanceLog.findUnique({
    where: { date_empNo: { date: today, empNo } },
  });

  if (!existing) {
    // First scan of the day → clock-in
    await prisma.attendanceLog.create({
      data: {
        date: today,
        empNo,
        empName,
        clockInTime: clockTime,
        clockInSerialNo: serialNo,
        clockInEmailSent: false,
        clockOutTime: null,
        clockOutSerialNo: null,
        clockOutEmailSent: false,
      },
    });

    if (empEmail) {
      try {
        await sendClockInEmail(empEmail, empName, clockTime);
        await prisma.attendanceLog.update({
          where: { date_empNo: { date: today, empNo } },
          data: { clockInEmailSent: true },
        });
        console.log(`✅ Clock-in → ${empName} at ${clockTime}`);
      } catch (e) {
        console.error(`Clock-in email failed for ${empName}:`, e);
      }
    }

  } else {
    // Subsequent scan → clock-out (only if it's a new serialNo)
    if (serialNo === existing.clockInSerialNo) return; // same scan, ignore
    if (serialNo === existing.clockOutSerialNo) return; // already recorded

    if (empEmail) {
      try {
        await sendClockOutEmail(empEmail, empName, clockTime);
        console.log(`🔴 Clock-out → ${empName} at ${clockTime}`);
      } catch (e) {
        console.error(`Clock-out email failed for ${empName}:`, e);
      }
    }

    await prisma.attendanceLog.update({
      where: { date_empNo: { date: today, empNo } },
      data: { clockOutTime: clockTime, clockOutSerialNo: serialNo, clockOutEmailSent: true },
    });
  }
}

// ─── POST handler — receives push from Hikvision scanner ─────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json() as HikvisionEventNotification;

    // Hikvision can wrap events in an array or send a single event
    const events: HikvisionAccessEvent[] = body.Events ?? [body];

    for (const event of events) {
      const ace = event.AccessControllerEvent ?? body.AccessControllerEvent;
      if (!ace) continue;

      const empNo = ace.employeeNoString ?? '';
      const scanTime = ace.time ?? new Date().toISOString();
      const serialNo = String(ace.serialNo ?? Date.now());

      await processEvent(empNo, scanTime, serialNo);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('scanner-webhook error:', err);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

// GET — health check so you can confirm the endpoint is reachable
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: 'scanner-webhook ready', time: new Date().toISOString() });
}
