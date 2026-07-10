// ─── Branch locations (ordered for display) ───────────────────────────────────

export const BRANCH_LIST = [
  'HQ', 'Online', 'Subang Taipan', 'Setia Alam', 'Sri Petaling',
  'Kota Damansara', 'Putrajaya', 'Ampang', 'Cyberjaya', 'Klang',
  'Denai Alam', 'Bandar Baru Bangi', 'Danau Kota', 'Shah Alam',
  'Bandar Tun Hussein Onn', 'Eco Grandeur', 'Bandar Seri Putra',
  'Bandar Rimbayu', 'Taman Sri Gombak', 'Kota Warisan', 'Kajang',
  'Tropicana Sungai Buloh',
] as const;

export function normalizeLocation(raw: string | null): string {
  if (!raw) return 'Unknown';
  const clean = raw.trim().replace(/[\r\n]+/g, ' ').trim();
  const key   = clean.toLowerCase();
  // All HQ codes — internal departments that are physically at HQ
  const HQ_CODES = new Set(['hq', 'od', 'op', 'ops', 'ceo', 'mkt', 'acd', 'iop', 'fnc', 'fin', 'hr', 'hr/iop', 'marketing']);
  if (HQ_CODES.has(key) || key.includes('hq')) return 'HQ';
  const MAP: Record<string, string> = {
    'onl': 'Online', 'online': 'Online',
    'st': 'Subang Taipan', 'subang taipan': 'Subang Taipan', 'subang taipan & ampang': 'Subang Taipan',
    'sa': 'Setia Alam', 'setia alam': 'Setia Alam', 'setia alam, denai alam': 'Setia Alam',
    'sp': 'Sri Petaling', 'seri petaling': 'Sri Petaling',
    'kd': 'Kota Damansara', 'kota damansara': 'Kota Damansara',
    'pjy': 'Putrajaya', 'putrajaya': 'Putrajaya',
    'amp': 'Ampang', 'ampang': 'Ampang',
    'cjy': 'Cyberjaya', 'cyberjaya': 'Cyberjaya',
    'klg': 'Klang', 'klang': 'Klang', 'kw': 'Kota Warisan',
    'da': 'Denai Alam', 'denai alam': 'Denai Alam',
    'bbb': 'Bandar Baru Bangi',
    'dk': 'Danau Kota',
    'sha': 'Shah Alam', 'shah alam': 'Shah Alam',
    'btho': 'Bandar Tun Hussein Onn',
    'egr': 'Eco Grandeur',
    'bsp': 'Bandar Seri Putra',
    'rby': 'Bandar Rimbayu',
    'tsg': 'Taman Sri Gombak',
    'tsb': 'Tropicana Sungai Buloh', 'tropicana sungai buloh': 'Tropicana Sungai Buloh',
    'ktg': 'Kajang TTDI Groove', 'kajang ttdi groove': 'Kajang TTDI Groove', 'kota warisan': 'Kota Warisan',
    'kajang': 'Kajang',
    'dpu': 'Dataran Puchong Utama', 'dataran puchong utama': 'Dataran Puchong Utama',
  };
  return MAP[key] ?? clean;
}

/**
 * Compare two branch labels for equivalence, tolerating the code-vs-full-name
 * drift across the app (User.branchName holds "Klang" / "Rimbayu" while
 * BranchStaff.branch holds short codes "KLG" / "RBY"). Accepts an exact match,
 * a match after normalizeLocation on both sides, or a substring match either
 * way ("Rimbayu" ⊂ "Bandar Rimbayu").
 */
export function branchesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const norm = (v: string) => v.toLowerCase().trim();
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return true;
  const fa = norm(normalizeLocation(a));
  const fb = norm(normalizeLocation(b));
  if (fa === fb) return true;
  if (fa && fb && (fa.includes(fb) || fb.includes(fa))) return true;
  return false;
}

// ─── Role / branch / contract options ─────────────────────────────────────────

