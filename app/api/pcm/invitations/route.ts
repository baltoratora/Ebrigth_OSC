import { NextRequest, NextResponse } from "next/server";
import {
  countInvitationsForSessionBranch,
  createInvitationRow,
  getEventStatus,
  getQuotaForSessionBranch,
  InvitationRejected,
} from "@pcm/_lib/events.server";
import { BranchCode, InvitationStatus, InviteType } from "@pcm/_types";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/pcm/invitations — create one invitation.
// Returns { invitation: null, reason } when the create is rejected by a
// business rule (already invited / quota full / event closed / booked on
// another day / etc.). The 409 code signals "valid request but conflicts
// with current state" so the client can distinguish from a real server error.
export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const { eventId, sessionId, studentId, branch, invitedBy } = body;
    const targetGrade: number = Number(body.targetGrade) || 0;
    const status: InvitationStatus = body.initialStatus ?? "invited";
    const allowOverQuota: boolean = body.allowOverQuota === true;
    const inviteType: InviteType = body.inviteType === "renewal" ? "renewal" : "progress";

    // Event must exist and be in an invitable state (unless walk-in override).
    const eventStatus = await getEventStatus(eventId);
    if (!eventStatus) {
      return NextResponse.json(
        { invitation: null, reason: "Event not found" },
        { status: 404 }
      );
    }
    if (
      !allowOverQuota &&
      (eventStatus === "closed" || eventStatus === "completed")
    ) {
      return NextResponse.json(
        { invitation: null, reason: "Event is closed" },
        { status: 409 }
      );
    }

    if (!allowOverQuota) {
      const quota = await getQuotaForSessionBranch(sessionId, branch as BranchCode);
      if (quota == null) {
        return NextResponse.json(
          { invitation: null, reason: "No quota for this branch" },
          { status: 409 }
        );
      }
      const used = await countInvitationsForSessionBranch(sessionId, branch as BranchCode);
      if (used >= quota) {
        return NextResponse.json(
          { invitation: null, reason: "Quota full" },
          { status: 409 }
        );
      }
    }

    try {
      const created = await createInvitationRow({
        eventId,
        sessionId,
        studentId,
        branch: branch as BranchCode,
        targetGrade,
        status,
        invitedBy,
        inviteType,
      });
      return NextResponse.json({ invitation: created });
    } catch (err) {
      if (err instanceof InvitationRejected) {
        // Multi-grade rules: already invited / wrong day / grade dup.
        return NextResponse.json(
          { invitation: null, reason: err.reason },
          { status: 409 }
        );
      }
      throw err;
    }
  } catch (err) {
    console.error("[api/fa/invitations POST] failed:", err);
    return NextResponse.json({ error: "Failed to create invitation" }, { status: 500 });
  }
}
