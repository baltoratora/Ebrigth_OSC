-- Original definition of public.hrfs_sync_user_to_crm() captured before patching.
-- To restore, run this file against the ebright_hrfs database.

CREATE OR REPLACE FUNCTION public.hrfs_sync_user_to_crm()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM dblink_exec(
    'host=103.209.156.174 port=5433 dbname=ebright_crm user=optidept password=ebrightoptidept2025',
    format(
      'INSERT INTO crm.hrfs_user_mirror (id, email, "passwordHash", role, "branchName", "createdAt", name, status)
       VALUES (%L, %L, %L, %L, %L, %L, %L, %L)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         "passwordHash" = EXCLUDED."passwordHash",
         role = EXCLUDED.role,
         "branchName" = EXCLUDED."branchName",
         name = EXCLUDED.name,
         status = EXCLUDED.status',
      NEW.id, NEW.email, NEW."passwordHash", NEW.role, NEW."branchName",
      NEW."createdAt", NEW.name, NEW.status
    )
  );
  RETURN NEW;
END $function$
