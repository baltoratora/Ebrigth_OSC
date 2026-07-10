// Run with: npx tsx scripts/audit-branchstaff-ids.ts
import { prisma } from "@/lib/prisma";

async function main() {
  const staff = await prisma.branchStaff.findMany({
    where: { status: "Active" },
    select: { id: true, name: true, nickname: true, employeeId: true, location: true },
    orderBy: { name: "asc" },
  });

  // Get the distinct empNo set actually present in AttendanceLog
  const logs = await prisma.attendanceLog.findMany({
    select: { empNo: true },
    distinct: ["empNo"],
  });
  const scannerIds = new Set(logs.map(l => l.empNo));

  console.log(`Active BranchStaff:    ${staff.length}`);
  console.log(`Distinct scanner IDs:  ${scannerIds.size}`);
  console.log("");

  const missingId      = staff.filter(s => !s.employeeId);
  const idNotInScanner = staff.filter(s => s.employeeId && !scannerIds.has(s.employeeId));
  const goodMatches    = staff.filter(s => s.employeeId && scannerIds.has(s.employeeId));

  console.log(`✓ Matches scanner data:  ${goodMatches.length}`);
  console.log(`✗ Has employeeId but no scanner rows: ${idNotInScanner.length}`);
  console.log(`⚠ Missing employeeId entirely:        ${missingId.length}`);
  console.log("");

  if (idNotInScanner.length > 0) {
    console.log("=== Staff with employeeId not in AttendanceLog ===");
    idNotInScanner.forEach(s => {
      console.log(`  ${s.name?.padEnd(40) ?? "—"}  employeeId=${s.employeeId}  location=${s.location}`);
    });
    console.log("");
  }

  if (missingId.length > 0) {
    console.log("=== Staff with no employeeId at all ===");
    missingId.forEach(s => {
      console.log(`  ${s.name?.padEnd(40) ?? "—"}  location=${s.location}`);
    });
  }
}

main().finally(() => prisma.$disconnect());
