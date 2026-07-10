// One-shot backfill: creates the BurnlistWeek for 2026-05-13 using the real
// historical data the user supplied. Safe to re-run — if the week already
// exists, the script exits without changing anything.

import { Pool } from "pg";
import "dotenv/config";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");

const WEEK_KEY = "2026-05-13";

const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
function toYmd(humanDate) {
  // "11 May 2026" → "2026-05-11"
  const [d, mon, y] = humanDate.trim().split(/\s+/);
  const m = String(MONTHS[mon]).padStart(2, "0");
  return `${y}-${m}-${String(Number(d)).padStart(2, "0")}`;
}

// done = true ONLY for Extend / Archive per the user's rule.
function defaultDone(cta) {
  return cta === "Extend" || cta === "Archive";
}

const data = [
  // Branch, Name, Expiry (human), Remarks, CTA
  ["ST",   "Nik Nur Dhuha",                                            "11 May 2026", "",                                                                                                                "Extend"],
  ["ST",   "Mikayla Aafiyah Binti Mohd Anis",                          "9 May 2026",  "",                                                                                                                "Archive"],
  ["ST",   "Avianna Lim Xin Huey",                                     "25 Apr 2026", "pending payment",                                                                                                 ""],

  ["SA",   "Adam yusuf bin ahsan",                                     "11 May 2026", "extend to finish",                                                                                                "Extend"],
  ["SA",   "Dhia Iskandar",                                            "11 May 2026", "prompting payment",                                                                                               "No Action"],
  ["SA",   "HUD BIN NOR REDZA",                                        "11 May 2026", "archive",                                                                                                         "Archive"],
  ["SA",   "Sarah Isabel Maryam binti Ahmad Suhael",                   "9 May 2026",  "prompting payment",                                                                                               "No Action"],
  ["SA",   "Kimberly Khoo Kai Qing",                                   "8 May 2026",  "extend to finish",                                                                                                "Extend"],
  ["SA",   "Nur Fathiyyah Nadhrah Binti Muhammad Nadhar",              "4 May 2026",  "extend to finish",                                                                                                "Extend"],
  ["SA",   "Annas Nael bin Mohd Azhari",                               "4 May 2026",  "extend to finish",                                                                                                "Extend"],
  ["SA",   "ALIYA ZARIFAH MOHAMAD YUSOF",                              "27 Apr 2026", "prompting payment",                                                                                               "No Action"],

  ["SP",   "Tan Xuan Thong",                                           "11 May 2026", "WANTS FINISH REMAINING CREDITS",                                                                                  ""],
  ["SP",   "Olivia Seet Meng Yan",                                     "30 Apr 2026", "WANTS FINISH REMAINING CREDITS",                                                                                  ""],
  ["SP",   "Audrey Seet Kar Yan",                                      "30 Apr 2026", "WANTS FINISH REMAINING CREDITS",                                                                                  ""],
  ["SP",   "Alexxander Miqhail",                                       "25 Apr 2026", "WANTS FINISH REMAINING CREDITS",                                                                                  ""],
  ["SP",   "SAYYIDAH NAFISAH BINTI HUZAIFAH",                          "20 Apr 2026", "NO RESPONSE",                                                                                                     ""],
  ["SP",   "Rheeya Avanthisha Nair Suhil",                             "12 Apr 2026", "NO RESPONSE",                                                                                                     ""],
  ["SP",   "Rayshen Aaryash Nair Suhil",                               "12 Apr 2026", "NO RESPONSE",                                                                                                     ""],
  ["SP",   "Yashica Mahendran",                                        "3 Apr 2026",  "PENDING FA",                                                                                                      ""],
  ["SP",   "Keith Lim Khai Chen",                                      "2 Mar 2026",  "NO RESPONSE",                                                                                                     ""],

  ["KD",   "NIK AIRIS BINTI NIK NORHAM",                               "10 May 2026", "EXTEND 1 WEEK TO COMPLETE REPLACEMENT CLASS FIRST",                                                               "Extend"],
  ["KD",   "Declan Tang Jun Herng",                                    "7 May 2026",  "TEXTED, PENDING REPLY",                                                                                           "No Action"],
  ["KD",   "Ammar Muhsin",                                             "4 May 2026",  "FOLLOWED UP 2 TIMES, PARENTS CANT CONFIRM FOR NOW, CAN ARCHIVE",                                                  "Archive"],
  ["KD",   "MUHAMMAD ARRAZI BIN AZIRUL HAFIZ",                         "4 May 2026",  "NOT FOR NOW, CAN ARCHIVE",                                                                                        "Archive"],
  ["KD",   "Nur Sarah Alisha",                                         "4 May 2026",  "FOLLOWED UP 2 TIMES, PARENTS CANT CONFIRM FOR NOW, CAN ARCHIVE",                                                  "Archive"],
  ["KD",   "Alfred W",                                                 "2 May 2026",  "FOLLOWED UP 2ND TIME, PENDING REPLY",                                                                             "No Action"],
  ["KD",   "Arash hadrami",                                            "2 May 2026",  "FOLLOWED UP 2ND TIME, PENDING REPLY",                                                                             "No Action"],
  ["KD",   "Sufya Adzra Binti Muhammad Haffizzuddin Ammin",            "29 Apr 2026", "FREEZE FIRST FOR NOW, AS PARENT WANTS TO COMPLETE CREDITS FIRST",                                                 "Extend"],

  ["PJY",  "AEDI RAYYAN BIN SHAZWAN ARIEF",                            "10 May 2026", "TEXTED, NO RESPONSE",                                                                                             "No Action"],
  ["PJY",  "Nur Hana Najihah binti Noor Hisyam",                       "9 May 2026",  "TEXTED, NO RESPONSE",                                                                                             "No Action"],
  ["PJY",  "Adra Nuralyana Hairul Fahmi",                              "9 May 2026",  "TEXTED, NO RESPONSE",                                                                                             "No Action"],
  ["PJY",  "Mikail Rayyan Bin Azman",                                  "6 May 2026",  "TEXTED, NO RESPONSE",                                                                                             "No Action"],
  ["PJY",  "Ayra Zahra binti Ahmad Nuruddin",                          "3 May 2026",  "TEXTED, NO RESPONSE",                                                                                             "No Action"],
  ["PJY",  "Annasaa’i Bin Mohd Auza’ie",                     "28 Apr 2026", "TEXTED, NO RESPONSE",                                                                                             "No Action"],
  ["PJY",  "Eashal Solih Ibrahim",                                     "26 Apr 2026", "TEXTED, NO RESPONSE",                                                                                             "No Action"],
  ["PJY",  "Zakwaan Solih Ibrahim",                                    "26 Apr 2026", "TEXTED, NO RESPONSE",                                                                                             "No Action"],
  ["PJY",  "NUR SAFYA BINTI MUHAMMAD RAZI",                            "13 Apr 2026", "WILL RENEW 16TH MAY ONWARDS",                                                                                     "Renew"],
  ["PJY",  "Muhammad Shahaan ul Haq",                                  "6 Apr 2026",  "TEXTED, NO RESPONSE",                                                                                             "No Action"],

  ["AMP",  "Ayden Zafry bin Mohammad Zaid",                            "11 May 2026", "pending reply",                                                                                                   "No Action"],
  ["AMP",  "Deven Siva Shankar",                                       "11 May 2026", "pending reply",                                                                                                   "No Action"],
  ["AMP",  "RAJA HANAN AISY SOFEA BINTI RAJA HASLAUDIN",               "11 May 2026", "pending reply",                                                                                                   "No Action"],
  ["AMP",  "Clemira Ghania Almahyra Hartono",                          "10 May 2026", "pending reply, changing package",                                                                                 "No Action"],
  ["AMP",  "Aaira Amina",                                              "4 May 2026",  "not renewing for now",                                                                                            "Archive"],
  ["AMP",  "Puteri Sophea Hana",                                       "4 May 2026",  "pending reply",                                                                                                   "No Action"],
  ["AMP",  "Sophea Aleesya binti Muhammad Hafiz",                      "4 May 2026",  "pending reply",                                                                                                   "No Action"],
  ["AMP",  "Raisya alya binti muhammad fauzan ghani",                  "1 May 2026",  "pending reply",                                                                                                   "No Action"],
  ["AMP",  "Umar Harun Al Rasyid Hartono",                             "25 Apr 2026", "pending reply, changing package",                                                                                 "No Action"],
  ["AMP",  "Rayyan Shafeeq bin Rameses",                               "20 Apr 2026", "pending reply",                                                                                                   "No Action"],
  ["AMP",  "Rayqal Shaheed Bin Abdullah",                              "20 Apr 2026", "pending reply",                                                                                                   "No Action"],
  ["AMP",  "Hadhirah Bt Mohamad Hafiz",                                "20 Apr 2026", "pending reply",                                                                                                   "No Action"],
  ["AMP",  "Assyfa Zaskia binti Mohammad Gazali",                      "13 Apr 2026", "pending reply",                                                                                                   "No Action"],
  ["AMP",  "HANA SUMAYYAH BINTI HIRYANIZAM",                           "13 Apr 2026", "pending reply",                                                                                                   "No Action"],
  ["AMP",  "Rose Hannah Maryuma",                                      "13 Apr 2026", "pending reply, after FA this month will renew",                                                                   "No Action"],

  ["CJY",  "Marissa Binti Wasyil",                                     "11 May 2026", "waiting",                                                                                                         "No Action"],
  ["CJY",  "Yihyeon So",                                               "10 May 2026", "waiting",                                                                                                         "No Action"],
  ["CJY",  "Aidan Nufayl bin Akmal Hakim",                             "10 May 2026", "waiting to reply",                                                                                                "No Action"],
  ["CJY",  "Aaira Delisha M. Rozaimi",                                 "9 May 2026",  "waiting to reply",                                                                                                "No Action"],
  ["CJY",  "QAYS AHMAD ILHAM BIN AHMAD AIMAN",                         "7 May 2026",  "",                                                                                                                "Archive"],
  ["CJY",  "FATIMAH AZZAHRO BINTI AHMAD AIMAN",                        "7 May 2026",  "",                                                                                                                "Archive"],
  ["CJY",  "IZZ AQIL BIN MUHAMAD FAHMI",                               "2 May 2026",  "",                                                                                                                "Archive"],
  ["CJY",  "Muhammad Yusuf Bin Muhammad Naqib",                        "29 Apr 2026", "",                                                                                                                "Archive"],
  ["CJY",  "Mika Aryan Bin Muhamad Izzat",                             "28 Apr 2026", "waiting to reply",                                                                                                "No Action"],
  ["CJY",  "Fatimah Muhammad Nurhelmi",                                "24 Apr 2026", "",                                                                                                                "Archive"],
  ["CJY",  "Izz Zandra",                                               "12 Apr 2026", "",                                                                                                                "Renew"],
  ["CJY",  "Yara Kannan",                                              "12 Apr 2026", "",                                                                                                                "Archive"],
  ["CJY",  "Izz Zayyan Bin Muhamad Mustafah",                          "12 Apr 2026", "",                                                                                                                "Renew"],
  ["CJY",  "ADI AFHAM BIN MUHAMMAD HANIF",                             "11 Apr 2026", "parents gonna pay",                                                                                               "No Action"],
  ["CJY",  "NUR DHIA ALISYA BINTI MUHAMMAD HANIF",                     "11 Apr 2026", "parents gonna pay",                                                                                               "No Action"],

  ["KLG",  "Firas Hadif bin Anuar",                                    "11 May 2026", "",                                                                                                                "Archive"],
  ["KLG",  "Aimia Nuha binti Azhari",                                  "11 May 2026", "waiting to reply",                                                                                                "No Action"],
  ["KLG",  "Matthew Lim En Yi",                                        "9 May 2026",  "waiting to reply",                                                                                                "Extend"],
  ["KLG",  "Tharanni Pathmanathan",                                    "8 May 2026",  "waiting to reply",                                                                                                "No Action"],
  ["KLG",  "Tran Gia Lin",                                             "8 May 2026",  "waiting to reply",                                                                                                "No Action"],
  ["KLG",  "Harinee Sujendran",                                        "3 May 2026",  "",                                                                                                                "Archive"],
  ["KLG",  "Jitesh Sujendran",                                         "3 May 2026",  "",                                                                                                                "Archive"],
  ["KLG",  "Khaleed Al-Waleed bin Mohd Hafifi",                        "25 Apr 2026", "",                                                                                                                "Archive"],
  ["KLG",  "Tharuni Gunhalingam",                                      "18 Apr 2026", "",                                                                                                                "Archive"],
  ["KLG",  "Arenya a/p Bovenish",                                      "2 Jan 2026",  "",                                                                                                                "No Action"],

  ["DA",   "Myreen dianza bt mohd ihsa",                               "11 May 2026", "",                                                                                                                "Extend"],
  ["DA",   "Muhammad bukhari bin mahmud",                              "11 May 2026", "",                                                                                                                "Extend"],
  ["DA",   "Auliya binti Fairuz",                                      "10 May 2026", "",                                                                                                                "Extend"],
  ["DA",   "Teoh Mun Hey",                                             "10 May 2026", "",                                                                                                                "Extend"],
  ["DA",   "Muhammad Mustafa",                                         "9 May 2026",  "",                                                                                                                "Extend"],
  ["DA",   "Nabilah Binti Abdul Rahim",                                "6 May 2026",  "",                                                                                                                "Extend"],
  ["DA",   "Emily Iman Zaidi Isham",                                   "9 Apr 2026",  "",                                                                                                                "Extend"],

  ["BBB",  "IZZAH AQEELAH BINTI SYAHIDUDDIN",                          "9 May 2026",  "PENDING FOR FA",                                                                                                  "Archive"],

  ["DK",   "Nailah Muhd Taufiq",                                       "11 May 2026", "follow up",                                                                                                       "Extend"],
  ["DK",   "Nur Aisyah Binti Muhammad Arif",                           "11 May 2026", "prompted",                                                                                                        "Extend"],
  ["DK",   "AISHA SYAFFIA BINTI MOHD SAZWAN",                          "11 May 2026", "5 more classes",                                                                                                  "No Action"],
  ["DK",   "Tuan Nur Khadija binti Tuan Mohd Yusoff",                  "11 May 2026", "follow up",                                                                                                       "Extend"],
  ["DK",   "Nurul Iris Carissa Binti Mohd Hafez",                      "11 May 2026", "extend 7 more weeks",                                                                                             "Extend"],
  ["DK",   "Zahira Aysha Binti Mohamad Zulfikri",                      "11 May 2026", "follow up",                                                                                                       "Extend"],
  ["DK",   "Muhammad Al-Fatih bin Mohd Fahmi",                         "11 May 2026", "not renewing [left with 2 class]",                                                                                "No Action"],
  ["DK",   "Nur Hasya Ammara binti Mohd Fahmi",                        "11 May 2026", "not renewing [left with 2 class]",                                                                                "No Action"],
  ["DK",   "Auliya Maisarah Bt Ahmad Husni Mubarrok",                  "11 May 2026", "prompted",                                                                                                        "Extend"],
  ["DK",   "Muhammad Nuqman Afiq bin Mohammad Hazim Afiq",             "11 May 2026", "follow up",                                                                                                       "Extend"],
  ["DK",   "Umar Zhafran Bin Imran Azam",                              "11 May 2026", "prompted",                                                                                                        "Extend"],
  ["DK",   "NABILAH BINTI JAIME",                                      "11 May 2026", "prompted",                                                                                                        "Extend"],
  ["DK",   "ADAM FARIDZ BIN KAMAL FARIDZ",                             "11 May 2026", "follow up",                                                                                                       "Extend"],
  ["DK",   "Irene Arissa Binti Abd Muhaimin Syahman",                  "11 May 2026", "7 class more",                                                                                                    "No Action"],

  ["SHA",  "Thoriq bin Muhammad Fikry",                                "10 May 2026", "Already approached, no response",                                                                                 "No Action"],
  ["SHA",  "Hannah Dhaniyah Binti Muhammad Zamzuri",                   "26 Apr 2026", "The parent said they wanna renew quarter 4 or early 2027 lol",                                                    "Archive"],
  ["SHA",  "Ayra Ameena binti Yasir",                                  "25 Apr 2026", "Appraoched but ghosted",                                                                                          "No Action"],
  ["SHA",  "Umar Fathi bin Muhammad Khairul Fitri",                    "24 Apr 2026", "Already approached, no response",                                                                                 "No Action"],
  ["SHA",  "MUHAMMAD HARIZ ILMAN BIN HAIRUL IKMAL",                    "18 Apr 2026", "Already approached, no response",                                                                                 "Archive"],
  ["SHA",  "Muhammad Arif Yusuf bin Muhammad Azwar",                   "16 Apr 2026", "The parent said cannot renew bc Arif occupied with exam and tuitions. Will come back again next year lol",         "Archive"],

  ["BTHO", "Muhammad Luthfi Bin Mat Zin",                              "11 May 2026", "1 FA PENDING",                                                                                                    "Archive"],
  ["BTHO", "Arissa Nursafiya Binti Mohamad Yazid",                     "11 May 2026", "TEXTED, NO REPLY",                                                                                                "No Action"],
  ["BTHO", "Auna Azzahra Bt Mohd Fathi Hussein",                       "10 May 2026", "not renewing",                                                                                                    "Archive"],
  ["BTHO", "Ahlaa AlFateh Bin Mohd Fathi Hussein",                     "10 May 2026", "not renewing",                                                                                                    "Archive"],
  ["BTHO", "Aurora Az Zahraa binti Anuar",                             "9 May 2026",  "1 FA PENDING 31 MAY, NOT RENEWING",                                                                               "Archive"],
  ["BTHO", "Nasuha Binti Mohd Yusri",                                  "6 May 2026",  "TEXTED, NO REPLY",                                                                                                "No Action"],
  ["BTHO", "Putri Hanania Humaira Binti Mohamad Azimin",               "30 Apr 2026", "not renewing",                                                                                                    "Archive"],
  ["BTHO", "Muhammad Azfar Ismat Bin Azfaruddin Izzat",                "23 Apr 2026", "TEXTED, NO REPLY",                                                                                                "No Action"],

  ["ONL",  "Aneesa Aqilah bt Ahmad Suhaimi",                           "11 May 2026", "",                                                                                                                "No Action"],
  ["ONL",  "Aadra Malaiqa Binti Azrul Nizam",                          "11 May 2026", "",                                                                                                                "Extend"],
  ["ONL",  "Naira binti Mohamed Razman",                               "9 May 2026",  "pending payment",                                                                                                 "Renew"],
  ["ONL",  "Aaron Tan Liang Yu",                                       "9 May 2026",  "",                                                                                                                "Archive"],
  ["ONL",  "Raed bin Mohamed Razman",                                  "9 May 2026",  "",                                                                                                                "Archive"],
  ["ONL",  "KHADEJA KHAYYIRA BINTI MOHD HAZWAN",                       "8 May 2026",  "Freeze first, will renew after Raya",                                                                             "Extend"],
  ["ONL",  "Luhya Ali",                                                "3 May 2026",  "",                                                                                                                "No Action"],
  ["ONL",  "Charvadaarinee",                                           "2 May 2026",  "",                                                                                                                "No Action"],
  ["ONL",  "Lee Zhi Xuan",                                             "27 Apr 2026", "",                                                                                                                "No Action"],
  ["ONL",  "Fathannur bin firdaus",                                    "27 Apr 2026", "",                                                                                                                "No Action"],
  ["ONL",  "RAISHA MIKAYLA BINTI MUHAMAD RIZZUAN",                     "3 Apr 2026",  "waiting payment",                                                                                                 "Renew"],

  ["BSP",  "AISYAH HUMAYRA BINTI AFFIZIE",                             "11 May 2026", "Can archive, will not be renewing due to boarding school schedule. Pending G2 showcase",                          "Archive"],
  ["BSP",  "Fathiyah Auni Binti Muhammad Faiz",                        "11 May 2026", "Can archive, will not be renewing due to Kumon and Tuition schedule. Pending G2 showcase",                        "Archive"],

  ["EGR",  "Zara Ardeeny Mohd Nazri",                                  "4 May 2026",  "already renewed",                                                                                                 "Renew"],
  ["EGR",  "Muhammad Rizq Haikal",                                     "1 May 2026",  "havent prompted for renewal yet",                                                                                 "No Action"],
  ["EGR",  "IRDINA ZUHAIRA BINTI MOHAMAD NAZREN",                      "19 Apr 2026", "not renewing",                                                                                                    "Archive"],

  ["TSG",  "mikayla rose",                                             "5 May 2026",  "WANTS FINISH REMAINING CREDITS",                                                                                  "Extend"],
];

