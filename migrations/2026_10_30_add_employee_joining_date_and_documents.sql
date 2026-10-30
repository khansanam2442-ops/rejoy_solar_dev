-- Migration: 2026_10_30_add_employee_joining_date_and_documents.sql
-- Description: Ensure solar_employees has joining_date, documents_json, assigned_role,
-- and create the solar_employee_documents audit table for persistent document storage.

-- 1. Ensure joining_date exists on solar_employees
SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'solar_employees'
    AND COLUMN_NAME = 'joining_date'
);

SET @sql_add_joining = IF(@col_exists = 0,
  'ALTER TABLE `solar_employees` ADD COLUMN `joining_date` DATE DEFAULT NULL AFTER `email`;',
  'ALTER TABLE `solar_employees` MODIFY COLUMN `joining_date` DATE DEFAULT NULL;'
);

PREPARE stmt FROM @sql_add_joining;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Ensure documents_json exists on solar_employees
SET @col_doc_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'solar_employees'
    AND COLUMN_NAME = 'documents_json'
);

SET @sql_add_doc = IF(@col_doc_exists = 0,
  'ALTER TABLE `solar_employees` ADD COLUMN `documents_json` LONGTEXT DEFAULT NULL AFTER `photo_url`;',
  'SELECT "documents_json already exists";'
);

PREPARE stmt FROM @sql_add_doc;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. Ensure assigned_role exists on solar_employees
SET @col_role_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'solar_employees'
    AND COLUMN_NAME = 'assigned_role'
);

SET @sql_add_role = IF(@col_role_exists = 0,
  'ALTER TABLE `solar_employees` ADD COLUMN `assigned_role` VARCHAR(64) DEFAULT NULL AFTER `system_role`;',
  'SELECT "assigned_role already exists";'
);

PREPARE stmt FROM @sql_add_role;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. Ensure updated_at exists on solar_employees
SET @col_upd_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'solar_employees'
    AND COLUMN_NAME = 'updated_at'
);

SET @sql_add_upd = IF(@col_upd_exists = 0,
  'ALTER TABLE `solar_employees` ADD COLUMN `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;',
  'SELECT "updated_at already exists";'
);

PREPARE stmt FROM @sql_add_upd;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 5. Create persistent document audit table: solar_employee_documents
CREATE TABLE IF NOT EXISTS `solar_employee_documents` (
  `id` VARCHAR(64) PRIMARY KEY,
  `employee_id` VARCHAR(64) NOT NULL,
  `category` VARCHAR(64) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `file_path` VARCHAR(500) NOT NULL,
  `file_url` VARCHAR(500) NOT NULL,
  `mime_type` VARCHAR(128) NOT NULL,
  `file_size` BIGINT DEFAULT 0,
  `uploaded_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `uploaded_by` VARCHAR(255) DEFAULT 'HR Administrator',
  `notes` TEXT,
  INDEX `idx_emp_docs_empid` (`employee_id`),
  INDEX `idx_emp_docs_cat` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
