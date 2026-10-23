import fs from 'fs';
import path from 'path';

console.log('--- Starting Rejoy Solar ERP Dummy Data Cleanup ---');

// 1. Clean .workforce_cache.json
const workforceCachePath = path.join(process.cwd(), '.workforce_cache.json');
fs.writeFileSync(workforceCachePath, '[]\n', 'utf-8');
console.log('✓ Cleared .workforce_cache.json');

// 2. Clean .erp_database_cache.json if exists
const erpCachePath = path.join(process.cwd(), '.erp_database_cache.json');
if (fs.existsSync(erpCachePath)) {
  fs.unlinkSync(erpCachePath);
  console.log('✓ Removed .erp_database_cache.json');
}

// 3. Clean src/services/storage.ts
const storageTsPath = path.join(process.cwd(), 'src/services/storage.ts');
let storageContent = fs.readFileSync(storageTsPath, 'utf-8');

// Find from STORAGE_KEYS to KEY_TO_COLLECTION
const storageKeysEndIdx = storageContent.indexOf('const STORAGE_KEYS = {');
if (storageKeysEndIdx !== -1) {
  const closingBraceIdx = storageContent.indexOf('};', storageKeysEndIdx);
  const keyToCollectionIdx = storageContent.indexOf('const KEY_TO_COLLECTION: Record<string, string> = {');

  if (closingBraceIdx !== -1 && keyToCollectionIdx !== -1) {
    const cleanDefinitions = `
const initialWarehouses: Warehouse[] = [];
const initialStockAudits: StockAuditRecord[] = [];
const initialAclAuditLogs: AclAuditLogEntry[] = [];
const initialEmployees: Employee[] = [];
const initialCustomers: Customer[] = [];
const initialLeads: Lead[] = [];
const initialProjects: SolarProject[] = [];
const initialPayments: PaymentRecord[] = [];
const initialExpenses: ExpenseRecord[] = [];
const initialAttendance: AttendanceRecord[] = [];
const initialPayslips: Payslip[] = [];
const initialHolidays: HolidayRecord[] = [];
const initialServiceTickets: ServiceTicket[] = [];
const initialAMCContracts: AMCContract[] = [];
const initialNotifications: AppNotification[] = [];
const initialSurveys: SiteSurveyData[] = [];
const initialQuotations: Quotation[] = [];
const initialProducts: ProductItem[] = [];
const initialVendors: Vendor[] = [];
const initialPurchaseOrders: PurchaseOrder[] = [];
const initialBOMs: BillOfMaterials[] = [];
const initialSalesInvoices: SalesInvoice[] = [];
const initialStockMovements: StockMovement[] = [];

const initialSettings: SystemSettings = {
  companyName: 'REJOY SOLAR POWER PVT. LTD',
  companyAddress: 'PLOT NO- 14, STREET NO- 14B, PRAGATI NAGAR, RISALI BHILAI, Chhattisgarh 490006',
  companyPhone: '+91 98250 12345',
  companyEmail: 'rejoysolarpower@gmail.com',
  companyGst: '22AAOCR0748K1Z5',
  logoUrl: '/logo-dark.png',
  currencySymbol: '₹',
  taxRatePercent: 18,
  tallyServerUrl: (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_TALLY_SERVER_URL) ? import.meta.env.VITE_TALLY_SERVER_URL : '',
  tallyCompany: 'Rejoy Solar 2026-27',
  tallyStatus: 'NOT CONFIGURED',
  whatsAppStatus: 'SANDBOX_READY'
};

`;
    storageContent = storageContent.slice(0, closingBraceIdx + 2) + '\n' + cleanDefinitions + '\n' + storageContent.slice(keyToCollectionIdx);
    console.log('✓ Cleaned mock definitions in storage.ts');
  }
}

