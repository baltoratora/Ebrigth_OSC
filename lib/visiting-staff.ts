// Rotating "BM list" staff — based at a branch but assigned to HQ (or another
// branch) on specific weekdays. Two uses on the Attendance dashboard:
//   1. When they scan at HQ → "Visiting · <home>" badge (HQ isn't home).
//   2. On days the rotation assigns them to HQ → they're EXPECTED at HQ, so
//      they appear in the HQ "Missing" box if they haven't scanned.
//
// Working hours still come from the Staff Directory (schedule history) — the
// rotation only decides WHERE they're expected, not their hours or rest days.
//
// Source: the BM rotation sheet (columns Wed–Sun). Mon/Tue aren't listed, so
// there's no HQ expectation those days. `home` is the Sunday column (label only).
// Static config — update here when the sheet changes.

export type RotationDay = "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
type Week = Partial<Record<RotationDay, string>>;

interface RotationStaff {
  empNo: string;
  name: string;
  home: string; // home branch code (badge label)
  week: Week;   // weekday → branch code they're assigned to
}

export const VISITING_STAFF: RotationStaff[] = [
  { empNo: "55020060", name: "NIKI ELIESHYA BINTI ZAILAN",          home: "KLG", week: { Wed: "HQ", Thu: "KLG", Fri: "KLG", Sat: "KLG", Sun: "KLG" } },
  { empNo: "55020055", name: "KIRTIKHA A/P NARAYANAN",              home: "DK",  week: { Wed: "HQ", Thu: "HQ",  Fri: "HQ",  Sat: "DK",  Sun: "DK"  } },
  { empNo: "55020084", name: "EZRY EZWAN SHAH BIN AZIZAN",          home: "TSG", week: { Wed: "HQ", Thu: "DK",  Fri: "DK",  Sat: "TSG", Sun: "TSG" } },
  { empNo: "55020069", name: "SURAJ RAVI A/L RAVICHANDER",          home: "KD",  week: { Wed: "HQ", Thu: "KD",  Fri: "KD",  Sat: "KD",  Sun: "KD"  } },
  { empNo: "55020083", name: "MUHAMMAD AMIRUL RAFIQ BIN KADIR",     home: "PJY", week: { Wed: "HQ", Thu: "PJY", Fri: "PJY", Sat: "PJY", Sun: "PJY" } },
  { empNo: "55020067", name: "HANNAH JANE A/P JAYANATHAN",          home: "CJY", week: { Wed: "HQ", Thu: "CJY", Fri: "CJY", Sat: "CJY", Sun: "CJY" } },
  { empNo: "55020077", name: "KISHANTINI A/P RAJU",                 home: "BBB", week: { Wed: "HQ", Thu: "BBB", Fri: "BBB", Sat: "BBB", Sun: "BBB" } },
  { empNo: "55020078", name: "JANANI A/P SUBRAMANIAM",              home: "SP",  week: { Wed: "HQ", Thu: "HQ",  Fri: "SP",  Sat: "SP",  Sun: "SP"  } },
  { empNo: "55020076", name: "QISTINA AISYAH BINTI MOHMAD NOR",     home: "ST",  week: { Wed: "HQ", Thu: "ST",  Fri: "ST",  Sat: "ST",  Sun: "ST"  } },
  { empNo: "55020065", name: "NUR AIN ZULAIKHA BINTI SHAHROM",      home: "SA",  week: { Wed: "HQ", Thu: "SA",  Fri: "SA",  Sat: "SA",  Sun: "SA"  } },
  { empNo: "55020081", name: "MUHAMMAD IRFAN HAIRIE BIN SORNADI",   home: "SHA", week: { Wed: "HQ", Thu: "HQ",  Fri: "HQ",  Sat: "SHA", Sun: "SHA" } },
  { empNo: "55020057", name: "ZAHID ZULFIQAR BIN MOHAMAD ZAHID",    home: "AMP", week: { Wed: "HQ", Thu: "AMP", Fri: "AMP", Sat: "AMP", Sun: "AMP" } },
  { empNo: "55020062", name: "LAILA HAZIQAH BINTI REIN RITHAUDIN",  home: "KW",  week: { Wed: "HQ", Thu: "HQ",  Fri: "HQ",  Sat: "KW",  Sun: "KW"  } },
  { empNo: "55020039", name: "UMMU SYAFIQAH BINTI MAZLAN",          home: "ST",  week: { Wed: "HQ", Thu: "ST",  Fri: "ST",  Sat: "ST",  Sun: "ST"  } },
  { empNo: "55020061", name: "IZZATI SYAHIRAH BINTI MOHD KAMARULNIZAM", home: "BSP", week: { Wed: "HQ", Thu: "HQ", Fri: "BSP", Sat: "BSP", Sun: "BSP" } },
  { empNo: "55020064", name: "NUREEN UMAIRA BINTI ROSLI",           home: "RBY", week: { Wed: "HQ", Thu: "HQ",  Fri: "HQ",  Sat: "RBY", Sun: "RBY" } },
  { empNo: "55020073", name: "MUHAMMAD ARIF ZIKRY BIN SUHANDI",     home: "EGR", week: { Wed: "HQ", Thu: "HQ",  Fri: "EGR", Sat: "EGR", Sun: "EGR" } },
  { empNo: "55020068", name: "GUKENDRAN A/L VEELAYUTH",             home: "DA",  week: { Wed: "HQ", Thu: "DA",  Fri: "DA",  Sat: "DA",  Sun: "DA"  } },
];

const BY_EMP = new Map(VISITING_STAFF.map(s => [s.empNo, s]));
const JS_DAY_TO_ROTATION: (RotationDay | null)[] = [null, null, null, "Wed", "Thu", "Fri", "Sat"];
// index by getUTCDay(): 0 Sun … 6 Sat. Sunday handled explicitly below.

/** Home branch for a rotating staff member, or null if not on the list. */
export function visitingHomeBranch(empNo: string | null | undefined): string | null {
  if (!empNo) return null;
  return BY_EMP.get(empNo)?.home ?? null;
}

/** The branch this rotating person is assigned to on the given date, per the
 *  sheet. Returns null when they're not on the list, or the weekday isn't in
 *  the sheet (Mon/Tue). */
export function assignedBranchForDate(empNo: string | null | undefined, dateStr: string): string | null {
  if (!empNo) return null;
  const s = BY_EMP.get(empNo);
  if (!s) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const key: RotationDay | null = dow === 0 ? "Sun" : JS_DAY_TO_ROTATION[dow];
  if (!key) return null; // Mon/Tue — not in the sheet
  return s.week[key] ?? null;
}
