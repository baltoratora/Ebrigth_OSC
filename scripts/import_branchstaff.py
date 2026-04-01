#!/usr/bin/env python3
"""
Clean BranchStaff table and import from the Ebright Employee Database CSV.

Requirements:
    pip install pandas psycopg2-binary numpy openpyxl

Run:
    python scripts/import_branchstaff.py
"""

import sys
import numpy as np
import pandas as pd
import psycopg2

# ── CONFIG ────────────────────────────────────────────────────────────────────
CSV_PATH = r"C:\Users\User\Downloads\Ebright Employee Database - New Database (12_3_2025).csv"

DB_HOST = "103.209.156.174"
DB_PORT = 5433
DB_NAME = "ebright_hrfs"
DB_USER = "optidept"          # change if your login is different
DB_PASS = "ebrightoptidept2025"
TABLE   = "BranchStaff"

# ── CSV ROW STRUCTURE ─────────────────────────────────────────────────────────
# Excel layout (1-indexed):
#   Row 1 → merged section headers ("Contact Details", "Emergency…", etc.) → SKIP
#   Row 2 → actual column names  → HEADER
#   Row 3 → empty                → SKIP
#   Row 4 → colour-coding note   → SKIP
#   Row 5+ → real data
SKIP_ROWS = [0, 2, 3]   # 0-indexed rows to skip before using row-1 as header

# ─────────────────────────────────────────────────────────────────────────────

# New columns to add (they will be added with IF NOT EXISTS so safe to re-run)
ALTER_SQL = f"""
ALTER TABLE "{TABLE}"
  ADD COLUMN IF NOT EXISTS nickname           TEXT,
  ADD COLUMN IF NOT EXISTS nric               TEXT,
  ADD COLUMN IF NOT EXISTS dob                TEXT,
  ADD COLUMN IF NOT EXISTS age                TEXT,
  ADD COLUMN IF NOT EXISTS gender             TEXT,
  ADD COLUMN IF NOT EXISTS nationality        TEXT,
  ADD COLUMN IF NOT EXISTS home_address       TEXT,
  ADD COLUMN IF NOT EXISTS phone              TEXT,
  ADD COLUMN IF NOT EXISTS email              TEXT,
  ADD COLUMN IF NOT EXISTS residential        TEXT,
  ADD COLUMN IF NOT EXISTS emergency_name     TEXT,
  ADD COLUMN IF NOT EXISTS emergency_phone    TEXT,
  ADD COLUMN IF NOT EXISTS emergency_relation TEXT,
  ADD COLUMN IF NOT EXISTS signed_date        TEXT,
  ADD COLUMN IF NOT EXISTS start_date         TEXT,
  ADD COLUMN IF NOT EXISTS employment_type    TEXT,
  ADD COLUMN IF NOT EXISTS status             TEXT,
  ADD COLUMN IF NOT EXISTS bank               TEXT,
  ADD COLUMN IF NOT EXISTS bank_name          TEXT,
  ADD COLUMN IF NOT EXISTS bank_account       TEXT,
  ADD COLUMN IF NOT EXISTS university         TEXT,
  ADD COLUMN IF NOT EXISTS department         TEXT,
  ADD COLUMN IF NOT EXISTS position           TEXT,
  ADD COLUMN IF NOT EXISTS location           TEXT;
"""


def clean(val):
    """Return None for blank / NaN, else a clean string."""
    if val is None:
        return None
    if isinstance(val, float) and np.isnan(val):
        return None
    s = str(val).strip()
    if s in ("", "nan", "NaN", "None", "NaT", "-"):
        return None
    # Fix scientific notation for bank account numbers (e.g. 1.23E+11)
    if ("E+" in s or "e+" in s) and s.replace("E+", "").replace("e+", "").replace(".", "").replace("-", "").isdigit():
        try:
            s = str(int(float(s)))
        except Exception:
            pass
    return s


def read_csv():
    for enc in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
        try:
            df = pd.read_csv(
                CSV_PATH,
                skiprows=SKIP_ROWS,
                header=0,
                encoding=enc,
                dtype=str,
            )
            df.columns = df.columns.str.strip()   # remove leading/trailing spaces from headers
            df.dropna(how="all", inplace=True)
            df.reset_index(drop=True, inplace=True)
            print(f"✓ Read CSV  ({enc})  —  {len(df)} rows found")
            return df
        except Exception as e:
            print(f"  Encoding {enc} failed: {e}")
    sys.exit("✗ Could not read the CSV. Check CSV_PATH at the top of the script.")


