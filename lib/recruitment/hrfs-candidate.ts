import "server-only";
import { hrfsPrisma } from "@/lib/hrfs";

/**
 * Candidate enrichment pulled from a table in the **ebright_hrfs** database
 * (separate from the portal DB where rec_recruit lives). The recruit card holds
 * the pipeline state; the richer applicant detail (city, form type, education,
 * gender, …) lives in HRFS and is fetched on demand for the detail modal.
 *
 * Source: ebright_hrfs.career_applications (the "Join the Team" form table). All
 * source-shape coupling lives in HRFS_CONFIG below — change it there only.
 * Best-effort: getHrfsCandidate() returns null (UI shows "—") if the table is
 * unreachable or there's no match.
 */
const HRFS_CONFIG = {
  /** Schema-qualified table. Empty = disabled. */
  table: 'public.career_applications',
  /** How a rec_recruit links to a row. `idColumn` is the primary, reliable link
   *  (rec_recruit.applicationId = career_applications.id); phone/email are the
   *  fallback for cards that predate the link. */
  match: {
    idColumn: "id",
    phoneColumn: "phone",
    emailColumn: "email",
  },
  /** Source column → our field. */
  columns: {
    name: "name",
    email: "email",
    phone: "phone",
    city: "city",
    formType: "source" /* "type of form" — e.g. website_join_the_team */,
    educationLevel: "education_level",
    gender: "gender",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
} as const;

export interface HrfsCandidate {
  name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  formType: string | null;
  educationLevel: string | null;
  gender: string | null;
  createdAt: string | null; // ISO
  updatedAt: string | null; // ISO
}

export function isHrfsConfigured(): boolean {
  return HRFS_CONFIG.table.trim().length > 0;
}

// Normalise a phone the same way the rest of the app does (strip non-digits,
// drop a leading Malaysian country code + trunk zero) so a "+60 12-345 6789"
// card matches a "0123456789" source row.
function phoneKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const core = raw.replace(/[^0-9]/g, "").replace(/^(60)?0*/, "");
  return core || null;
}

const q = (col: string) => `"${col.replace(/"/g, "")}"`; // safe identifier quoting

/**
 * Fetch the HRFS applicant record matching a recruit's phone or email.
 * Returns null when HRFS isn't configured yet, no match is found, or the query
 * fails (logged, never throws — enrichment is best-effort).
 */
export async function getHrfsCandidate(args: {
  applicationId?: number | null;
  email?: string | null;
  phone?: string | null;
}): Promise<HrfsCandidate | null> {
  if (!isHrfsConfigured()) return null;

  const c = HRFS_CONFIG.columns;
  const phone = phoneKey(args.phone);
  const email = args.email?.trim().toLowerCase() || null;
  if (args.applicationId == null && !phone && !email) return null;

  // Build the SELECT from config identifiers only (never user input) and bind
  // the match values as parameters.
  const select = [
    `${q(c.name)}        AS name`,
    `${q(c.email)}       AS email`,
    `${q(c.phone)}       AS phone`,
    `${q(c.city)}        AS city`,
    `${q(c.formType)}    AS "formType"`,
    `${q(c.educationLevel)} AS "educationLevel"`,
    `${q(c.gender)}      AS gender`,
    `${q(c.createdAt)}   AS "createdAt"`,
    `${q(c.updatedAt)}   AS "updatedAt"`,
  ].join(", ");

  const conds: string[] = [];
  const params: unknown[] = [];
  // Primary link: career_applications.id. When present, match on it alone.
  if (args.applicationId != null) {
    params.push(args.applicationId);
    conds.push(`${q(HRFS_CONFIG.match.idColumn)} = $${params.length}`);
  } else {
  if (phone) {
    params.push(`%${phone}%`);
    // Normalise the source phone in SQL the same way so formatting differences
    // don't break the match.
    conds.push(
      `regexp_replace(regexp_replace(COALESCE(${q(HRFS_CONFIG.match.phoneColumn)}::text,''), '[^0-9]', '', 'g'), '^(60)?0*', '') LIKE $${params.length}`,
    );
  }
  if (email) {
    params.push(email);
    conds.push(`lower(${q(HRFS_CONFIG.match.emailColumn)}::text) = $${params.length}`);
  }
  }

  const sql = `SELECT ${select} FROM ${HRFS_CONFIG.table} WHERE ${conds.join(" OR ")} LIMIT 1`;

  try {
    const rows = await hrfsPrisma.$queryRawUnsafe<Array<Record<string, unknown>>>(sql, ...params);
    const r = rows[0];
    if (!r) return null;
    const toIso = (v: unknown): string | null =>
      v instanceof Date ? v.toISOString() : v ? new Date(String(v)).toISOString() : null;
    const str = (v: unknown): string | null => (v == null ? null : String(v));
    return {
      name: str(r.name),
      email: str(r.email),
      phone: str(r.phone),
      city: str(r.city),
      formType: str(r.formType),
      educationLevel: str(r.educationLevel),
      gender: str(r.gender),
      createdAt: toIso(r.createdAt),
      updatedAt: toIso(r.updatedAt),
    };
  } catch (e) {
    console.error("[hrfs-candidate] enrichment query failed:", (e as Error).message);
    return null;
  }
}
