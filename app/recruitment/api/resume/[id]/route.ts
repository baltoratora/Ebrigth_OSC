import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/nextauth";
// Recruitment lives in the ebright_hrfs database — use the HRFS client.
import { hrfsPrisma as prisma } from "@/lib/hrfs";
import { ROLES, normalizeRole } from "@/lib/roles";
import { downloadDriveFile } from "@/lib/googleDrive";

const ALLOWED = new Set<string>([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.HR, ROLES.HOD]);

// Stream an uploaded resume's binary. `?download=1` forces a download instead of
// inline preview.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  const role = normalizeRole((session?.user as { role?: string } | undefined)?.role);
  if (!session?.user || !role || !ALLOWED.has(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const resume = await prisma.recResume.findUnique({
    where: { id },
    select: { fileName: true, mimeType: true, data: true, driveFileId: true },
  });
  if (!resume) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Bytes live either on Google Drive (driveFileId) or in the DB (data). Fetch
  // from Drive via the service account so the file stays private — access is
  // still gated by the role check above.
  let bytes: Buffer;
  if (resume.driveFileId) {
    try {
      bytes = await downloadDriveFile(resume.driveFileId);
    } catch (e) {
      console.error("[resume] Drive download failed:", (e as Error).message);
      return NextResponse.json({ error: "File unavailable" }, { status: 502 });
    }
  } else if (resume.data) {
    bytes = Buffer.from(resume.data);
  } else {
    return NextResponse.json({ error: "File has no content" }, { status: 404 });
  }

  const download = req.nextUrl.searchParams.get("download") === "1";
  const disposition = `${download ? "attachment" : "inline"}; filename="${resume.fileName.replace(/"/g, "")}"`;
  const body = new Uint8Array(bytes);
  return new NextResponse(body, {
    headers: {
      "Content-Type": resume.mimeType || "application/octet-stream",
      "Content-Disposition": disposition,
      "Cache-Control": "private, no-store",
    },
  });
}
