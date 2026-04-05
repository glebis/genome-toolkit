-- 005: Add practical category and health domain to action_progress
-- Non-destructive: adds columns only

ALTER TABLE action_progress ADD COLUMN practical_category TEXT;
ALTER TABLE action_progress ADD COLUMN health_domain TEXT;
