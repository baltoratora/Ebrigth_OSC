// Run with: npx tsx scripts/cleanup-empname.ts
import { prisma } from "@/lib/prisma";

async function main() {
  const rows = await prisma.attendanceLog.findMany({
    select: { id: true, empNo: true, empName: true },
  });
  const bad = rows.filter(r => r.empName === r.empNo);
  console.log(`Found ${bad.length} rows where empName === empNo`);
  if (bad.length === 0) return;
  await prisma.attendanceLog.updateMany({
    where: { id: { in: bad.map(r => r.id) } },
    data:  { empName: "" },
  });
  console.log(`Cleaned ${bad.length} rows.`);
}

main().finally(() => prisma.$disconnect());
