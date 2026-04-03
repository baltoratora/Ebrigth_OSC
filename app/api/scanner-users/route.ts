import { NextResponse } from 'next/server';
import { request } from 'urllib';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const url = 'http://192.168.100.147/ISAPI/AccessControl/UserInfo/Search?format=json';
        const allUsers: { employeeNo: string; name: string }[] = [];
        const seen = new Set<string>(); // deduplicate by employeeNo
        let position = 0;
        let fetching = true;

        while (fetching) {
            const { data, res } = await request(url, {
                method: 'POST',
                digestAuth: 'admin:Admin@1234',
                data: {
                    UserInfoSearchCond: {
                        searchID: Date.now().toString(),
                        searchResultPosition: position,
                        maxResults: 50,
                    }
                },
                contentType: 'application/json',
                dataType: 'json',
                timeout: 8000,
            });

            if (res.statusCode !== 200) break;

            const batch: any[] = data?.UserInfoSearch?.UserInfo || [];

            for (const u of batch) {
                if (u.employeeNo && !seen.has(u.employeeNo)) {
                    seen.add(u.employeeNo);
                    allUsers.push({ employeeNo: u.employeeNo, name: (u.name ?? '').trim() });
                }
            }

            position += batch.length;
            const status = data?.UserInfoSearch?.responseStatusStrg;
            if (status !== 'MORE' || batch.length === 0) fetching = false;
        }

        return NextResponse.json(allUsers);

    } catch (error) {
        console.error('scanner-users error:', error);
        return new NextResponse(
            JSON.stringify({ error: 'Failed to fetch scanner users' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}
