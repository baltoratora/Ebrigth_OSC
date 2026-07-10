-- Rimbayu branch now operates on Friday in addition to Saturday and Sunday
UPDATE branch_operation_days
SET fri = true
WHERE branch = 'Rimbayu';
