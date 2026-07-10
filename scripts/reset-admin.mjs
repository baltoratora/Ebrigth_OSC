// One-off: upsert admin@ebright.com with password 'admin'.
// Run with: node scripts/reset-admin.mjs
import "dotenv/config";
import pg from "pg";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const email = "admin@ebright.com";
const plain = "admin";
const hash = await bcrypt.hash(plain, 10);

const pool = new pg.Pool({ connectionString: url });
try {
  // Prisma maps `User` model -> table `User` (PascalCase). Try both, common in Prisma setups.
  const res = await pool.query(
    `INSERT INTO "User" (email, "passwordHash", role, "branchName", name, status)
     VALUES ($1, $2, 'SUPER_ADMIN', NULL, 'Admin', 'ACTIVE')
     ON CONFLICT (email) DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash", role = 'SUPER_ADMIN', status = 'ACTIVE'
     RETURNING id, email, role`,
    [email, hash]
  );
  console.log("OK:", res.rows[0]);
  console.log(`Login with: ${email} / ${plain}`);
} catch (err) {
  console.error("Failed:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