// Remove fake activities fallback in getRecentActivities()
const fakeActivitiesStart = storageContent.indexOf('if (activities.length === 0) {');
if (fakeActivitiesStart !== -1) {
  const fakeActivitiesEnd = storageContent.indexOf('return activities.sort(', fakeActivitiesStart);
  if (fakeActivitiesEnd !== -1) {
    storageContent = storageContent.slice(0, fakeActivitiesStart) + storageContent.slice(fakeActivitiesEnd);
    console.log('✓ Removed mock activity fallback in storage.ts');
  }
}

// Fix initialProjects reference in getProjects self-healing
storageContent = storageContent.replace(
  'const defaultMatch = initialProjects.find(ip => ip.id === project.id);',
  'const defaultMatch = undefined;'
);

// Fix initialWarehouses[0] fallback in getDefaultWarehouse
storageContent = storageContent.replace(
  '|| list[0] || initialWarehouses[0];',
  '|| list[0] || ({} as any);'
);

fs.writeFileSync(storageTsPath, storageContent, 'utf-8');
console.log('✓ Saved updated src/services/storage.ts');

// 4. Clean server/mysqlDatabase.ts
const mysqlDbPath = path.join(process.cwd(), 'server/mysqlDatabase.ts');
let mysqlDbContent = fs.readFileSync(mysqlDbPath, 'utf-8');

// Replace initDefaultCollections() implementation
const initDefStart = mysqlDbContent.indexOf('private initDefaultCollections() {');
if (initDefStart !== -1) {
  const initDefEnd = mysqlDbContent.indexOf('public async init()', initDefStart);
  if (initDefEnd !== -1) {
    const cleanInitDef = `private initDefaultCollections() {
    try {
      this.collections.set('customers', []);
      this.collections.set('leads', []);
      this.collections.set('projects', []);
      this.collections.set('employees', []);
      this.collections.set('payments', []);
      this.collections.set('expenses', []);
      this.collections.set('products', []);
      this.collections.set('vendors', []);
      this.collections.set('purchase_orders', []);
      this.collections.set('sales_invoices', []);
      this.collections.set('attendance', []);
      this.collections.set('payslips', []);
      this.collections.set('holidays', []);
      this.collections.set('quotations', []);
      this.collections.set('surveys', []);
      this.collections.set('boms', []);
      this.collections.set('warehouses', []);
      this.collections.set('stock_movements', []);
      this.collections.set('stock_audits', []);
      this.collections.set('service_tickets', []);
      this.collections.set('amc_contracts', []);
      this.collections.set('notifications', []);
      this.collections.set('acl_audit_logs', []);
      this.collections.set('acl_config', [DEFAULT_SYSTEM_ACL_CONFIG]);
      this.settingsStore = storageService.getSettings();

      const defaultUsers: any[] = [
        {
          id: 'emp-1',
          name: 'Vikram Patel',
          email: 'admin@rejoysolar.com',
          password: '123456',
          role: 'Admin',
          phone: '+91 98250 11223',
          department: 'Administration',
          designation: 'Managing Director & Admin',
          employeeId: 'EMP001',
          isFieldWorker: false,
          status: 'ACTIVE'
        },
        {
          id: 'usr-kunal',
          name: 'Kunal Das',
          email: 'kunaldas2442@gmail.com',
          password: '123456',
          role: 'Admin',
          phone: '+91 98250 11223',
          department: 'Administration',
          designation: 'Owner / Admin',
          employeeId: 'EMP000',
          isFieldWorker: false,
          status: 'ACTIVE'
        },
        {
          id: 'usr-admin-fallback',
          name: 'Admin System Fallback',
          email: 'dasest404@gmail.com',
          password: '123456',
          role: 'Admin',
          phone: '+91 98250 11223',
          department: 'Administration',
          designation: 'Lead Administrator',
          employeeId: 'EMP-ADM-404',
          isFieldWorker: false,
          status: 'ACTIVE'
        }
      ];

      this.collections.set('users', defaultUsers);
    } catch (e) {
      console.warn('[DB Manager] Notice loading initial collections:', e);
    }
  }

  `;
    mysqlDbContent = mysqlDbContent.slice(0, initDefStart) + cleanInitDef + mysqlDbContent.slice(initDefEnd);
    console.log('✓ Cleaned initDefaultCollections in server/mysqlDatabase.ts');
  }
}

