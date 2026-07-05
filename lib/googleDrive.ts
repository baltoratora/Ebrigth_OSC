import "server-only";
import { drive as driveClient, auth as googleAuth } from "@googleapis/drive";
import { Readable } from "stream";

/**
 * Upload proof photos to Google Drive via a service account.
 * Uses the lightweight per-API package (@googleapis/drive) instead of the
 * heavy `googleapis` meta-package, which can OOM the Next.js build.
 * Env:
 *   GOOGLE_SERVICE_ACCOUNT_JSON — base64-encoded service-account JSON
 *   GOOGLE_DRIVE_FOLDER_ID      — target Drive folder id
 */
/**
 * Resolve the service-account credentials from EITHER supported convention:
 *   - GOOGLE_SERVICE_ACCOUNT_JSON  (base64-encoded full JSON), or
 *   - GOOGLE_DRIVE_SA_EMAIL + GOOGLE_DRIVE_SA_PRIVATE_KEY  (split; the deployed
 *     `ebright-osc-v2` container uses this pair). Env-escaped "\n" in the key
 *     are converted back to real newlines.
 * Returns null when neither is present.
 */
function driveCredentials(): { client_email: string; private_key: string } | null {
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (json) {
    const c = JSON.parse(Buffer.from(json, "base64").toString("utf8"));
    return { client_email: c.client_email, private_key: c.private_key };
  }
  const email = process.env.GOOGLE_DRIVE_SA_EMAIL;
  const key = process.env.GOOGLE_DRIVE_SA_PRIVATE_KEY;
  if (email && key) {
    return { client_email: email, private_key: normalizePrivateKey(key) };
  }
  return null;
}

/**
 * Normalise a service-account private key read from an env var:
 *  - strip a single pair of wrapping quotes (a common .env / docker-compose
 *    mistake — the quotes become part of the value and make the PEM undecodable
 *    with OpenSSL 3 → "DECODER routines::unsupported"), then
 *  - convert escaped "\n" sequences into real newlines.
 */
function normalizePrivateKey(raw: string): string {
  let k = raw.trim();
  if (
    k.length >= 2 &&
    ((k[0] === '"' && k[k.length - 1] === '"') || (k[0] === "'" && k[k.length - 1] === "'"))
  ) {
    k = k.slice(1, -1);
  }
  return k.replace(/\\n/g, "\n");
}

function hasServiceAccount(): boolean {
  return (
    !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    (!!process.env.GOOGLE_DRIVE_SA_EMAIL && !!process.env.GOOGLE_DRIVE_SA_PRIVATE_KEY)
  );
}

export function isGoogleDriveConfigured(): boolean {
  return hasServiceAccount() && !!process.env.GOOGLE_DRIVE_FOLDER_ID;
}

/** Authenticated Drive v3 client. Throws if no service-account credentials. */
function driveService() {
  const creds = driveCredentials();
  if (!creds) {
    throw new Error(
      "Google Drive service account not configured (set GOOGLE_SERVICE_ACCOUNT_JSON, or GOOGLE_DRIVE_SA_EMAIL + GOOGLE_DRIVE_SA_PRIVATE_KEY).",
    );
  }
  const authObj = new googleAuth.GoogleAuth({
    credentials: { client_email: creds.client_email, private_key: creds.private_key },
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return driveClient({ version: "v3", auth: authObj });
}

function getDrive() {
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) {
    throw new Error("Google Drive is not configured (GOOGLE_DRIVE_FOLDER_ID missing).");
  }
  return { drive: driveService(), folderId: folderId.trim() };
}

// ─── Recruitment resumes (separate Shared Drive folder, kept PRIVATE) ─────────

/** The recruitment Shared Drive folder id, or null when unset. Distinct from
 *  GOOGLE_DRIVE_FOLDER_ID (proof photos) so resumes live in their own folder. */
export function recruitmentDriveFolderId(): string | null {
  const id = process.env.GOOGLE_DRIVE_RECRUITMENT_FOLDER_ID?.trim();
  return id || null;
}
export function isRecruitmentDriveConfigured(): boolean {
  return hasServiceAccount() && !!recruitmentDriveFolderId();
}

/**
 * Upload a file to a Drive folder WITHOUT granting public access. No
 * "anyone with the link" permission is created — the file is reachable only via
 * the service account, so viewing must be proxied through an auth-gated route.
 * Used for candidate resumes (PII).
 */
export async function uploadPrivateFile(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  folderId: string,
): Promise<{ fileId: string }> {
  const drive = driveService();
  const stream = Readable.from(buffer);
  const response = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType, body: stream },
    fields: "id",
    supportsAllDrives: true,
  });
  const fileId = response.data.id;
  if (!fileId) throw new Error("Google Drive upload returned no file id");
  return { fileId };
}

/** Download a Drive file's bytes by id (service-account auth). */
export async function downloadDriveFile(fileId: string): Promise<Buffer> {
  const drive = driveService();
  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" },
  );
  return Buffer.from(res.data as ArrayBuffer);
}

/** Permanently delete a Drive file by id. Best-effort — callers may ignore. */
export async function deleteDriveFile(fileId: string): Promise<void> {
  const drive = driveService();
  await drive.files.delete({ fileId, supportsAllDrives: true });
}

/**
 * Upload a base64 file, make it link-viewable, return the shareable link.
 * `mimeType` defaults to image/jpeg (proof-photo callers) but accepts any type
 * (e.g. application/pdf, image/png) for justification evidence. Any
 * `data:<type>;base64,` prefix is stripped regardless of the declared type.
 */
export async function uploadToGoogleDrive(
  base64Data: string,
  fileName: string,
  mimeType: string = "image/jpeg",
): Promise<{ fileId: string; webViewLink: string }> {
  const { drive, folderId } = getDrive();
  const cleaned = base64Data.replace(/^data:[^;]+;base64,/, "");
  const buffer = Buffer.from(cleaned, "base64");
  const stream = Readable.from(buffer);

  const response = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType, body: stream },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });

  const fileId = response.data.id;
  if (!fileId) throw new Error("Google Drive upload returned no file id");

  // Anyone with the link can view (so the academy can open the proof).
  await drive.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
    supportsAllDrives: true,
  });

  return {
    fileId,
    webViewLink: response.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
  };
}
