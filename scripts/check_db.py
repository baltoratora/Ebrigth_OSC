import psycopg2

conn = psycopg2.connect(
    host="103.209.156.174", port=5433,
    dbname="ebright_hrfs", user="optidept",
    password="ebrightoptidept2025"
)
cur = conn.cursor()
cur.execute('SELECT COUNT(*) FROM "BranchStaff"')
print("Total rows:", cur.fetchone()[0])
conn.close()