// In ensureSchema(): Add cleanup query so if MySQL is connected, all dummy records are removed
const ensureSchemaQueryHook = 'console.log(\'[MySQL] Schema and production baseline verified in MySQL database.\');';
if (mysqlDbContent.includes(ensureSchemaQueryHook)) {
  const cleanupSql = `
        // Purge dummy demo records from MySQL business tables
        try {
          await this.pool.query(\`
            DELETE FROM \\\`solar_customers\\\` WHERE \\\`id\\\` IN ('cust-manohar', 'cust-1', 'cust-2', 'cust-3', 'cust-4', 'cust-5');
            DELETE FROM \\\`solar_leads\\\` WHERE \\\`id\\\` LIKE 'lead-%' AND \\\`customer_name\\\` IN ('Shree Ram Plastics', 'Kalyan Packaging Solutions', 'Silver Oak Elite Villas Society', 'Navkar Diamond Tools', 'Balaji Cold Chain Logistics');
            DELETE FROM \\\`solar_projects\\\` WHERE \\\`id\\\` IN ('proj-manohar', 'proj-1', 'proj-2', 'proj-3', 'proj-4', 'proj-5');
            DELETE FROM \\\`solar_project_stages\\\` WHERE \\\`project_id\\\` IN ('proj-manohar', 'proj-1', 'proj-2', 'proj-3', 'proj-4', 'proj-5');
            DELETE FROM \\\`solar_payments\\\` WHERE \\\`id\\\` IN ('pay-1', 'pay-2', 'pay-3', 'pay-4', 'pay-5', 'pay-6');
            DELETE FROM \\\`solar_expenses\\\` WHERE \\\`id\\\` IN ('exp-1', 'exp-2', 'exp-3', 'exp-4', 'exp-5', 'exp-6');
            DELETE FROM \\\`solar_employees\\\` WHERE \\\`id\\\` LIKE 'emp-%' AND \\\`email\\\` LIKE '%@rejoysolar.com' AND \\\`email\\\` != 'admin@rejoysolar.com';
            DELETE FROM \\\`solar_attendance\\\` WHERE \\\`id\\\` LIKE 'att-%';
            DELETE FROM \\\`solar_payslips\\\` WHERE \\\`id\\\` LIKE 'ps-%';
            DELETE FROM \\\`solar_holidays\\\` WHERE \\\`id\\\` LIKE 'hol-%';
            DELETE FROM \\\`solar_products\\\` WHERE \\\`id\\\` LIKE 'prod-%';
            DELETE FROM \\\`solar_vendors\\\` WHERE \\\`id\\\` LIKE 'vnd-%';
            DELETE FROM \\\`solar_purchase_orders\\\` WHERE \\\`id\\\` LIKE 'po-%';
            DELETE FROM \\\`solar_boms\\\` WHERE \\\`id\\\` LIKE 'bom-%';
            DELETE FROM \\\`solar_sales_invoices\\\` WHERE \\\`id\\\` LIKE 'inv-%';
            DELETE FROM \\\`solar_warehouses\\\` WHERE \\\`id\\\` IN ('wh-bhl-01', 'wh-1', 'wh-2', 'wh-3');
            DELETE FROM \\\`solar_stock_movements\\\` WHERE \\\`id\\\` LIKE 'sm-%';
            DELETE FROM \\\`solar_stock_audits\\\` WHERE \\\`id\\\` LIKE 'audit-%';
            DELETE FROM \\\`solar_service_tickets\\\` WHERE \\\`id\\\` LIKE 'srv-%';
            DELETE FROM \\\`solar_amc_contracts\\\` WHERE \\\`id\\\` LIKE 'amc-%';
            DELETE FROM \\\`solar_notifications\\\` WHERE \\\`id\\\` LIKE 'notif-%';
            DELETE FROM \\\`solar_quotations\\\` WHERE \\\`id\\\` IN ('quote-waaree-5kw-ref', 'quote-1');
            DELETE FROM \\\`solar_site_surveys\\\` WHERE \\\`id\\\` IN ('surv-1');
            DELETE FROM \\\`solar_users\\\` WHERE \\\`id\\\` LIKE 'demo-usr-%';
          \`);
        } catch {}
  `;
  mysqlDbContent = mysqlDbContent.replace(ensureSchemaQueryHook, ensureSchemaQueryHook + cleanupSql);
  console.log('✓ Added auto-purge logic to ensureSchema in server/mysqlDatabase.ts');
}

