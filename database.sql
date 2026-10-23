-- ==========================================================
-- SolarPulse EPC ERP & CRM - Complete Production MySQL Database Dump
-- Generated for Direct Production Server & phpMyAdmin Deployment
-- Engine: InnoDB | Charset: utf8mb4 | Collation: utf8mb4_unicode_ci
-- ==========================================================

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";

-- --------------------------------------------------------
-- Table structure for table `solar_users`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_users` (
  `id` VARCHAR(64) PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(191) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL DEFAULT '123456',
  `role` VARCHAR(64) NOT NULL DEFAULT 'Super Admin',
  `phone` VARCHAR(32) DEFAULT '',
  `department` VARCHAR(64) DEFAULT 'Operations',
  `designation` VARCHAR(128) DEFAULT '',
  `employee_id` VARCHAR(64) DEFAULT NULL,
  `customer_id` VARCHAR(64) DEFAULT NULL,
  `avatar` TEXT,
  `is_field_worker` TINYINT(1) DEFAULT 0,
  `status` VARCHAR(32) DEFAULT 'ACTIVE',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_users_role` (`role`),
  INDEX `idx_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `solar_customers`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_customers` (
  `id` VARCHAR(64) PRIMARY KEY,
  `customer_code` VARCHAR(32) NOT NULL UNIQUE,
  `name` VARCHAR(255) NOT NULL,
  `company_name` VARCHAR(255) DEFAULT '',
  `customer_type` VARCHAR(32) DEFAULT 'Residential',
  `phone` VARCHAR(32) NOT NULL,
  `email` VARCHAR(191) DEFAULT '',
  `password` VARCHAR(255) NOT NULL DEFAULT '123456',
  `site_address` TEXT NOT NULL,
  `city` VARCHAR(128) NOT NULL,
  `state` VARCHAR(128) DEFAULT 'Gujarat',
  `pincode` VARCHAR(16) DEFAULT '',
  `gst_number` VARCHAR(32) DEFAULT '',
  `electricity_consumer_no` VARCHAR(64) DEFAULT '',
  `sanctioned_load_kw` DECIMAL(10,2) DEFAULT 0.00,
  `status` VARCHAR(32) DEFAULT 'ACTIVE',
  `active_project_id` VARCHAR(64) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_customers_status` (`status`),
  INDEX `idx_customers_phone` (`phone`),
  INDEX `idx_customers_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `solar_leads`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_leads` (
  `id` VARCHAR(64) PRIMARY KEY,
  `customer_name` VARCHAR(255) NOT NULL,
  `company_name` VARCHAR(255) DEFAULT '',
  `phone` VARCHAR(32) NOT NULL,
  `email` VARCHAR(191) DEFAULT '',
  `address` TEXT,
  `city` VARCHAR(128) DEFAULT '',
  `solar_capacity_kw` DECIMAL(10,2) DEFAULT 0.00,
  `estimated_value` DECIMAL(14,2) DEFAULT 0.00,
  `source` VARCHAR(64) DEFAULT 'Website',
  `assigned_salesperson_id` VARCHAR(64) DEFAULT '',
  `assigned_salesperson_name` VARCHAR(255) DEFAULT '',
  `status` VARCHAR(64) DEFAULT 'NEW',
  `notes` TEXT,
  `next_follow_up_date` DATE DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_leads_status` (`status`),
  INDEX `idx_leads_followup` (`next_follow_up_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `solar_projects`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_projects` (
  `id` VARCHAR(64) PRIMARY KEY,
  `project_code` VARCHAR(32) NOT NULL UNIQUE,
  `customer_id` VARCHAR(64) NOT NULL,
  `customer_name` VARCHAR(255) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `capacity_kw` DECIMAL(10,2) NOT NULL,
  `total_value` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `status` VARCHAR(64) DEFAULT 'PLANNING',
  `current_stage_key` VARCHAR(64) DEFAULT 'site_survey',
  `completion_percentage` INT DEFAULT 0,
  `project_manager_id` VARCHAR(64) DEFAULT '',
  `project_manager_name` VARCHAR(255) DEFAULT '',
  `site_address` TEXT NOT NULL,
  `city` VARCHAR(128) NOT NULL,
  `inverter_model` VARCHAR(128) DEFAULT '',
  `panel_model` VARCHAR(128) DEFAULT '',
  `structure_type` VARCHAR(128) DEFAULT 'Elevated GI Structure',
  `start_date` DATE DEFAULT NULL,
  `expected_completion_date` DATE DEFAULT NULL,
  `actual_completion_date` DATE DEFAULT NULL,
  `notes` TEXT,
  `assignments_json` LONGTEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_projects_customer` (`customer_id`),
  INDEX `idx_projects_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `solar_project_stages`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_project_stages` (
  `id` VARCHAR(64) PRIMARY KEY,
  `project_id` VARCHAR(64) NOT NULL,
  `stage_key` VARCHAR(64) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `stage_order` INT NOT NULL DEFAULT 1,
  `department` VARCHAR(64) NOT NULL,
  `assigned_role` VARCHAR(64) NOT NULL,
  `assigned_employee_id` VARCHAR(64) DEFAULT '',
  `assigned_employee_name` VARCHAR(255) DEFAULT '',
  `status` VARCHAR(64) DEFAULT 'NOT STARTED',
  `priority` VARCHAR(32) DEFAULT 'MEDIUM',
  `start_date` DATE DEFAULT NULL,
  `due_date` DATE DEFAULT NULL,
  `completed_date` DATE DEFAULT NULL,
  `checklist_json` LONGTEXT,
  `photos_json` LONGTEXT,
  `documents_json` LONGTEXT,
  `gps_location_json` LONGTEXT,
  `notes` TEXT,
  `approved_by` VARCHAR(255) DEFAULT '',
  `approved_at` DATETIME DEFAULT NULL,
  `rejection_reason` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_stages_project` (`project_id`),
  INDEX `idx_stages_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `solar_site_surveys`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_site_surveys` (
  `id` VARCHAR(64) PRIMARY KEY,
  `project_id` VARCHAR(64) DEFAULT '',
  `customer_id` VARCHAR(64) DEFAULT '',
  `engineer_id` VARCHAR(64) DEFAULT '',
  `engineer_name` VARCHAR(255) NOT NULL,
  `survey_date` DATE NOT NULL,
  `status` VARCHAR(32) DEFAULT 'DRAFT',
  `site_address` TEXT NOT NULL,
  `latitude` DECIMAL(10,7) DEFAULT NULL,
  `longitude` DECIMAL(10,7) DEFAULT NULL,
  `location_name` VARCHAR(255) DEFAULT '',
  `roof_type` VARCHAR(64) DEFAULT 'RCC Flat',
  `roof_area_sqft` DECIMAL(12,2) DEFAULT 0.00,
  `shadow_free_area_sqft` DECIMAL(12,2) DEFAULT 0.00,
  `shadow_obstacles` TEXT,
  `electricity_bill_number` VARCHAR(64) DEFAULT '',
  `monthly_avg_consumption` DECIMAL(10,2) DEFAULT 0.00,
  `sanctioned_load_kw` DECIMAL(10,2) DEFAULT 0.00,
  `tariff_rate` DECIMAL(8,2) DEFAULT 0.00,
  `existing_structure_condition` TEXT,
  `recommended_capacity_kw` DECIMAL(10,2) DEFAULT 0.00,
  `feasibility_score` VARCHAR(32) DEFAULT 'GOOD',
  `photos_json` LONGTEXT,
  `notes` TEXT,
  `reviewed_by` VARCHAR(255) DEFAULT '',
  `reviewed_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_surveys_project` (`project_id`),
  INDEX `idx_surveys_engineer` (`engineer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `solar_quotations`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_quotations` (
  `id` VARCHAR(64) PRIMARY KEY,
  `quotation_number` VARCHAR(64) NOT NULL UNIQUE,
  `customer_id` VARCHAR(64) DEFAULT '',
  `customer_name` VARCHAR(255) NOT NULL,
  `project_id` VARCHAR(64) DEFAULT '',
  `capacity_kw` DECIMAL(10,2) NOT NULL,
  `rate_per_wp` DECIMAL(10,2) DEFAULT 0.00,
  `base_amount` DECIMAL(14,2) DEFAULT 0.00,
  `tax_amount` DECIMAL(14,2) DEFAULT 0.00,
  `panel_brand` VARCHAR(128) DEFAULT '',
  `inverter_brand` VARCHAR(128) DEFAULT '',
  `structure_type` VARCHAR(128) DEFAULT '',
  `items_json` LONGTEXT,
  `subtotal` DECIMAL(14,2) DEFAULT 0.00,
  `discount_amount` DECIMAL(14,2) DEFAULT 0.00,
  `gst_percent` DECIMAL(5,2) DEFAULT 13.80,
  `gst_amount` DECIMAL(14,2) DEFAULT 0.00,
  `total_amount` DECIMAL(14,2) NOT NULL,
  `payment_terms` TEXT,
  `warranty_details` TEXT,
  `terms_and_conditions` TEXT,
  `status` VARCHAR(32) DEFAULT 'DRAFT',
  `valid_until` DATE DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `accepted_at` DATETIME DEFAULT NULL,
  INDEX `idx_quotations_customer` (`customer_id`),
  INDEX `idx_quotations_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `solar_payments`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_payments` (
  `id` VARCHAR(64) PRIMARY KEY,
  `receipt_number` VARCHAR(64) NOT NULL UNIQUE,
  `project_id` VARCHAR(64) NOT NULL,
  `customer_id` VARCHAR(64) NOT NULL,
  `customer_name` VARCHAR(255) NOT NULL,
  `milestone` VARCHAR(128) NOT NULL,
  `amount` DECIMAL(14,2) NOT NULL,
  `status` VARCHAR(32) DEFAULT 'PENDING',
  `due_date` DATE DEFAULT NULL,
  `paid_date` DATE DEFAULT NULL,
  `payment_mode` VARCHAR(64) DEFAULT 'Bank NEFT/RTGS',
  `transaction_reference` VARCHAR(128) DEFAULT '',
  `notes` TEXT,
  `tally_sync_status` VARCHAR(32) DEFAULT 'NOT SYNCED',
  `tally_reference` VARCHAR(128) DEFAULT '',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_payments_project` (`project_id`),
  INDEX `idx_payments_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `solar_expenses`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_expenses` (
  `id` VARCHAR(64) PRIMARY KEY,
  `expense_number` VARCHAR(64) NOT NULL UNIQUE,
  `project_id` VARCHAR(64) DEFAULT '',
  `project_code` VARCHAR(64) DEFAULT '',
  `vendor_name` VARCHAR(255) NOT NULL,
  `category` VARCHAR(128) NOT NULL,
  `amount` DECIMAL(14,2) NOT NULL,
  `expense_date` DATE NOT NULL,
  `payment_mode` VARCHAR(64) DEFAULT 'Bank Payment',
  `reference_no` VARCHAR(128) DEFAULT '',
  `notes` TEXT,
  `receipt_url` TEXT,
  `approved_by` VARCHAR(255) DEFAULT '',
  `tally_sync_status` VARCHAR(32) DEFAULT 'NOT SYNCED',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_expenses_project` (`project_id`),
  INDEX `idx_expenses_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `solar_employees`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_employees` (
  `id` VARCHAR(64) PRIMARY KEY,
  `employee_code` VARCHAR(32) NOT NULL UNIQUE,
  `name` VARCHAR(255) NOT NULL,
  `photo_url` TEXT,
  `department` VARCHAR(64) NOT NULL,
  `designation` VARCHAR(128) NOT NULL,
  `phone` VARCHAR(32) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `joining_date` DATE NOT NULL,
  `salary_monthly` DECIMAL(12,2) DEFAULT 0.00,
  `status` VARCHAR(32) DEFAULT 'ACTIVE',
  `current_site_location` VARCHAR(255) DEFAULT '',
  `login_enabled` TINYINT(1) DEFAULT 1,
  `system_role` VARCHAR(64) DEFAULT 'Super Admin',
  `is_field_worker` TINYINT(1) DEFAULT 0,
  `account_status` VARCHAR(32) DEFAULT 'ACTIVE',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_employees_dept` (`department`),
  INDEX `idx_employees_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `solar_attendance`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_attendance` (
  `id` VARCHAR(64) PRIMARY KEY,
  `employee_id` VARCHAR(64) NOT NULL,
  `employee_name` VARCHAR(255) NOT NULL,
  `attendance_date` DATE NOT NULL,
  `check_in_time` VARCHAR(16) NOT NULL,
  `check_out_time` VARCHAR(16) DEFAULT NULL,
  `check_in_gps_json` LONGTEXT,
  `check_out_gps_json` LONGTEXT,
  `site_project_id` VARCHAR(64) DEFAULT '',
  `site_project_title` VARCHAR(255) DEFAULT '',
  `status` VARCHAR(32) DEFAULT 'PRESENT',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_attendance_emp_date` (`employee_id`, `attendance_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `solar_payslips`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_payslips` (
  `id` VARCHAR(64) PRIMARY KEY,
  `employee_id` VARCHAR(64) NOT NULL,
  `employee_name` VARCHAR(255) NOT NULL,
  `month` VARCHAR(32) NOT NULL,
  `year` INT NOT NULL,
  `basic_salary` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `allowances` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `deductions` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `net_salary` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `payment_status` VARCHAR(32) DEFAULT 'PAID',
  `payment_date` DATE DEFAULT NULL,
  `notes` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_payslips_emp` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `solar_holidays`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_holidays` (
  `id` VARCHAR(64) PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `holiday_date` DATE NOT NULL,
  `type` VARCHAR(64) DEFAULT 'Mandatory',
  `description` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `solar_service_tickets`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_service_tickets` (
  `id` VARCHAR(64) PRIMARY KEY,
  `ticket_id` VARCHAR(64) NOT NULL UNIQUE,
  `customer_id` VARCHAR(64) NOT NULL,
  `customer_name` VARCHAR(255) NOT NULL,
  `project_id` VARCHAR(64) NOT NULL,
  `project_title` VARCHAR(255) DEFAULT '',
  `issue` TEXT NOT NULL,
  `category` VARCHAR(64) DEFAULT 'Inverter Warning',
  `priority` VARCHAR(32) DEFAULT 'MEDIUM',
  `assigned_technician_id` VARCHAR(64) DEFAULT '',
  `assigned_technician_name` VARCHAR(255) DEFAULT '',
  `status` VARCHAR(32) DEFAULT 'OPEN',
  `scheduled_date` DATE DEFAULT NULL,
  `resolved_date` DATE DEFAULT NULL,
  `notes` TEXT,
  `photos_json` LONGTEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_tickets_customer` (`customer_id`),
  INDEX `idx_tickets_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `solar_amc_contracts`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_amc_contracts` (
  `id` VARCHAR(64) PRIMARY KEY,
  `amc_code` VARCHAR(64) NOT NULL UNIQUE,
  `customer_id` VARCHAR(64) NOT NULL,
  `customer_name` VARCHAR(255) NOT NULL,
  `project_id` VARCHAR(64) NOT NULL,
  `project_title` VARCHAR(255) NOT NULL,
  `plan_name` VARCHAR(128) NOT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `renewal_date` DATE DEFAULT NULL,
  `annual_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `visits_completed` INT DEFAULT 0,
  `total_visits` INT DEFAULT 4,
  `status` VARCHAR(32) DEFAULT 'ACTIVE',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_amc_customer` (`customer_id`),
  INDEX `idx_amc_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `solar_notifications`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_notifications` (
  `id` VARCHAR(64) PRIMARY KEY,
  `user_id` VARCHAR(64) DEFAULT '',
  `title` VARCHAR(255) NOT NULL,
  `message` TEXT NOT NULL,
  `type` VARCHAR(32) DEFAULT 'INFO',
  `is_read` TINYINT(1) DEFAULT 0,
  `link_type` VARCHAR(32) DEFAULT NULL,
  `link_id` VARCHAR(64) DEFAULT NULL,
  `customer_id` VARCHAR(64) DEFAULT NULL,
  `project_id` VARCHAR(64) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_notif_read` (`is_read`),
  INDEX `idx_notif_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `solar_products`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_products` (
  `id` VARCHAR(64) PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `sku` VARCHAR(64) NOT NULL UNIQUE,
  `category` VARCHAR(64) NOT NULL,
  `brand` VARCHAR(128) DEFAULT '',
  `model` VARCHAR(128) DEFAULT '',
  `specifications` TEXT,
  `unit` VARCHAR(32) DEFAULT 'Nos',
  `hsn_code` VARCHAR(32) DEFAULT '',
  `gst_rate` DECIMAL(5,2) DEFAULT 18.00,
  `unit_price` DECIMAL(12,2) DEFAULT 0.00,
  `current_stock` DECIMAL(12,2) DEFAULT 0.00,
  `reorder_level` DECIMAL(12,2) DEFAULT 0.00,
  `warehouse_id` VARCHAR(64) DEFAULT '',
  `status` VARCHAR(32) DEFAULT 'ACTIVE',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_products_category` (`category`),
  INDEX `idx_products_sku` (`sku`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `solar_vendors`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_vendors` (
  `id` VARCHAR(64) PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `vendor_code` VARCHAR(32) NOT NULL UNIQUE,
  `contact_person` VARCHAR(128) DEFAULT '',
  `phone` VARCHAR(32) DEFAULT '',
  `email` VARCHAR(191) DEFAULT '',
  `address` TEXT,
  `city` VARCHAR(128) DEFAULT '',
  `state` VARCHAR(128) DEFAULT '',
  `gst_number` VARCHAR(32) DEFAULT '',
  `pan_number` VARCHAR(32) DEFAULT '',
  `payment_terms` VARCHAR(128) DEFAULT '30 Days',
  `rating` DECIMAL(3,1) DEFAULT 4.5,
  `categories_json` LONGTEXT,
  `status` VARCHAR(32) DEFAULT 'ACTIVE',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_vendors_code` (`vendor_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `solar_purchase_orders`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_purchase_orders` (
  `id` VARCHAR(64) PRIMARY KEY,
  `po_number` VARCHAR(64) NOT NULL UNIQUE,
  `vendor_id` VARCHAR(64) NOT NULL,
  `vendor_name` VARCHAR(255) NOT NULL,
  `po_date` DATE NOT NULL,
  `expected_delivery_date` DATE DEFAULT NULL,
  `project_id` VARCHAR(64) DEFAULT '',
  `items_json` LONGTEXT NOT NULL,
  `subtotal` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `gst_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `total_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `status` VARCHAR(32) DEFAULT 'ISSUED',
  `payment_status` VARCHAR(32) DEFAULT 'PENDING',
  `receipts_json` LONGTEXT,
  `notes` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_po_vendor` (`vendor_id`),
  INDEX `idx_po_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `solar_boms`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_boms` (
  `id` VARCHAR(64) PRIMARY KEY,
  `bom_number` VARCHAR(64) NOT NULL UNIQUE,
  `project_id` VARCHAR(64) NOT NULL,
  `project_title` VARCHAR(255) NOT NULL,
  `system_capacity_kw` DECIMAL(10,2) NOT NULL,
  `version` VARCHAR(16) DEFAULT '1.0',
  `status` VARCHAR(32) DEFAULT 'APPROVED',
  `items_json` LONGTEXT NOT NULL,
  `total_estimated_cost` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `created_by` VARCHAR(128) DEFAULT '',
  `approved_by` VARCHAR(128) DEFAULT '',
  `notes` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_boms_project` (`project_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `solar_sales_invoices`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_sales_invoices` (
  `id` VARCHAR(64) PRIMARY KEY,
  `invoice_number` VARCHAR(64) NOT NULL UNIQUE,
  `project_id` VARCHAR(64) DEFAULT '',
  `customer_id` VARCHAR(64) NOT NULL,
  `customer_name` VARCHAR(255) NOT NULL,
  `invoice_date` DATE NOT NULL,
  `due_date` DATE DEFAULT NULL,
  `items_json` LONGTEXT NOT NULL,
  `subtotal` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `gst_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `total_amount` DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  `payment_status` VARCHAR(32) DEFAULT 'UNPAID',
  `paid_amount` DECIMAL(14,2) DEFAULT 0.00,
  `balance_amount` DECIMAL(14,2) DEFAULT 0.00,
  `eway_bill_number` VARCHAR(64) DEFAULT '',
  `eway_bill_details_json` LONGTEXT,
  `warehouse_id` VARCHAR(64) DEFAULT '',
  `notes` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_invoices_customer` (`customer_id`),
  INDEX `idx_invoices_status` (`payment_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `solar_warehouses`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_warehouses` (
  `id` VARCHAR(64) PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `code` VARCHAR(32) NOT NULL UNIQUE,
  `address` TEXT NOT NULL,
  `city` VARCHAR(128) NOT NULL,
  `state` VARCHAR(128) DEFAULT '',
  `pincode` VARCHAR(16) DEFAULT '',
  `manager_name` VARCHAR(128) DEFAULT '',
  `manager_phone` VARCHAR(32) DEFAULT '',
  `gst_number` VARCHAR(32) DEFAULT '',
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `solar_stock_movements`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_stock_movements` (
  `id` VARCHAR(64) PRIMARY KEY,
  `product_id` VARCHAR(64) NOT NULL,
  `product_name` VARCHAR(255) NOT NULL,
  `sku` VARCHAR(64) DEFAULT '',
  `movement_type` VARCHAR(64) NOT NULL,
  `quantity` DECIMAL(12,2) NOT NULL,
  `balance_after` DECIMAL(12,2) NOT NULL,
  `reference_number` VARCHAR(64) DEFAULT '',
  `warehouse_id` VARCHAR(64) DEFAULT '',
  `notes` TEXT,
  `timestamp` DATETIME NOT NULL,
  `performed_by` VARCHAR(128) DEFAULT '',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_sm_product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `solar_stock_audits`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_stock_audits` (
  `id` VARCHAR(64) PRIMARY KEY,
  `audit_number` VARCHAR(64) NOT NULL UNIQUE,
  `warehouse_id` VARCHAR(64) NOT NULL,
  `warehouse_name` VARCHAR(255) NOT NULL,
  `audit_date` DATE NOT NULL,
  `auditor_name` VARCHAR(128) NOT NULL,
  `status` VARCHAR(32) DEFAULT 'COMPLETED',
  `discrepancies_count` INT DEFAULT 0,
  `items_json` LONGTEXT NOT NULL,
  `notes` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `solar_acl_config`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_acl_config` (
  `id` VARCHAR(64) PRIMARY KEY,
  `config_json` LONGTEXT NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `solar_acl_audit_logs`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_acl_audit_logs` (
  `id` VARCHAR(64) PRIMARY KEY,
  `actor_id` VARCHAR(64) NOT NULL,
  `actor_name` VARCHAR(255) NOT NULL,
  `actor_role` VARCHAR(64) NOT NULL,
  `action` VARCHAR(64) NOT NULL,
  `target_role` VARCHAR(64) DEFAULT '',
  `details` TEXT NOT NULL,
  `timestamp` DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `solar_system_settings`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_system_settings` (
  `setting_key` VARCHAR(64) PRIMARY KEY,
  `setting_value` LONGTEXT NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- Table structure for table `solar_workforce_locations`
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `solar_workforce_locations` (
  `user_id` VARCHAR(64) PRIMARY KEY,
  `employee_code` VARCHAR(64) DEFAULT '',
  `name` VARCHAR(255) DEFAULT '',
  `email` VARCHAR(191) DEFAULT '',
  `role` VARCHAR(64) DEFAULT '',
  `latitude` DECIMAL(10,7) DEFAULT NULL,
  `longitude` DECIMAL(10,7) DEFAULT NULL,
  `accuracy` DECIMAL(8,2) DEFAULT NULL,
  `heading` DECIMAL(8,2) DEFAULT NULL,
  `speed` DECIMAL(8,2) DEFAULT NULL,
  `battery_level` INT DEFAULT NULL,
  `activity` VARCHAR(128) DEFAULT '',
  `is_online` TINYINT(1) DEFAULT 0,
  `is_sharing_location` TINYINT(1) DEFAULT 0,
  `status` VARCHAR(32) DEFAULT 'offline',
  `last_seen_at` DATETIME DEFAULT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================
-- SYSTEM CONFIGURATION & AUTHORIZED AUTHENTICATION BASELINE
-- ==========================================================

-- Pushing users data into solar_users
INSERT INTO `solar_users` (`id`, `name`, `email`, `password`, `role`, `phone`, `department`, `designation`, `employee_id`, `is_field_worker`, `status`)
VALUES ('emp-1', 'Vikram Patel', 'admin@rejoysolar.com', '123456', 'Admin', '+91 98250 11223', 'Administration', 'Managing Director & Admin', 'EMP001', 0, 'ACTIVE')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `role` = VALUES(`role`), `password` = VALUES(`password`);
INSERT INTO `solar_users` (`id`, `name`, `email`, `password`, `role`, `phone`, `department`, `designation`, `employee_id`, `is_field_worker`, `status`)
VALUES ('usr-kunal', 'Kunal Das', 'kunaldas2442@gmail.com', '123456', 'Admin', '+91 98250 11223', 'Administration', 'Owner / Admin', 'EMP000', 0, 'ACTIVE')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `role` = VALUES(`role`), `password` = VALUES(`password`);
INSERT INTO `solar_users` (`id`, `name`, `email`, `password`, `role`, `phone`, `department`, `designation`, `employee_id`, `is_field_worker`, `status`)
VALUES ('usr-admin-fallback', 'Admin System Fallback', 'dasest404@gmail.com', '123456', 'Admin', '+91 98250 11223', 'Administration', 'Lead Administrator', 'EMP-ADM-404', 0, 'ACTIVE')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `role` = VALUES(`role`), `password` = VALUES(`password`);

-- Pushing system ACL config
INSERT INTO `solar_acl_config` (`id`, `config_json`)
VALUES ('master_acl_config', '{"Admin":{"crm.leads.view":true,"crm.leads.manage":true,"crm.quotations.create":true,"crm.quotations.approve":true,"projects.view":true,"projects.create":true,"projects.edit_specs":true,"projects.assign_team":true,"projects.stage_checklist":true,"projects.stage_photos":true,"projects.stage_approve":true,"survey.view":true,"survey.submit":true,"survey.approve":true,"inventory.view":true,"inventory.manage":true,"inventory.bom_edit":true,"inventory.purchase_orders":true,"inventory.warehouses_manage":true,"finance.view":true,"finance.invoices":true,"finance.receipts":true,"finance.tally_sync":true,"finance.audit":true,"hrms.view":true,"hrms.attendance_punch":true,"hrms.manage":true,"hrms.payroll":true,"service.tickets_view":true,"service.tickets_create":true,"service.tickets_resolve":true,"service.amc_manage":true,"reports.view":true,"reports.export":true,"settings.view":true,"settings.manage":true,"settings.acl_manage":true},"Project Manager":{"crm.leads.view":true,"crm.leads.manage":false,"crm.quotations.create":true,"crm.quotations.approve":false,"projects.view":true,"projects.create":true,"projects.edit_specs":true,"projects.assign_team":true,"projects.stage_checklist":true,"projects.stage_photos":true,"projects.stage_approve":true,"survey.view":true,"survey.submit":false,"survey.approve":true,"inventory.view":true,"inventory.manage":false,"inventory.bom_edit":true,"inventory.purchase_orders":true,"inventory.warehouses_manage":false,"finance.view":true,"finance.invoices":false,"finance.receipts":false,"finance.tally_sync":false,"finance.audit":false,"hrms.view":true,"hrms.attendance_punch":true,"hrms.manage":false,"hrms.payroll":false,"service.tickets_view":true,"service.tickets_create":true,"service.tickets_resolve":false,"service.amc_manage":false,"reports.view":true,"reports.export":true,"settings.view":true,"settings.manage":false,"settings.acl_manage":false},"Site Survey Engineer":{"crm.leads.view":true,"crm.leads.manage":false,"crm.quotations.create":false,"crm.quotations.approve":false,"projects.view":true,"projects.create":false,"projects.edit_specs":false,"projects.assign_team":false,"projects.stage_checklist":true,"projects.stage_photos":true,"projects.stage_approve":false,"survey.view":true,"survey.submit":true,"survey.approve":false,"inventory.view":false,"inventory.manage":false,"inventory.bom_edit":false,"inventory.purchase_orders":false,"inventory.warehouses_manage":false,"finance.view":false,"finance.invoices":false,"finance.receipts":false,"finance.tally_sync":false,"finance.audit":false,"hrms.view":false,"hrms.attendance_punch":true,"hrms.manage":false,"hrms.payroll":false,"service.tickets_view":false,"service.tickets_create":false,"service.tickets_resolve":false,"service.amc_manage":false,"reports.view":false,"reports.export":false,"settings.view":true,"settings.manage":false,"settings.acl_manage":false},"Site Inspector":{"crm.leads.view":false,"crm.leads.manage":false,"crm.quotations.create":false,"crm.quotations.approve":false,"projects.view":true,"projects.create":false,"projects.edit_specs":false,"projects.assign_team":false,"projects.stage_checklist":true,"projects.stage_photos":true,"projects.stage_approve":false,"survey.view":true,"survey.submit":true,"survey.approve":false,"inventory.view":false,"inventory.manage":false,"inventory.bom_edit":false,"inventory.purchase_orders":false,"inventory.warehouses_manage":false,"finance.view":false,"finance.invoices":false,"finance.receipts":false,"finance.tally_sync":false,"finance.audit":false,"hrms.view":false,"hrms.attendance_punch":true,"hrms.manage":false,"hrms.payroll":false,"service.tickets_view":true,"service.tickets_create":false,"service.tickets_resolve":true,"service.amc_manage":false,"reports.view":false,"reports.export":false,"settings.view":true,"settings.manage":false,"settings.acl_manage":false},"Sales Manager":{"crm.leads.view":true,"crm.leads.manage":true,"crm.quotations.create":true,"crm.quotations.approve":true,"projects.view":true,"projects.create":false,"projects.edit_specs":false,"projects.assign_team":false,"projects.stage_checklist":false,"projects.stage_photos":false,"projects.stage_approve":false,"survey.view":true,"survey.submit":false,"survey.approve":false,"inventory.view":true,"inventory.manage":false,"inventory.bom_edit":false,"inventory.purchase_orders":false,"inventory.warehouses_manage":false,"finance.view":true,"finance.invoices":false,"finance.receipts":false,"finance.tally_sync":false,"finance.audit":false,"hrms.view":true,"hrms.attendance_punch":true,"hrms.manage":false,"hrms.payroll":false,"service.tickets_view":false,"service.tickets_create":false,"service.tickets_resolve":false,"service.amc_manage":false,"reports.view":true,"reports.export":true,"settings.view":true,"settings.manage":false,"settings.acl_manage":false},"Sales Executive":{"crm.leads.view":true,"crm.leads.manage":true,"crm.quotations.create":true,"crm.quotations.approve":false,"projects.view":true,"projects.create":false,"projects.edit_specs":false,"projects.assign_team":false,"projects.stage_checklist":false,"projects.stage_photos":false,"projects.stage_approve":false,"survey.view":true,"survey.submit":false,"survey.approve":false,"inventory.view":true,"inventory.manage":false,"inventory.bom_edit":false,"inventory.purchase_orders":false,"inventory.warehouses_manage":false,"finance.view":false,"finance.invoices":false,"finance.receipts":false,"finance.tally_sync":false,"finance.audit":false,"hrms.view":false,"hrms.attendance_punch":true,"hrms.manage":false,"hrms.payroll":false,"service.tickets_view":false,"service.tickets_create":false,"service.tickets_resolve":false,"service.amc_manage":false,"reports.view":false,"reports.export":false,"settings.view":true,"settings.manage":false,"settings.acl_manage":false},"Civil Team":{"crm.leads.view":false,"crm.leads.manage":false,"crm.quotations.create":false,"crm.quotations.approve":false,"projects.view":true,"projects.create":false,"projects.edit_specs":false,"projects.assign_team":false,"projects.stage_checklist":true,"projects.stage_photos":true,"projects.stage_approve":false,"survey.view":false,"survey.submit":false,"survey.approve":false,"inventory.view":true,"inventory.manage":false,"inventory.bom_edit":false,"inventory.purchase_orders":false,"inventory.warehouses_manage":false,"finance.view":false,"finance.invoices":false,"finance.receipts":false,"finance.tally_sync":false,"finance.audit":false,"hrms.view":false,"hrms.attendance_punch":true,"hrms.manage":false,"hrms.payroll":false,"service.tickets_view":false,"service.tickets_create":false,"service.tickets_resolve":false,"service.amc_manage":false,"reports.view":false,"reports.export":false,"settings.view":true,"settings.manage":false,"settings.acl_manage":false},"Structure Team":{"crm.leads.view":false,"crm.leads.manage":false,"crm.quotations.create":false,"crm.quotations.approve":false,"projects.view":true,"projects.create":false,"projects.edit_specs":false,"projects.assign_team":false,"projects.stage_checklist":true,"projects.stage_photos":true,"projects.stage_approve":false,"survey.view":false,"survey.submit":false,"survey.approve":false,"inventory.view":true,"inventory.manage":false,"inventory.bom_edit":false,"inventory.purchase_orders":false,"inventory.warehouses_manage":false,"finance.view":false,"finance.invoices":false,"finance.receipts":false,"finance.tally_sync":false,"finance.audit":false,"hrms.view":false,"hrms.attendance_punch":true,"hrms.manage":false,"hrms.payroll":false,"service.tickets_view":false,"service.tickets_create":false,"service.tickets_resolve":false,"service.amc_manage":false,"reports.view":false,"reports.export":false,"settings.view":true,"settings.manage":false,"settings.acl_manage":false},"Installation Team":{"crm.leads.view":false,"crm.leads.manage":false,"crm.quotations.create":false,"crm.quotations.approve":false,"projects.view":true,"projects.create":false,"projects.edit_specs":false,"projects.assign_team":false,"projects.stage_checklist":true,"projects.stage_photos":true,"projects.stage_approve":false,"survey.view":false,"survey.submit":false,"survey.approve":false,"inventory.view":true,"inventory.manage":false,"inventory.bom_edit":false,"inventory.purchase_orders":false,"inventory.warehouses_manage":false,"finance.view":false,"finance.invoices":false,"finance.receipts":false,"finance.tally_sync":false,"finance.audit":false,"hrms.view":false,"hrms.attendance_punch":true,"hrms.manage":false,"hrms.payroll":false,"service.tickets_view":false,"service.tickets_create":false,"service.tickets_resolve":false,"service.amc_manage":false,"reports.view":false,"reports.export":false,"settings.view":true,"settings.manage":false,"settings.acl_manage":false},"Electrical Team":{"crm.leads.view":false,"crm.leads.manage":false,"crm.quotations.create":false,"crm.quotations.approve":false,"projects.view":true,"projects.create":false,"projects.edit_specs":false,"projects.assign_team":false,"projects.stage_checklist":true,"projects.stage_photos":true,"projects.stage_approve":false,"survey.view":false,"survey.submit":false,"survey.approve":false,"inventory.view":true,"inventory.manage":false,"inventory.bom_edit":false,"inventory.purchase_orders":false,"inventory.warehouses_manage":false,"finance.view":false,"finance.invoices":false,"finance.receipts":false,"finance.tally_sync":false,"finance.audit":false,"hrms.view":false,"hrms.attendance_punch":true,"hrms.manage":false,"hrms.payroll":false,"service.tickets_view":false,"service.tickets_create":false,"service.tickets_resolve":false,"service.amc_manage":false,"reports.view":false,"reports.export":false,"settings.view":true,"settings.manage":false,"settings.acl_manage":false},"Technician":{"crm.leads.view":false,"crm.leads.manage":false,"crm.quotations.create":false,"crm.quotations.approve":false,"projects.view":true,"projects.create":false,"projects.edit_specs":false,"projects.assign_team":false,"projects.stage_checklist":true,"projects.stage_photos":true,"projects.stage_approve":false,"survey.view":false,"survey.submit":false,"survey.approve":false,"inventory.view":true,"inventory.manage":false,"inventory.bom_edit":false,"inventory.purchase_orders":false,"inventory.warehouses_manage":false,"finance.view":false,"finance.invoices":false,"finance.receipts":false,"finance.tally_sync":false,"finance.audit":false,"hrms.view":false,"hrms.attendance_punch":true,"hrms.manage":false,"hrms.payroll":false,"service.tickets_view":true,"service.tickets_create":false,"service.tickets_resolve":true,"service.amc_manage":false,"reports.view":false,"reports.export":false,"settings.view":true,"settings.manage":false,"settings.acl_manage":false},"Service Manager":{"crm.leads.view":false,"crm.leads.manage":false,"crm.quotations.create":false,"crm.quotations.approve":false,"projects.view":true,"projects.create":false,"projects.edit_specs":false,"projects.assign_team":false,"projects.stage_checklist":false,"projects.stage_photos":false,"projects.stage_approve":false,"survey.view":false,"survey.submit":false,"survey.approve":false,"inventory.view":true,"inventory.manage":false,"inventory.bom_edit":false,"inventory.purchase_orders":false,"inventory.warehouses_manage":false,"finance.view":false,"finance.invoices":false,"finance.receipts":false,"finance.tally_sync":false,"finance.audit":false,"hrms.view":true,"hrms.attendance_punch":true,"hrms.manage":false,"hrms.payroll":false,"service.tickets_view":true,"service.tickets_create":true,"service.tickets_resolve":true,"service.amc_manage":true,"reports.view":true,"reports.export":true,"settings.view":true,"settings.manage":false,"settings.acl_manage":false},"Accountant":{"crm.leads.view":true,"crm.leads.manage":false,"crm.quotations.create":false,"crm.quotations.approve":false,"projects.view":true,"projects.create":false,"projects.edit_specs":false,"projects.assign_team":false,"projects.stage_checklist":false,"projects.stage_photos":false,"projects.stage_approve":false,"survey.view":false,"survey.submit":false,"survey.approve":false,"inventory.view":true,"inventory.manage":false,"inventory.bom_edit":false,"inventory.purchase_orders":true,"inventory.warehouses_manage":false,"finance.view":true,"finance.invoices":true,"finance.receipts":true,"finance.tally_sync":true,"finance.audit":true,"hrms.view":true,"hrms.attendance_punch":true,"hrms.manage":false,"hrms.payroll":true,"service.tickets_view":false,"service.tickets_create":false,"service.tickets_resolve":false,"service.amc_manage":false,"reports.view":true,"reports.export":true,"settings.view":true,"settings.manage":false,"settings.acl_manage":false},"HR Manager":{"crm.leads.view":false,"crm.leads.manage":false,"crm.quotations.create":false,"crm.quotations.approve":false,"projects.view":true,"projects.create":false,"projects.edit_specs":false,"projects.assign_team":false,"projects.stage_checklist":false,"projects.stage_photos":false,"projects.stage_approve":false,"survey.view":false,"survey.submit":false,"survey.approve":false,"inventory.view":false,"inventory.manage":false,"inventory.bom_edit":false,"inventory.purchase_orders":false,"inventory.warehouses_manage":false,"finance.view":false,"finance.invoices":false,"finance.receipts":false,"finance.tally_sync":false,"finance.audit":false,"hrms.view":true,"hrms.attendance_punch":true,"hrms.manage":true,"hrms.payroll":true,"service.tickets_view":false,"service.tickets_create":false,"service.tickets_resolve":false,"service.amc_manage":false,"reports.view":true,"reports.export":true,"settings.view":true,"settings.manage":false,"settings.acl_manage":false},"Customer":{"crm.leads.view":false,"crm.leads.manage":false,"crm.quotations.create":false,"crm.quotations.approve":false,"projects.view":true,"projects.create":false,"projects.edit_specs":false,"projects.assign_team":false,"projects.stage_checklist":false,"projects.stage_photos":false,"projects.stage_approve":false,"survey.view":false,"survey.submit":false,"survey.approve":false,"inventory.view":false,"inventory.manage":false,"inventory.bom_edit":false,"inventory.purchase_orders":false,"inventory.warehouses_manage":false,"finance.view":true,"finance.invoices":false,"finance.receipts":false,"finance.tally_sync":false,"finance.audit":false,"hrms.view":false,"hrms.attendance_punch":false,"hrms.manage":false,"hrms.payroll":false,"service.tickets_view":true,"service.tickets_create":true,"service.tickets_resolve":false,"service.amc_manage":false,"reports.view":false,"reports.export":false,"settings.view":false,"settings.manage":false,"settings.acl_manage":false}}')
ON DUPLICATE KEY UPDATE `config_json` = VALUES(`config_json`);

-- Pushing system settings
INSERT INTO `solar_system_settings` (`setting_key`, `setting_value`)
VALUES ('global_settings', '{"companyName":"REJOY SOLAR POWER PVT. LTD","companyAddress":"PLOT NO- 14, STREET NO- 14B, PRAGATI NAGAR, RISALI BHILAI, Chhattisgarh 490006","companyPhone":"+91 98250 12345","companyEmail":"rejoysolarpower@gmail.com","companyGst":"22AAOCR0748K1Z5","logoUrl":"/logo-dark.png","currencySymbol":"₹","taxRatePercent":18,"tallyServerUrl":"","tallyCompany":"Rejoy Solar 2026-27","tallyStatus":"NOT CONFIGURED","whatsAppStatus":"SANDBOX_READY"}')
ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`);

SET FOREIGN_KEY_CHECKS = 1;

-- ==========================================================
-- End of SolarPulse Production MySQL Dump
-- ==========================================================