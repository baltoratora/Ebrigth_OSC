import { NextResponse } from 'next/server';
import { request } from 'urllib';
import { SCANNERS } from '@/lib/scanners';
import { requireRole } from '@/lib/auth';
import { ADMIN_ROLES } from '@/lib/roles';

export const dynamic = 'force-dynamic';

function formatHikvisionDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}+08:00`;
}

interface HikvisionEvent {
  employeeNoString: string;
  serialNo: number;
  time: string;
  major?: number;
  minor?: number;
}

export async function GET() {
  const { error } = await requireRole(ADMIN_ROLES);
  if (error) return error;

  try {
    const scanner = SCANNERS[0];
    const url = `http://${scanner.ip}/ISAPI/AccessControl/AcsEvent?format=json`;

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const allEvents: HikvisionEvent[] = [];
    let currentPosition = 0;
    let isFetching = true;
    let safetyCounter = 0;

    while (isFetching && safetyCounter < 50) {
      safetyCounter++;
      const { data, res } = await request(url, {
        method: 'POST',
        digestAuth: `${scanner.user}:${scanner.pass}`,
        data: {
          AcsEventCond: {
            searchID: Date.now().toString(),
            searchResultPosition: currentPosition,
            maxResults: 30,
            major: 0,
            minor: 0,
            startTime: formatHikvisionDate(startOfToday),
            endTime: formatHikvisionDate(now),
          },
        },
        contentType: 'application/json',
        dataType: 'json',
        timeout: 8000,
      });

      if (res.statusCode !== 200) break;

      const eventList: HikvisionEvent[] =
        (data as { AcsEvent?: { InfoList?: HikvisionEvent[]; numOfMatches?: number } })
          .AcsEvent?.InfoList || [];
      if (eventList.length > 0) {
        allEvents.push(...eventList);
        currentPosition += eventList.length;
      }
      if (
        eventList.length === 0 ||
        (data as { AcsEvent?: { numOfMatches?: number } }).AcsEvent?.numOfMatches === 0
      ) isFetching = false;
    }

    const validScans = allEvents
      .filter(e => e.employeeNoString && e.employeeNoString !== '0' && e.employeeNoString !== '')
      .sort((a, b) => Number(b.serialNo) - Number(a.serialNo));

    return new NextResponse(JSON.stringify(validScans, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Scanner error:', error);
    return new NextResponse(
      JSON.stringify({ error: 'Failed to connect to scanner', detail: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
