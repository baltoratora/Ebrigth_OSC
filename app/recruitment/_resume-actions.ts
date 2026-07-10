"use server";

import { revalidatePath } from "next/cache";
// Recruitment lives in the ebright_hrfs database — use the HRFS client.
import { hrfsPrisma as prisma } from "@/lib/hrfs";
import { requireRecruitmentAccess, stageIdByShortCode } from "@/lib/recruitment/access";
import {
  isRecruitmentDriveConfigured,
  recruitmentDriveFolderId,
  uploadPrivateFile,
  deleteDriveFile,
} from "@/lib/googleDrive";

export interface ResumeResult {
  ok: boolean;
  error?: string;
  resumeId?: string;
}

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
]);

/**
 * Upload a resume for a recruit and move the card into "Resume Submission (RS)".
 * Fired by the drag-to-RS popup once HR attaches a file. The binary is stored
 * in rec_resume (bytea) so it survives redeploys without external storage.
 *
 * The form MUST include `recruitId` and a `file`. Cancelling the popup instead
 * moves the card to "Buffer Resume (BR)" — that's a plain stage move done on the
 * client, so it isn't handled here.
 */
export async function uploadResume(formData: FormData): Promise<ResumeResult> {
  try {
    const { userId } = await requireRecruitmentAccess();
    const recruitId = String(formData.get("recruitId") ?? "");
    const file = formData.get("file");
    if (!recruitId) return { ok: false, error: "Missing recruit" };
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "No file attached" };
    if (file.size > MAX_BYTES) return { ok: false, error: "File too large (max 15 MB)" };
    const mime = file.type || "application/octet-stream";
    if (ALLOWED_MIME.size && !ALLOWED_MIME.has(mime)) {
      return { ok: false, error: "Unsupported file type (PDF, Word, PNG, JPG only)" };
    }

    // When uploaded from the Library (noMove), just attach the file — don't drag
    // the candidate back into the Resume Submission stage.
    const noMove = String(formData.get("noMove") ?? "") === "1";

    const recruit = await prisma.recRecruit.findFirst({
      where: { id: recruitId, deletedAt: null },
      select: { id: true, stageId: true },
    });
    if (!recruit) return { ok: false, error: "Recruit not found" };

    const rsStageId = noMove ? null : await stageIdByShortCode("RS");
    if (!noMove && !rsStageId) return { ok: false, error: 'Stage "Resume Submission (RS)" not found' };

    const buf = Buffer.from(await file.arrayBuffer());

    // Prefer the recruitment Google Drive folder (private) when configured;
    // fall back to storing the bytes in the DB if it isn't set or the upload
    // fails. Exactly one of {data, driveFileId} ends up populated.
    let driveFileId: string | null = null;
    let dbData: Buffer | null = buf;
    if (isRecruitmentDriveConfigured()) {
      try {
        const res = await uploadPrivateFile(buf, file.name || "resume", mime, recruitmentDriveFolderId()!);
        driveFileId = res.fileId;
        dbData = null; // stored on Drive — don't also keep it in Postgres
      } catch (e) {
        console.error("[resume] Drive upload failed, storing in DB instead:", (e as Error).message);
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const resume = await tx.recResume.create({
        data: {
          recruitId,
          fileName: file.name || "resume",
          mimeType: mime,
          sizeBytes: buf.length,
          data: dbData ? new Uint8Array(dbData) : undefined,
          driveFileId: driveFileId ?? undefined,
          uploadedBy: userId,
        },
        select: { id: true },
      });
      if (rsStageId && recruit.stageId !== rsStageId) {
        await tx.recRecruit.update({ where: { id: recruitId }, data: { stageId: rsStageId } });
        await tx.recStageHistory.create({
          data: { recruitId, fromStageId: recruit.stageId, toStageId: rsStageId, changedBy: userId, note: "Resume submitted" },
        });
      }
      return resume;
    });

    revalidatePath("/recruitment/opportunity");
    revalidatePath("/recruitment/library");
    return { ok: true, resumeId: created.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed" };
  }
}

/** Delete an uploaded resume (Library page). */
export async function deleteResume(resumeId: string): Promise<ResumeResult> {
  try {
    await requireRecruitmentAccess();
    const existing = await prisma.recResume.findUnique({ where: { id: resumeId }, select: { driveFileId: true } });
    await prisma.recResume.delete({ where: { id: resumeId } });
    // Best-effort: remove the Drive copy too so we don't orphan it.
    if (existing?.driveFileId) {
      try { await deleteDriveFile(existing.driveFileId); }
      catch (e) { console.error("[resume] Drive delete failed:", (e as Error).message); }
    }
    revalidatePath("/recruitment/library");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed" };
  }
}