fs.writeFileSync(mysqlDbPath, mysqlDbContent, 'utf-8');
console.log('✓ Saved updated server/mysqlDatabase.ts');

// 5. Clean database.sql, public/api/schema.sql, public/api/solar_mysql_dump.sql
const databaseSqlPath = path.join(process.cwd(), 'database.sql');
let databaseSql = fs.readFileSync(databaseSqlPath, 'utf-8');

// Find end of table creations (before DATA MIGRATION)
const dataMigMarker = '-- ==========================================================';
const dataMigIdx = databaseSql.indexOf('-- DATA MIGRATION: POPULATING ALL EXISTING PRODUCTION DATA');
if (dataMigIdx !== -1) {
  // Find where table schemas end
  const precedingSep = databaseSql.lastIndexOf(dataMigMarker, dataMigIdx);
  const schemaPart = databaseSql.slice(0, precedingSep > 0 ? precedingSep : dataMigIdx);

  // Clean data section: ONLY administrative accounts, ACL config, and system settings
  const cleanDataSection = `-- ==========================================================
-- SYSTEM CONFIGURATION & AUTHORIZED AUTHENTICATION BASELINE
-- ==========================================================

-- Authorized Administrator Accounts
INSERT INTO \`solar_users\` (\`id\`, \`name\`, \`email\`, \`password\`, \`role\`, \`phone\`, \`department\`, \`designation\`, \`employee_id\`, \`is_field_worker\`, \`status\`)
VALUES
  ('emp-1', 'Vikram Patel', 'admin@rejoysolar.com', '$2a$10$wT8y8w39Q3.3GZt8h9n7.eB9bC24kQ.VpZ8aVbL5h4D1f6H7i9k2', 'Admin', '+91 98250 11223', 'Administration', 'Managing Director & Admin', 'EMP001', 0, 'ACTIVE'),
  ('usr-kunal', 'Kunal Das', 'kunaldas2442@gmail.com', '$2a$10$wT8y8w39Q3.3GZt8h9n7.eB9bC24kQ.VpZ8aVbL5h4D1f6H7i9k2', 'Admin', '+91 98250 11223', 'Administration', 'Owner / Admin', 'EMP000', 0, 'ACTIVE'),
  ('usr-admin-fallback', 'Admin System Fallback', 'dasest404@gmail.com', '$2a$10$wT8y8w39Q3.3GZt8h9n7.eB9bC24kQ.VpZ8aVbL5h4D1f6H7i9k2', 'Admin', '+91 98250 11223', 'Administration', 'Lead Administrator', 'EMP-ADM-404', 0, 'ACTIVE')
ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`), \`role\` = VALUES(\`role\`), \`password\` = VALUES(\`password\`);

-- System ACL Config
INSERT INTO \`solar_acl_config\` (\`id\`, \`config_json\`)
VALUES ('master_acl_config', '{"Admin":{"crm.leads.view":true,"crm.leads.manage":true,"crm.quotations.create":true,"crm.quotations.approve":true,"projects.view":true,"projects.create":true,"projects.edit_specs":true,"projects.assign_team":true,"projects.stage_checklist":true,"projects.stage_photos":true,"projects.stage_approve":true,"survey.view":true,"survey.submit":true,"survey.approve":true,"inventory.view":true,"inventory.manage":true,"inventory.bom_edit":true,"inventory.purchase_orders":true,"inventory.warehouses_manage":true,"finance.view":true,"finance.invoices":true,"finance.receipts":true,"finance.tally_sync":true,"finance.audit":true,"hrms.view":true,"hrms.attendance_punch":true,"hrms.manage":true,"hrms.payroll":true,"service.tickets_view":true,"service.tickets_create":true,"service.tickets_resolve":true,"service.amc_manage":true,"reports.view":true,"reports.export":true,"settings.view":true,"settings.manage":true,"settings.acl_manage":true},"Project Manager":{"crm.leads.view":true,"crm.leads.manage":false,"crm.quotations.create":true,"crm.quotations.approve":false,"projects.view":true,"projects.create":true,"projects.edit_specs":true,"projects.assign_team":true,"projects.stage_checklist":true,"projects.stage_photos":true,"projects.stage_approve":true,"survey.view":true,"survey.submit":false,"survey.approve":true,"inventory.view":true,"inventory.manage":false,"inventory.bom_edit":true,"inventory.purchase_orders":true,"inventory.warehouses_manage":false,"finance.view":true,"finance.invoices":false,"finance.receipts":false,"finance.tally_sync":false,"finance.audit":false,"hrms.view":true,"hrms.attendance_punch":true,"hrms.manage":false,"hrms.payroll":false,"service.tickets_view":true,"service.tickets_create":true,"service.tickets_resolve":false,"service.amc_manage":false,"reports.view":true,"reports.export":true,"settings.view":true,"settings.manage":false,"settings.acl_manage":false}}')
ON DUPLICATE KEY UPDATE \`config_json\` = VALUES(\`config_json\`);

-- System Settings
INSERT INTO \`solar_system_settings\` (\`setting_key\`, \`setting_value\`)
VALUES ('global_settings', '{"companyName":"REJOY SOLAR POWER PVT. LTD","companyAddress":"PLOT NO- 14, STREET NO- 14B, PRAGATI NAGAR, RISALI BHILAI, Chhattisgarh 490006","companyPhone":"+91 98250 12345","companyEmail":"rejoysolarpower@gmail.com","companyGst":"22AAOCR0748K1Z5","logoUrl":"/logo-dark.png","currencySymbol":"₹","taxRatePercent":18,"tallyServerUrl":"","tallyCompany":"Rejoy Solar 2026-27","tallyStatus":"NOT CONFIGURED","whatsAppStatus":"SANDBOX_READY"}')
ON DUPLICATE KEY UPDATE \`setting_value\` = VALUES(\`setting_value\`);

SET FOREIGN_KEY_CHECKS = 1;

-- ==========================================================
-- End of Clean SolarPulse Production MySQL Dump
-- ==========================================================
`;
  const cleanSql = schemaPart.trim() + '\n\n' + cleanDataSection;
  fs.writeFileSync(databaseSqlPath, cleanSql, 'utf-8');
  fs.writeFileSync(path.join(process.cwd(), 'public/api/schema.sql'), cleanSql, 'utf-8');
  fs.writeFileSync(path.join(process.cwd(), 'public/api/solar_mysql_dump.sql'), cleanSql, 'utf-8');
  console.log('✓ Cleaned database.sql, public/api/schema.sql, and public/api/solar_mysql_dump.sql');
}

// 6. Clean src/context/AppContext.tsx
const appContextPath = path.join(process.cwd(), 'src/context/AppContext.tsx');
let appContext = fs.readFileSync(appContextPath, 'utf-8');
appContext = appContext.replace(
  "const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>('cust-1');",
  "const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);"
);
appContext = appContext.replace(
  "const [selectedProjectId, setSelectedProjectId] = useState<string | null>('proj-1');",
  "const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);"
);
fs.writeFileSync(appContextPath, appContext, 'utf-8');
console.log('✓ Reset selected customer/project defaults in src/context/AppContext.tsx');

console.log('--- Cleanup Finished Successfully ---');
