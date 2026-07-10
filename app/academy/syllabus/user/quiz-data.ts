// Shared storage layer for quiz responses on the USER page.
//
// TODO(db): when the quiz feature graduates beyond a localStorage prototype,
// replace these helpers with API calls hitting a Prisma-backed table
// (quiz_response: id, userEmail, branchName, submittedAt, answersJson).
// The function signatures should stay the same so the UI doesn't change.

// Single source of truth for the branch list — shared by the USER table
// (renders one row per branch) and the Create Quiz publish modal (targets a
// subset of these). Adding/removing a branch here updates both pages.
export const USER_TABLE_BRANCHES = [
  "Subang Taipan (ST)",
  "Setia Alam (SA)",
  "Shah Alam (SHA)",
  "Klang (KLG)",
  "Rimbayu (RBY)",
  "Denai Alam (DA)",
  "Eco Grandeur (EGR)",
  "Ampang (AMP)",
  "Kajang TTDI Grove (KTG)",
  "Bandar Tun Hussein Onn (BTHO)",
  "Danau Kota (DK)",
  "Kota Damansara (KD)",
  "Sri Petaling (SP)",
  "Taman Sri Gombak (TSG)",
  "Bandar Baru Bangi (BBB)",
  "Bandar Seri Putra (BSP)",
  "Cyberjaya (CJY)",
  "Putrajaya (PJY)",
  "Kota Warisan (KW)",
  "Online (ONL)",
  "Tropicana Sungai Buloh (TSB)",
  "Puchong Utama (PU)",
  "Puncak Jalil (PJL)",
] as const;

export type QuizResponse = {
  branchName: string;
  email: string;
  submittedAt: number;
};

export const QUIZ_RESPONSES_KEY = "USER-quiz-responses";

/**
 * Strips the parenthetical code suffix and lowercases so branch labels from
 * the table ("Subang Taipan (ST)") match the bare branchName stored on the
 * User row ("Subang Taipan" or "subang taipan").
 */
export function normalizeBranch(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();
}

export function loadResponses(): QuizResponse[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUIZ_RESPONSES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QuizResponse[]) : [];
  } catch {
    return [];
  }
}

function saveResponses(responses: QuizResponse[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(QUIZ_RESPONSES_KEY, JSON.stringify(responses));
}

/**
 * One response per email — re-submitting updates the existing record's
 * timestamp rather than inflating the answered count.
 */
export function recordResponse(branchName: string, email: string) {
  const responses = loadResponses();
  const filtered = responses.filter((r) => r.email !== email);
  filtered.push({ branchName, email, submittedAt: Date.now() });
  saveResponses(filtered);
}

/** Count of unique emails who answered, matched against a table branch label. */
export function countAnsweredForBranch(
  responses: QuizResponse[],
  branchLabel: string,
): number {
  const target = normalizeBranch(branchLabel);
  const emails = new Set<string>();
  for (const r of responses) {
    if (normalizeBranch(r.branchName) === target) emails.add(r.email);
  }
  return emails.size;
}