export const DEPARTMENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "",       label: "— None —" },
  { value: "CEO",    label: "CEO" },
  { value: "OD",     label: "OD" },
  { value: "OP",     label: "OP" },
  { value: "MKT",    label: "MKT" },
  { value: "ACD",    label: "ACD" },
  { value: "FIN",    label: "FIN" },
  { value: "HR/IOP", label: "HR/IOP" },
];

// Canonical job-role values stored in BranchStaff.role and shown in the
// employee form (add + edit). Standardised on a single convention: employment
// prefix + single space + role, no hyphens, short codes. Keep this list and
// the lib/roles.ts auth mapping (authRoleForStaffRole) in sync.
export const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "CEO", label: "CEO" },
  { value: "FT HOD", label: "FT HOD" },
  { value: "FT EXEC", label: "FT EXEC" },
  { value: "FT Coach", label: "FT Coach" },
  { value: "PT Coach", label: "PT Coach" },
  { value: "BM", label: "BM" },
  { value: "INT", label: "INT" },
];

// Coach roles, used by Academy-scoped filters. The legacy hyphenated forms
// ("FT - Coach" / "PT - Coach") are included so those filters keep matching any
// rows that predate the role-naming standardisation migration. Once the
// migration is confirmed across all environments the legacy entries can be
// dropped, leaving just the canonical values.
export const COACH_ROLES = ["FT Coach", "PT Coach"] as const;
export const COACH_ROLES_WITH_LEGACY = ["FT Coach", "PT Coach", "FT - Coach", "PT - Coach"] as const;

export const CONTRACT_OPTIONS = [
  { value: "", label: "None" },
  { value: "9 MONTH", label: "9 Month" },
  { value: "12 MONTH", label: "12 Month" },
  { value: "15 MONTH", label: "15 Month" },
  { value: "18 MONTH", label: "18 Month" },
  { value: "PERMANENT", label: "Permanent" },
];

export const BRANCH_OPTIONS = [
  { value: "HQ", label: "HQ" },
  { value: "ONL", label: "ONL" },
  { value: "ST", label: "ST" },
  { value: "SP", label: "SP" },
  { value: "SA", label: "SA" },
  { value: "KD", label: "KD" },
  { value: "PJY", label: "PJY" },
  { value: "AMP", label: "AMP" },
  { value: "CJY", label: "CJY" },
  { value: "KLG", label: "KLG" },
  { value: "DA", label: "DA" },
  { value: "BBB", label: "BBB" },
  { value: "DK", label: "DK" },
  { value: "SHA", label: "SHA" },
  { value: "BTHO", label: "BTHO" },
  { value: "EGR", label: "EGR" },
  { value: "BSP", label: "BSP" },
  { value: "RBY", label: "RBY" },
  { value: "TSG", label: "TSG" },
  { value: "KW", label: "KW" },
  { value: "KTG", label: "KTG" },
  { value: "DPU", label: "DPU" },
  { value: "TSB", label: "TSB" },
];

export const GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
];

export const ROLE_CODE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "11", label: "11 — CEO" },
  { value: "22", label: "22 — HOD" },
  { value: "33", label: "33 — EXEC" },
  { value: "44", label: "44 — INTERN" },
  { value: "55", label: "55 — BM" },
  { value: "66", label: "66 — FT COACH" },
  { value: "77", label: "77 — PT COACH" },
];

export const ROLE_CODES = ROLE_CODE_OPTIONS.map((o) => o.value);

export function getRoleLabel(role: string): string {
  const option = ROLE_OPTIONS.find((opt) => opt.value === role);
  return option?.label || role;
}

export function getBranchLabel(branch: string): string {
  const option = BRANCH_OPTIONS.find((opt) => opt.value === branch);
  return option?.label || branch;
}

export function getContractLabel(contract: string): string {
  const option = CONTRACT_OPTIONS.find((opt) => opt.value === contract);
  return option?.label || contract;
}

export function getGenderLabel(gender: string): string {
  const option = GENDER_OPTIONS.find((opt) => opt.value === gender);
  return option?.label || gender;
}
