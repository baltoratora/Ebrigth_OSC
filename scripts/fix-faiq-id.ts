import { prisma } from "@/lib/prisma";
async function main() {
  const r = await prisma.branchStaff.updateMany({
    where: {
      OR: [
        { name: { contains: "FAIQ" } },
        { nickname: { equals: "FAIQ" } },
      ],
    },
    data: { employeeId: "44080014" },
  });
  console.log(`Updated ${r.count} BranchStaff row(s)`);
}
main().finally(() => prisma.$disconnect());
