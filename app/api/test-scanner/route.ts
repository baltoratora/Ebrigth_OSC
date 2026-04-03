import { NextResponse } from 'next/server';
import { request } from 'urllib';

// Force Next.js to never cache this route — always fetch live from scanner
export const dynamic = 'force-dynamic';

// Hikvision firmware requires this exact date format
function formatHikvisionDate(date: Date) {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const YYYY = date.getFullYear();
    const MM = pad(date.getMonth() + 1);
    const DD = pad(date.getDate());
    const HH = pad(date.getHours());
    const mm = pad(date.getMinutes());
    const ss = pad(date.getSeconds());
    return `${YYYY}-${MM}-${DD}T${HH}:${mm}:${ss}+08:00`;
}

export async function GET() {
    try {
        const url = 'http://192.168.100.147/ISAPI/AccessControl/AcsEvent?format=json';
        const username = 'admin';
        const password = 'Admin@1234';

        const now = new Date();
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);

        // Unique ID forces the scanner to do a fresh search instead of returning cached results
        const uniqueSearchID = Date.now().toString();

        let allEvents: any[] = [];
        let currentPosition = 0;
        let isFetching = true;
        let safetyCounter = 0;

        // Pagination loop — Hikvision returns max 30 records per request
        while (isFetching && safetyCounter < 50) {
            safetyCounter++;

            const searchPayload = {
                AcsEventCond: {
                    searchID: uniqueSearchID,
                    searchResultPosition: currentPosition,
                    maxResults: 30,
                    major: 0,
                    minor: 0,
                    startTime: formatHikvisionDate(startOfToday),
                    endTime: formatHikvisionDate(now),
                }
            };

            const { data, res } = await request(url, {
                method: 'POST',
                digestAuth: `${username}:${password}`,
                data: searchPayload,
                contentType: 'application/json',
                dataType: 'json',
                timeout: 8000,
            });

            if (res.statusCode !== 200) {
                console.error('Scanner returned status:', res.statusCode);
                break;
            }

            const eventList = data.AcsEvent?.InfoList || [];

            if (eventList.length > 0) {
                allEvents.push(...eventList);
                currentPosition += eventList.length;
            }

            // Stop when no more results
            if (eventList.length === 0 || data.AcsEvent?.numOfMatches === 0) {
                isFetching = false;
            }
        }

        // Only keep records that have an actual employee ID (filter out door-open events etc.)
        const validScans = allEvents.filter(event =>
            event.employeeNoString &&
            event.employeeNoString !== '0' &&
            event.employeeNoString !== ''
        );

        // Sort newest first by serial number
        const newestFirst = validScans.sort((a, b) => Number(b.serialNo) - Number(a.serialNo));

        console.log(`Scanner: ${allEvents.length} total events, ${newestFirst.length} valid thumbprints`);

        return new NextResponse(JSON.stringify(newestFirst, null, 2), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Scanner connection error:', error);
        return new NextResponse(
            JSON.stringify({ error: 'Failed to connect to scanner', detail: String(error) }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
