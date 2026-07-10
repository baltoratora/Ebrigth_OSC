-- Revert the FA inventory Stock Panel feature: drop its three tables.
--
-- These backed the (now removed) Marketing Stock Panel. No other tables
-- reference them (they only referenced fa_events), so a plain DROP is safe.
-- Idempotent via IF EXISTS. Run against the FA database (ebrightleads_db).

DROP TABLE IF EXISTS fa_inventory_returns;
DROP TABLE IF EXISTS fa_inventory_packed;
DROP TABLE IF EXISTS fa_inventory_global_stock;
