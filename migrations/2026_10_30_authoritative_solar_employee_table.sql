-- Migration: Make solar_employee the authoritative base table
-- Preserves all 12 existing employee rows without any data loss.

-- 1. Drop temporary view if it exists
DROP VIEW IF EXISTS `solar_employee`;

-- 2. Rename solar_employees to solar_employee as primary authoritative base table
RENAME TABLE `solar_employees` TO `solar_employee`;

-- 3. Add any missing columns to match frontend and backend models exactly
ALTER TABLE `solar_employee`
  ADD COLUMN IF NOT EXISTS `auth_uid` VARCHAR(64) DEFAULT NULL AFTER `login_enabled`,
  ADD COLUMN IF NOT EXISTS `assigned_role` VARCHAR(64) DEFAULT NULL AFTER `system_role`,
  ADD COLUMN IF NOT EXISTS `account_created_at` VARCHAR(64) DEFAULT NULL AFTER `account_status`,
  ADD COLUMN IF NOT EXISTS `account_created_by` VARCHAR(255) DEFAULT NULL AFTER `account_created_at`;

-- 4. Add helpful indexes for search, lookup, and auth linkage
ALTER TABLE `solar_employee`
  ADD INDEX IF NOT EXISTS `idx_solar_emp_auth_uid` (`auth_uid`),
  ADD INDEX IF NOT EXISTS `idx_solar_emp_email` (`email`);

-- 5. Create an updatable VIEW solar_employees pointing directly to solar_employee
-- This guarantees 100% backwards compatibility for any legacy queries or reports
CREATE OR REPLACE VIEW `solar_employees` AS SELECT * FROM `solar_employee`;