def build_column_map(columns):
    """
    Map detected CSV column names → database column names.
    Uses case-insensitive substring matching so minor spelling
    differences in the CSV header are handled automatically.
    Duplicate columns (e.g. two 'Phone No.') are matched in order.
    """
    used = set()

    def find(*keywords):
        """Return the first unused column whose name contains any keyword."""
        for kw in keywords:
            for col in columns:
                if col in used:
                    continue
                if kw.lower() in col.lower():
                    used.add(col)
                    return col
        return None

    mapping = {}

    # ── Personal ─────────────────────────────────────────────────────────────
    c = find("full name", "fullname");          mapping[c] = "name"        if c else None
    c = find("nickname", "nick name");          mapping[c] = "nickname"    if c else None
    c = find("ic ", "nric", "pass no", "ic/");  mapping[c] = "nric"        if c else None
    c = find("dob", "date of birth");           mapping[c] = "dob"         if c else None
    c = find("age");                            mapping[c] = "age"         if c else None
    c = find("gender", "birth gen", " sex");    mapping[c] = "gender"      if c else None
    c = find("nationalit");                     mapping[c] = "nationality"  if c else None
    c = find("permanent", "home addr", "permanen", "address"); mapping[c] = "home_address" if c else None

    # ── Contact ───────────────────────────────────────────────────────────────
    c = find("phone");                          mapping[c] = "phone"       if c else None
    c = find("email");                          mapping[c] = "email"       if c else None
    c = find("residential", "residen");         mapping[c] = "residential"  if c else None
    # skip 2nd residential column (used.add already happened above if found)
    find("residential", "residen")   # consume 2nd duplicate if present

    # ── Emergency Contact ─────────────────────────────────────────────────────
    c = find("emergency name", "emerg name", "emergency contact name");
    if not c:
        c = find("name")  # fallback – the standalone "Name" col
    mapping[c] = "emergency_name" if c else None

    c = find("emergency phone", "emerg phone");
    if not c:
        c = find("phone")  # 2nd phone col
    mapping[c] = "emergency_phone" if c else None

    c = find("relation");                       mapping[c] = "emergency_relation" if c else None

    # ── Employment ────────────────────────────────────────────────────────────
    c = find("signed", "agreement");            mapping[c] = "signed_date"      if c else None
    c = find("hire date", "start date", "hire"); mapping[c] = "start_date"      if c else None
    c = find("type");                            mapping[c] = "employment_type"  if c else None
    c = find("status");                          mapping[c] = "status"           if c else None

    # ── Bank ─────────────────────────────────────────────────────────────────
    c = find("bank name", "bank nam");           mapping[c] = "bank_name"        if c else None
    c = find("bank acc", "account");             mapping[c] = "bank_account"     if c else None
    c = find("bank");                            mapping[c] = "bank"             if c else None

    # ── Job / Hire ────────────────────────────────────────────────────────────
    c = find("universit");                       mapping[c] = "university"       if c else None
    c = find("department", "departme");          mapping[c] = "department"       if c else None
    c = find("position");                        mapping[c] = "position"         if c else None
    c = find("location");                        mapping[c] = "location"         if c else None

    # Remove None keys
    return {k: v for k, v in mapping.items() if k is not None and v is not None}


def main():
    # ── 1. Read CSV ────────────────────────────────────────────────────────────
    df = read_csv()

    print("\n=== Detected CSV columns ===")
    for i, col in enumerate(df.columns):
        print(f"  [{i:2d}] {repr(col)}")

    col_map = build_column_map(df.columns.tolist())

    print("\n=== Column mapping (CSV → DB) ===")
    for csv_col, db_col in col_map.items():
        print(f"  {repr(csv_col):40s} → {db_col}")

    unmapped = [c for c in df.columns if c not in col_map]
    if unmapped:
        print(f"\n  (Skipped / unmapped: {unmapped})")

    ans = input("\nProceed with import? [y/N] ").strip().lower()
    if ans != "y":
        print("Aborted.")
        sys.exit(0)

    # ── 2. Connect ─────────────────────────────────────────────────────────────
    print("\nConnecting to database…")
    try:
        conn = psycopg2.connect(
            host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
            user=DB_USER, password=DB_PASS,
            connect_timeout=10,
        )
        conn.autocommit = False
        cur = conn.cursor()
        print("✓ Connected")
    except Exception as e:
        sys.exit(f"✗ Connection failed: {e}")

    try:
        # ── 3. Add new columns ─────────────────────────────────────────────────
        print("Adding new columns…")
        cur.execute(ALTER_SQL)
        conn.commit()
        print("✓ Columns ready")

        # ── 4. Truncate ────────────────────────────────────────────────────────
        print(f"Truncating {TABLE}…")
        cur.execute(f'TRUNCATE TABLE "{TABLE}" RESTART IDENTITY CASCADE;')
        conn.commit()
        print("✓ Table cleared")

        # ── 5. Build INSERT ────────────────────────────────────────────────────
        db_columns = list(col_map.values())

        # `role` = position, `branch` = location  (existing columns, keep them)
        pos_csv_col = next((k for k, v in col_map.items() if v == "position"), None)
        loc_csv_col = next((k for k, v in col_map.items() if v == "location"), None)

        extra_db  = []
        if pos_csv_col:
            extra_db.append("role")
        if loc_csv_col:
            extra_db.append("branch")

        all_db_cols   = db_columns + extra_db
        col_names_sql = ", ".join(f'"{c}"' for c in all_db_cols)
        placeholders  = ", ".join(["%s"] * len(all_db_cols))
        INSERT_SQL    = f'INSERT INTO "{TABLE}" ({col_names_sql}) VALUES ({placeholders})'

        # ── 6. Insert rows ─────────────────────────────────────────────────────
        inserted = 0
        skipped  = 0

        for _, row in df.iterrows():
            values = [clean(row.get(csv_col)) for csv_col in col_map.keys()]

            # Skip completely blank rows (all values are None)
            if all(v is None for v in values):
                skipped += 1
                continue

            name_idx = list(col_map.values()).index("name") if "name" in col_map.values() else -1

            # Duplicate position → role and location → branch
            if pos_csv_col:
                values.append(clean(row.get(pos_csv_col)))
            if loc_csv_col:
                values.append(clean(row.get(loc_csv_col)))

            try:
                cur.execute("SAVEPOINT row_save")
                cur.execute(INSERT_SQL, values)
                cur.execute("RELEASE SAVEPOINT row_save")
                inserted += 1
            except Exception as e:
                cur.execute("ROLLBACK TO SAVEPOINT row_save")
                name_val = values[name_idx] if name_idx >= 0 else "?"
                print(f"  ✗ Skipped row ({name_val}): {e}")
                skipped += 1

        conn.commit()
        print(f"\n✓ Done — inserted: {inserted}  |  skipped: {skipped}")

    except Exception as e:
        conn.rollback()
        print(f"✗ Error: {e}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
