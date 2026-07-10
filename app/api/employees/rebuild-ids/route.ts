import { NextResponse } from 'next/server';
import { hrfsPrisma } from '@/lib/hrfs';
import { requireRole } from '@/lib/auth';
import { ADMIN_ROLES } from '@/lib/roles';

function getPositionCode(role: string): string {
  const r = role.toUpperCase();
  if (r.includes('CEO')) return '11';
  if (r.includes('HOD')) return '22';
  if (r.startsWith('FT - ') || r.startsWith('PT - ') || r.includes('EXEC') || r.includes('BM')) return '33';
  if (r.includes('INT')) return '44';
  return '33';
}

function getDeptCode(branch: string): string {
  const map: Record<string, string> = {
    'HQ':  '01',
    'OD':  '08',
    'ACD': '03',
    'HR':  '04',
    'FNC': '05',
    'FIN': '05',
    'IOP': '06',
    'MKT': '07',
  };
  return map[branch.toUpperCase()] ?? '09';
}

function buildEmployeeId(role: string, branch: string, seq: number): string {
  return `${getPositionCode(role)}${getDeptCode(branch)}00${String(seq).padStart(2, '0')}`;
}

export async function POST() {
  const { error } = await requireRole(ADMIN_ROLES);
  if (error) return error;

  try {
    const all = await hrfsPrisma.branchStaff.findMany({ orderBy: { id: 'asc' } });

    for (const s of all) {
      const newId = buildEmployeeId(s.role || '', s.branch || '', s.id);
      await hrfsPrisma.branchStaff.update({
        where: { id: s.id },
        data: { employeeId: newId },
      });
    }

    return NextResponse.json({ message: `Rebuilt ${all.length} employee IDs` });
  } catch (error) {
    console.error('Error rebuilding IDs:', error);
    return NextResponse.json({ error: 'Failed to rebuild IDs' }, { status: 500 });
  }
}
