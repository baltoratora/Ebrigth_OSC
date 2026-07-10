// Move existing DB-stored recruitment resumes (rec_resume.data bytea) into the
// recruitment Google Drive folder, keeping them PRIVATE (no public link — the
// app streams them through its auth-gated route). Idempotent.
//
//   # DRY RUN (default) — reports what it would move, writes nothing:
//   docker exec ebright-osc-v2 node scripts/migrate-resumes-to-drive.mjs
//
//   # APPLY — uploads each file to Drive, records driveFileId, clears the bytea:
//   docker exec ebright-osc-v2 node scripts/migrate-resumes-to-drive.mjs --apply
//
// Env (same service account as lib/googleDrive.ts):
//   GOOGLE_SERVICE_ACCOUNT_JSON            base64 service-account JSON
//   GOOGLE_DRIVE_RECRUITMENT_FOLDER_ID     target Shared Drive folder id
//   HRFS_DATABASE_URL (or DATABASE_URL)    where rec_resume lives (ebright_hrfs)

import { PrismaClient } from "@prisma/client";
import { drive as driveClient, auth as googleAuth } from "@googleapis/drive";
import { Readable } from "stream";

const APPLY = process.argv.includes("--apply");

const dbUrl = process.env.HRFS_DATABASE_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("[resume-migrate] HRFS_DATABASE_URL / DATABASE_URL not set — aborting");
  process.exit(1);
}
// Credentials from either GOOGLE_SERVICE_ACCOUNT_JSON (base64) or the split
// GOOGLE_DRIVE_SA_EMAIL + GOOGLE_DRIVE_SA_PRIVATE_KEY pair.
function driveCredentials() {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (json) {
    const c = JSON.parse(Buffer.from(json, "base64").toString("utf8"));
    return { client_email: c.client_email, private_key: c.private_key };
  }
  const email = process.env.GOOGLE_DRIVE_SA_EMAIL;
  const key = process.env.GOOGLE_DRIVE_SA_PRIVATE_KEY;
  if (email && key) {
    // Strip a wrapping pair of quotes (common env mistake) then unescape "\n".
    let k = key.trim();
    if (k.length >= 2 && ((k[0] === '"' && k[k.length - 1] === '"') || (k[0] === "'" && k[k.length - 1] === "'"))) {
      k = k.slice(1, -1);
    }
    return { client_email: email, private_key: k.replace(/\\n/g, "\n") };
  }
  return null;
}
const creds = driveCredentials();
const folderId = process.env.GOOGLE_DRIVE_RECRUITMENT_FOLDER_ID?.trim();
if (!creds || !folderId) {
  console.error(
    "[resume-migrate] Need a service account (GOOGLE_SERVICE_ACCOUNT_JSON, or GOOGLE_DRIVE_SA_EMAIL + GOOGLE_DRIVE_SA_PRIVATE_KEY) and GOOGLE_DRIVE_RECRUITMENT_FOLDER_ID — aborting",
  );
  process.exit(1);
}

const prisma = new PrismaClient({ datasourceUrl: dbUrl });

function driveService() {
  const authObj = new googleAuth.GoogleAuth({
    credentials: { client_email: creds.client_email, private_key: creds.private_key },
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return driveClient({ version: "v3", auth: authObj });
}

async function uploadPrivate(drive, buffer, fileName, mimeType) {
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id",
    supportsAllDrives: true,
  });
  if (!res.data.id) throw new Error("Drive upload returned no id");
  return res.data.id;
}

async function main() {
  console.log(`\n=== resume → Drive migration ${APPLY ? "(APPLY — WILL WRITE)" : "(dry run)"} ===`);
  console.log(`folder: ${folderId}\n`);

  // Candidates: rows still stored in the DB and not yet on Drive.
  const pending = await prisma.recResume.findMany({
    where: { driveFileId: null },
    select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
    orderBy: { uploadedAt: "asc" },
  });
  console.log(`resumes with no driveFileId: ${pending.length}`);

  if (!APPLY) {
    const totalKb = Math.round(pending.reduce((s, r) => s + (r.sizeBytes || 0), 0) / 1024);
    console.log(`would upload ~${totalKb} KB across ${pending.length} file(s).`);
    console.log("\nDRY RUN — nothing written. Re-run with --apply to migrate.\n");
    return;
  }
  if (!pending.length) { console.log("Nothing to do.\n"); return; }

  const drive = driveService();
  let moved = 0, skipped = 0, failed = 0;
  for (const r of pending) {
    // Fetch the bytes one row at a time to keep memory flat.
    const row = await prisma.recResume.findUnique({ where: { id: r.id }, select: { data: true } });
    if (!row?.data) { skipped++; continue; } // already null (nothing to move)
    try {
      const fileId = await uploadPrivate(drive, Buffer.from(row.data), r.fileName || "resume", r.mimeType || "application/octet-stream");
      // Record the Drive id and drop the DB copy in one update.
      await prisma.recResume.update({ where: { id: r.id }, data: { driveFileId: fileId, data: null } });
      moved++;
      if (moved % 25 === 0) console.log(`  … ${moved}/${pending.length}`);
    } catch (e) {
      failed++;
      console.error(`  FAILED ${r.id} (${r.fileName}): ${e.message}`);
    }
  }
  console.log(`\nAPPLIED — moved ${moved}, skipped ${skipped} (already empty), failed ${failed}.`);
  console.log(failed ? "Re-run to retry failures (idempotent).\n" : "Done.\n");
}

main()
  .catch((e) => { console.error("[resume-migrate] failed:", e); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
