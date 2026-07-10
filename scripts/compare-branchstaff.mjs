import { PrismaClient } from '@prisma/client';

const CRM_URL = process.env.DATABASE_URL;
const HRFS_URL = process.env.HRFS_DATABASE_URL;

const crm = new PrismaClient({ datasourceUrl: CRM_URL });
const hrfs = new PrismaClient({ datasourceUrl: HRFS_URL });

const crmCount = await crm.$queryRawUnsafe(`SELECT count(*)::int AS n FROM crm."BranchStaff";`);
const hrfsCount = await hrfs.$queryRawUnsafe(`SELECT count(*)::int AS n FROM public."BranchStaff";`);

console.log('crm."BranchStaff" rows        :', crmCount[0].n);
console.log('ebright_hrfs public rows      :', hrfsCount[0].n);

// id-by-id comparison
const crmIds = await crm.$queryRawUnsafe(`SELECT id FROM crm."BranchStaff" ORDER BY id;`);
const hrfsIds = await hrfs.$queryRawUnsafe(`SELECT id FROM public."BranchStaff" ORDER BY id;`);
const a = new Set(crmIds.map(r => r.id));
const b = new Set(hrfsIds.map(r => r.id));
const onlyCrm = [...a].filter(x => !b.has(x));
const onlyHrfs = [...b].filter(x => !a.has(x));
console.log('IDs only in crm view          :', onlyCrm);
console.log('IDs only in ebright_hrfs       :', onlyHrfs);

// Are the rows identical content-wise? checksum a few key columns
const crmSample = await crm.$queryRawUnsafe(`SELECT id, name, email, branch FROM crm."BranchStaff" ORDER BY id DESC LIMIT 5;`);
const hrfsSample = await hrfs.$queryRawUnsafe(`SELECT id, name, email, branch FROM public."BranchStaff" ORDER BY id DESC LIMIT 5;`);
console.log('\nLast 5 from crm view:');   console.table(crmSample);
console.log('Last 5 from ebright_hrfs:'); console.table(hrfsSample);

await crm.$disconnect();
await hrfs.$disconnect();
