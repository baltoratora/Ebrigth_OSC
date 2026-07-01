// Human-friendly labels for the raw machine values that arrive from forms /
// GHL (e.g. source = "website_join_the_team"). Keeps raw snake_case strings out
// of the UI. Used by the board, detail modal, library and dashboard.

// Known exact mappings get a hand-tuned label; everything else falls back to a
// generic prettifier so a brand-new form value still renders cleanly.
const KNOWN: Record<string, string> = {
  website_join_the_team: "Website — Join the Team",
  join_the_team: "Join the Team",
  hr_recruitment_form: "HR Recruitment Form",
  hr_recruitment: "HR Recruitment",
  walk_in: "Walk-in",
  walkin: "Walk-in",
  referral: "Referral",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  google: "Google",
  linkedin: "LinkedIn",
  jobstreet: "JobStreet",
  maukerja: "Maukerja",
  ricebowl: "Ricebowl",
};

// Acronyms that should stay uppercased after the generic prettifier.
const ACRONYMS = new Set(["hr", "kl", "hq", "od", "cns", "id"]);

/** Title-case a raw token string, splitting on _ - and whitespace. */
function prettify(raw: string): string {
  return raw
    .trim()
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

/** Friendly label for any raw machine value (source, form type, …). */
export function prettyLabel(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  return KNOWN[trimmed.toLowerCase()] ?? prettify(trimmed);
}

/** Friendly "type of form" label. */
export const formTypeLabel = prettyLabel;
/** Friendly "source" label. */
export const sourceLabel = prettyLabel;