const pool = new Pool({ connectionString: url, max: 2 });

function cuid() {
  // Cheap cuid-shaped id — Prisma's @default(cuid()) only kicks in when you
  // go through the client. Inserting via raw SQL needs us to generate the id.
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "c";
  for (let i = 0; i < 24; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Idempotent check
    const existing = await client.query(`SELECT id FROM burnlist_week WHERE "weekKey" = $1`, [WEEK_KEY]);
    if (existing.rows.length > 0) {
      console.log(`Week ${WEEK_KEY} already exists (id=${existing.rows[0].id}). Skipping backfill.`);
      await client.query("ROLLBACK");
    } else {
      const weekId = cuid();
      await client.query(
        `INSERT INTO burnlist_week (id, "weekKey", "createdAt") VALUES ($1, $2, NOW())`,
        [weekId, WEEK_KEY],
      );
      console.log(`Created BurnlistWeek ${WEEK_KEY} (id=${weekId})`);

      let inserted = 0;
      let counter = 0;
      for (const [branch, name, expiryHuman, remarks, cta] of data) {
        const id = cuid();
        const studentRecordId = `hist-${WEEK_KEY}-${String(++counter).padStart(4, "0")}`;
        const expiry = toYmd(expiryHuman);
        const done = defaultDone(cta);
        await client.query(
          `INSERT INTO burnlist_entry
             (id, "weekId", "studentRecordId", "studentName", branch, "expiryDate", cta, remarks, done, "updatedAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
          [id, weekId, studentRecordId, name, branch, expiry, cta, remarks, done],
        );
        inserted++;
      }

      await client.query("COMMIT");
      console.log(`Inserted ${inserted} BurnlistEntry rows for ${WEEK_KEY}`);
    }
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  // Summary by branch + cta
  const { rows: summary } = await pool.query(
    `SELECT branch, COUNT(*)::int AS n,
            SUM(CASE WHEN cta = 'Extend' THEN 1 ELSE 0 END)::int AS extend,
            SUM(CASE WHEN cta = 'Archive' THEN 1 ELSE 0 END)::int AS archive,
            SUM(CASE WHEN cta = 'Renew' THEN 1 ELSE 0 END)::int AS renew,
            SUM(CASE WHEN cta = 'No Action' THEN 1 ELSE 0 END)::int AS no_action,
            SUM(CASE WHEN cta = '' THEN 1 ELSE 0 END)::int AS empty,
            SUM(CASE WHEN done THEN 1 ELSE 0 END)::int AS done_count
       FROM burnlist_entry e
       JOIN burnlist_week w ON e."weekId" = w.id
      WHERE w."weekKey" = $1
      GROUP BY branch
      ORDER BY branch`,
    [WEEK_KEY],
  );
  console.log("\nPer-branch summary for", WEEK_KEY);
  console.table(summary);
} catch (e) {
  console.error("Backfill failed:", e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
