import "server-only";
import { pool } from "@pcm/_lib/db";

const TENANT = "ebright";

/**
 * Renewal-gift inventory. A student qualifies for a gift when their PCM
 * RENEWAL invitation is PAID and the payment happened within 3 days after the
 * session day (Fri session ⇒ paid by Mon). Each qualifying invitation carries
 * its hand-over state from pcm_renewal_gifts.
 */
export interface RenewalGiftItem {
  invitationId: string;
  studentId: string;
  studentName: string;
  branch: string;
  grade: number | null;
  coachName: string | null;
  eventId: string;
  eventName: string;
  sessionDate: string | null; // ISO yyyy-MM-dd
  paidAt: string | null;      // ISO
  academyDistributed: boolean;
  giftGiven: boolean;
  proofLink: string | null;
}

export async function fetchRenewalInventory(branch?: string | null): Promise<RenewalGiftItem[]> {
  const b = branch && branch !== "all" ? branch : null;
  const { rows } = await pool.query(
    `SELECT i.id AS invitation_id, i.student_id, i.branch, i.target_grade, i.paid_at,
            COALESCE(NULLIF(i.coach_name,''), sr.coach_name) AS coach_name,
            e.id AS event_id,
            e.name AS event_name,
            (e.start_date::date + (s.day_number - 1)) AS session_date,
            sr.name AS student_name,
            g.academy_distributed, g.gift_given, g.proof_link
       FROM pcm_invitations i
       JOIN pcm_sessions s ON s.id = i.session_id
       JOIN pcm_events   e ON e.id = i.event_id
       LEFT JOIN studentrecords    sr ON sr.id::text = i.student_id
       LEFT JOIN pcm_renewal_gifts g  ON g.invitation_id = i.id
      WHERE i.invite_type = 'renewal'
        AND i.paid = true
        AND i.paid_at IS NOT NULL
        AND i.paid_at::date <= (e.start_date::date + (s.day_number - 1) + 3)
        AND ($1::text IS NULL OR i.branch = $1)
      ORDER BY e.start_date DESC, i.branch, sr.name`,
    [b],
  );
  return rows.map((r) => ({
    invitationId: r.invitation_id,
    studentId: String(r.student_id),
    studentName: r.student_name ?? `#${r.student_id}`,
    branch: r.branch,
    grade: r.target_grade ?? null,
    coachName: r.coach_name ?? null,
    eventId: r.event_id,
    eventName: r.event_name,
    sessionDate: r.session_date ? new Date(r.session_date).toISOString().slice(0, 10) : null,
    paidAt: r.paid_at ? new Date(r.paid_at).toISOString() : null,
    academyDistributed: r.academy_distributed === true,
    giftGiven: r.gift_given === true,
    proofLink: r.proof_link ?? null,
  }));
}

/** Upsert the gift hand-over state for one invitation. */
export async function updateRenewalGift(
  invitationId: string,
  patch: { academyDistributed?: boolean; giftGiven?: boolean; proofLink?: string | null },
  userId: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO pcm_renewal_gifts (invitation_id, tenant_id) VALUES ($1, $2)
     ON CONFLICT (invitation_id) DO NOTHING`,
    [invitationId, TENANT],
  );
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (patch.academyDistributed !== undefined) {
    fields.push(`academy_distributed = $${i++}`); values.push(patch.academyDistributed);
    fields.push(`academy_distributed_at = ${patch.academyDistributed ? "now()" : "NULL"}`);
    fields.push(`academy_distributed_by = $${i++}`); values.push(patch.academyDistributed ? userId : null);
  }
  if (patch.giftGiven !== undefined) {
    fields.push(`gift_given = $${i++}`); values.push(patch.giftGiven);
    fields.push(`gift_given_at = ${patch.giftGiven ? "now()" : "NULL"}`);
    fields.push(`gift_given_by = $${i++}`); values.push(patch.giftGiven ? userId : null);
  }
  if (patch.proofLink !== undefined) {
    fields.push(`proof_link = $${i++}`); values.push(patch.proofLink || null);
  }
  if (fields.length === 0) return;
  fields.push(`updated_at = now()`);
  values.push(invitationId);
  await pool.query(
    `UPDATE pcm_renewal_gifts SET ${fields.join(", ")} WHERE invitation_id = $${i}`,
    values,
  );
}
