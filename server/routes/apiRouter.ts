import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { dbManager } from '../mysqlDatabase';
import { storageService } from '../../src/services/storage';
import { DEMO_ACCOUNTS } from '../../src/context/AuthContext';

export const apiRouter = Router();

// Initialize DB Manager
dbManager.init().catch(err => {
  console.warn('[DB Manager] Startup notice:', err);
});

// Seed in-memory backend database from initial baseline if empty
try {
  const currentUsers = dbManager.getFallbackItems('users');
  if (currentUsers.length === 0) {
    const demoUsers: any[] = DEMO_ACCOUNTS.map(a => ({
      id: a.profile.id,
      name: a.name,
      email: a.email,
      password: a.password || '123456',
      role: a.role,
      phone: a.profile.phone || '+91 98000 00000',
      department: a.department,
      designation: a.profile.designation,
      employeeId: a.profile.employeeId,
      isFieldWorker: Boolean(a.isFieldWorker)
    }));
    demoUsers.push({
      id: 'usr-admin-master',
      name: 'Vikram Patel',
      email: 'admin@rejoysolar.com',
      password: '123456',
      role: 'Admin',
      phone: '+91 98250 11223',
      department: 'Administration',
      designation: 'Managing Director',
      employeeId: 'EMP001',
      isFieldWorker: false
    });
    dbManager.setFallbackItems('users', demoUsers);
  }

  const collectionsToInit = [
    { key: 'customers', fn: () => storageService.getCustomers() },
    { key: 'leads', fn: () => storageService.getLeads() },
    { key: 'projects', fn: () => storageService.getProjects() },
    { key: 'employees', fn: () => storageService.getEmployees() },
    { key: 'payments', fn: () => storageService.getPayments() },
    { key: 'expenses', fn: () => storageService.getExpenses() },
    { key: 'attendance', fn: () => storageService.getAttendance() },
    { key: 'payslips', fn: () => storageService.getPayslips() },
    { key: 'holidays', fn: () => storageService.getHolidays() },
    { key: 'service_tickets', fn: () => storageService.getServiceTickets() },
    { key: 'amc_contracts', fn: () => storageService.getAMCContracts() },
    { key: 'products', fn: () => storageService.getProducts() },
    { key: 'vendors', fn: () => storageService.getVendors() },
    { key: 'purchase_orders', fn: () => storageService.getPurchaseOrders() },
    { key: 'boms', fn: () => storageService.getBOMs() },
    { key: 'sales_invoices', fn: () => storageService.getSalesInvoices() },
    { key: 'warehouses', fn: () => storageService.getWarehouses() },
    { key: 'stock_movements', fn: () => storageService.getStockMovements() },
    { key: 'stock_audits', fn: () => storageService.getStockAudits() },
    { key: 'quotations', fn: () => storageService.getQuotations() },
    { key: 'surveys', fn: () => storageService.getSurveys() },
    { key: 'notifications', fn: () => storageService.getNotifications() }
  ];

  collectionsToInit.forEach(({ key, fn }) => {
    if (dbManager.getFallbackItems(key).length === 0) {
      try {
        const items = fn();
        if (Array.isArray(items) && items.length > 0) {
          dbManager.setFallbackItems(key, items);
        }
      } catch {}
    }
  });
} catch (e) {
  console.warn('Initial storage seed notice:', e);
}

// ==========================================================
// 1. DATABASE & PRODUCTION MIGRATION APIS
// ==========================================================

// DB Status & Diagnostics
apiRouter.get('/db/status', (_req: Request, res: Response) => {
  const status = dbManager.getStatus();
  res.json({
    success: true,
    ...status,
    message: status.connected
      ? `Connected to MySQL database "${status.database}" on ${status.host}:${status.port}`
      : `Operating with server-side persistent database cache. Connect MySQL via .env or Database Settings.`,
    tables: [
      'solar_users', 'solar_customers', 'solar_leads', 'solar_projects',
      'solar_project_stages', 'solar_site_surveys', 'solar_quotations',
      'solar_payments', 'solar_expenses', 'solar_employees', 'solar_attendance',
      'solar_payslips', 'solar_holidays', 'solar_service_tickets', 'solar_amc_contracts',
      'solar_notifications', 'solar_products', 'solar_vendors', 'solar_purchase_orders',
      'solar_boms', 'solar_sales_invoices', 'solar_warehouses', 'solar_stock_movements',
      'solar_stock_audits', 'solar_acl_config', 'solar_acl_audit_logs',
      'solar_system_settings', 'solar_workforce_locations'
    ]
  });
});

// Test custom MySQL connection
apiRouter.post('/db/test-connection', async (req: Request, res: Response) => {
  const { host, port, user, password, database } = req.body || {};
  const result = await dbManager.testConnection({
    host: host || 'localhost',
    port: Number(port) || 3306,
    user: user || 'root',
    password: password || '',
    database: database || 'solarpulse_erp'
  });
  res.json(result);
});

// Push schema and migrate all existing data
apiRouter.post('/db/migrate', async (req: Request, res: Response) => {
  const customConfig = req.body || {};
  const result = await dbManager.runFullMigration(customConfig);
  res.json(result);
});

// Download standalone SQL database dump
apiRouter.get(['/db/dump.sql', '/db/export-sql'], (_req: Request, res: Response) => {
  const dumpPath = path.join(process.cwd(), 'database.sql');
  if (fs.existsSync(dumpPath)) {
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', 'attachment; filename="solarpulse_production_mysql.sql"');
    fs.createReadStream(dumpPath).pipe(res);
  } else {
    res.status(404).json({ success: false, error: 'Database dump file not found.' });
  }
});

// ==========================================================
// 2. MASTER BOOTSTRAP API (ONE ROUND-TRIP HYDRATION)
// ==========================================================

apiRouter.get('/bootstrap', async (_req: Request, res: Response) => {
  try {
    const data = await dbManager.getAllData();
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      data
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Bootstrap load error' });
  }
});

// Bulk & Entity sync endpoint for data updates
apiRouter.post('/sync/push', async (req: Request, res: Response) => {
  try {
    const { collection, item, items, action } = req.body || {};
    if (!collection) {
      res.status(400).json({ success: false, message: 'Collection name is required.' });
      return;
    }

    if (item && action === 'delete') {
      await dbManager.deleteItem(collection, item.id);
      if (items && Array.isArray(items)) {
        dbManager.setFallbackItems(collection, items);
      }
      res.json({ success: true, message: `Deleted from ${collection}` });
      return;
    }

    if (item) {
      const saved = await dbManager.saveItem(collection, item);
      if (items && Array.isArray(items)) {
        dbManager.setFallbackItems(collection, items);
      }
      res.json({ success: true, data: saved, message: `Saved to ${collection}` });
      return;
    }

    if (items && Array.isArray(items)) {
      const existing = dbManager.getFallbackItems(collection);
      const incomingIds = new Set(items.map((i: any) => i.id));
      for (const ex of existing) {
        if (ex && ex.id && !incomingIds.has(ex.id)) {
          await dbManager.deleteItem(collection, ex.id);
        }
      }
      for (const it of items) {
        await dbManager.saveItem(collection, it);
      }
      res.json({ success: true, count: items.length, message: `Synced ${collection}` });
      return;
    }

    res.status(400).json({ success: false, message: 'Invalid sync payload.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Sync error' });
  }
});

// ==========================================================
// 3. AUTHENTICATION APIS (MYSQL BACKED)
// ==========================================================

apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ success: false, message: 'Email and password are required.' });
    return;
  }

  const user = await dbManager.authenticateUser(email, password);
  if (user) {
    res.json({
      success: true,
      user,
      token: `token_${user.id}_${Date.now()}`,
      message: 'Authentication successful.'
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Invalid email or password. Please verify credentials.'
    });
  }
});

apiRouter.post('/auth/customer-login', async (req: Request, res: Response) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ success: false, message: 'Customer email and password required.' });
    return;
  }
  const user = await dbManager.authenticateUser(email, password);
  if (user && user.role === 'Customer') {
    res.json({
      success: true,
      user,
      token: `cust_token_${user.id}_${Date.now()}`
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Invalid customer portal credentials.'
    });
  }
});

apiRouter.put('/customers/:id/password', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { password } = req.body || {};
  if (!password || String(password).trim().length < 6) {
    res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    return;
  }

  const success = await dbManager.updateCustomerPassword(id, String(password).trim());
  res.json({ success, message: 'Customer portal password updated successfully in MySQL.' });
});

// ==========================================================
// 4. CUSTOMERS MODULE API
// ==========================================================

apiRouter.get('/customers', async (_req: Request, res: Response) => {
  const customers = await dbManager.getCustomers();
  res.json({ success: true, count: customers.length, data: customers });
});

apiRouter.post('/customers', async (req: Request, res: Response) => {
  const payload = req.body;
  if (!payload || !payload.name || !payload.phone) {
    res.status(400).json({ success: false, message: 'Customer name and phone are required.' });
    return;
  }
  const newCust = {
    ...payload,
    id: payload.id || `cust-${Date.now()}`,
    customerCode: payload.customerCode || `CUST-2026-${Math.floor(100 + Math.random() * 900)}`,
    password: payload.password || '123456',
    createdAt: new Date().toISOString()
  };
  const saved = await dbManager.saveCustomer(newCust);
  res.status(201).json({ success: true, data: saved });
});

apiRouter.put('/customers/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const payload = req.body;
  const updated = await dbManager.saveCustomer({ ...payload, id });
  res.json({ success: true, data: updated });
});

apiRouter.delete('/customers/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  await dbManager.deleteCustomer(id);
  res.json({ success: true, message: 'Customer deleted.' });
});

// ==========================================================
// 5. LEADS MODULE API (CRM)
// ==========================================================

apiRouter.get('/leads', async (_req: Request, res: Response) => {
  const leads = await dbManager.getLeads();
  res.json({ success: true, count: leads.length, data: leads });
});

apiRouter.post('/leads', async (req: Request, res: Response) => {
  const payload = req.body;
  if (!payload || !payload.customerName || !payload.phone) {
    res.status(400).json({ success: false, message: 'Lead customerName and phone required.' });
    return;
  }
  const newLead = {
    ...payload,
    id: payload.id || `lead-${Date.now()}`,
    createdAt: new Date().toISOString()
  };
  const saved = await dbManager.saveLead(newLead);
  res.status(201).json({ success: true, data: saved });
});

apiRouter.put('/leads/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const payload = req.body;
  const updated = await dbManager.saveLead({ ...payload, id });
  res.json({ success: true, data: updated });
});

apiRouter.delete('/leads/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  await dbManager.deleteLead(id);
  res.json({ success: true, message: 'Lead deleted.' });
});

// ==========================================================
// 6. PROJECTS MODULE API
// ==========================================================

apiRouter.get('/projects', async (_req: Request, res: Response) => {
  const projects = await dbManager.getProjects();
  res.json({ success: true, count: projects.length, data: projects });
});

apiRouter.post('/projects', async (req: Request, res: Response) => {
  const payload = req.body;
  const newProj = {
    ...payload,
    id: payload.id || `proj-${Date.now()}`,
    createdAt: new Date().toISOString()
  };
  const saved = await dbManager.saveProject(newProj);
  res.status(201).json({ success: true, data: saved });
});

apiRouter.put('/projects/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const payload = req.body;
  const updated = await dbManager.saveProject({ ...payload, id });
  res.json({ success: true, data: updated });
});

apiRouter.delete('/projects/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  await dbManager.deleteProject(id);
  res.json({ success: true, message: 'Project deleted.' });
});

// ==========================================================
// 7. EMPLOYEES & HRMS MODULE API
// ==========================================================

apiRouter.get('/employees', async (_req: Request, res: Response) => {
  const items = await dbManager.getEmployees();
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/employees', async (req: Request, res: Response) => {
  const payload = req.body;
  if (!payload || !payload.name || !payload.phone) {
    res.status(400).json({ success: false, message: 'Employee name and phone are required.' });
    return;
  }
  const emp = {
    ...payload,
    id: payload.id || `emp-${Date.now()}`,
    employeeCode: payload.employeeCode || `EMP00${dbManager.getFallbackItems('employees').length + 1}`,
    createdAt: new Date().toISOString()
  };
  const saved = await dbManager.saveEmployee(emp);
  res.status(201).json({ success: true, data: saved });
});

apiRouter.put('/employees/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const payload = req.body;
  const updated = await dbManager.saveEmployee({ ...payload, id });
  res.json({ success: true, data: updated });
});

apiRouter.delete('/employees/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  await dbManager.deleteEmployee(id);
  res.json({ success: true, message: 'Employee deleted.' });
});

// Attendance
apiRouter.get('/attendance', async (_req: Request, res: Response) => {
  const items = await dbManager.getAttendance();
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/attendance', async (req: Request, res: Response) => {
  const att = { ...req.body, id: req.body.id || `att-${Date.now()}` };
  const saved = await dbManager.saveAttendance(att);
  res.status(201).json({ success: true, data: saved });
});

apiRouter.put('/attendance/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const saved = await dbManager.saveAttendance({ ...req.body, id });
  res.json({ success: true, data: saved });
});

apiRouter.delete('/attendance/:id', async (req: Request, res: Response) => {
  await dbManager.deleteAttendance(req.params.id);
  res.json({ success: true, message: 'Attendance deleted.' });
});

// Payslips
apiRouter.get('/payslips', async (_req: Request, res: Response) => {
  const items = await dbManager.getPayslips();
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/payslips', async (req: Request, res: Response) => {
  const ps = { ...req.body, id: req.body.id || `ps-${Date.now()}` };
  const saved = await dbManager.savePayslip(ps);
  res.status(201).json({ success: true, data: saved });
});

apiRouter.put('/payslips/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const saved = await dbManager.savePayslip({ ...req.body, id });
  res.json({ success: true, data: saved });
});

apiRouter.delete('/payslips/:id', async (req: Request, res: Response) => {
  await dbManager.deletePayslip(req.params.id);
  res.json({ success: true, message: 'Payslip deleted.' });
});

// Holidays
apiRouter.get('/holidays', async (_req: Request, res: Response) => {
  const items = await dbManager.getHolidays();
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/holidays', async (req: Request, res: Response) => {
  const h = { ...req.body, id: req.body.id || `hol-${Date.now()}` };
  const saved = await dbManager.saveHoliday(h);
  res.status(201).json({ success: true, data: saved });
});

apiRouter.put('/holidays/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const saved = await dbManager.saveHoliday({ ...req.body, id });
  res.json({ success: true, data: saved });
});

apiRouter.delete('/holidays/:id', async (req: Request, res: Response) => {
  await dbManager.deleteHoliday(req.params.id);
  res.json({ success: true, message: 'Holiday deleted.' });
});

// ==========================================================
// 8. INVENTORY & SUPPLY CHAIN MODULE APIS
// ==========================================================

// Products
apiRouter.get('/products', async (_req: Request, res: Response) => {
  const items = await dbManager.getProducts();
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/products', async (req: Request, res: Response) => {
  const prod = { ...req.body, id: req.body.id || `prod-${Date.now()}` };
  const saved = await dbManager.saveProduct(prod);
  res.status(201).json({ success: true, data: saved });
});

apiRouter.put('/products/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const saved = await dbManager.saveProduct({ ...req.body, id });
  res.json({ success: true, data: saved });
});

apiRouter.delete('/products/:id', async (req: Request, res: Response) => {
  await dbManager.deleteProduct(req.params.id);
  res.json({ success: true, message: 'Product deleted.' });
});

// Vendors
apiRouter.get('/vendors', async (_req: Request, res: Response) => {
  const items = await dbManager.getVendors();
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/vendors', async (req: Request, res: Response) => {
  const v = { ...req.body, id: req.body.id || `ven-${Date.now()}` };
  const saved = await dbManager.saveVendor(v);
  res.status(201).json({ success: true, data: saved });
});

apiRouter.put('/vendors/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const saved = await dbManager.saveVendor({ ...req.body, id });
  res.json({ success: true, data: saved });
});

apiRouter.delete('/vendors/:id', async (req: Request, res: Response) => {
  await dbManager.deleteVendor(req.params.id);
  res.json({ success: true, message: 'Vendor deleted.' });
});

// Purchase Orders
apiRouter.get('/purchase-orders', async (_req: Request, res: Response) => {
  const items = await dbManager.getPurchaseOrders();
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/purchase-orders', async (req: Request, res: Response) => {
  const po = { ...req.body, id: req.body.id || `po-${Date.now()}` };
  const saved = await dbManager.savePurchaseOrder(po);
  res.status(201).json({ success: true, data: saved });
});

apiRouter.put('/purchase-orders/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const saved = await dbManager.savePurchaseOrder({ ...req.body, id });
  res.json({ success: true, data: saved });
});

apiRouter.delete('/purchase-orders/:id', async (req: Request, res: Response) => {
  await dbManager.deletePurchaseOrder(req.params.id);
  res.json({ success: true, message: 'Purchase Order deleted.' });
});

// Bill of Materials (BOM)
apiRouter.get('/boms', async (_req: Request, res: Response) => {
  const items = await dbManager.getBOMs();
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/boms', async (req: Request, res: Response) => {
  const bom = { ...req.body, id: req.body.id || `bom-${Date.now()}` };
  const saved = await dbManager.saveBOM(bom);
  res.status(201).json({ success: true, data: saved });
});

apiRouter.put('/boms/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const saved = await dbManager.saveBOM({ ...req.body, id });
  res.json({ success: true, data: saved });
});

apiRouter.delete('/boms/:id', async (req: Request, res: Response) => {
  await dbManager.deleteBOM(req.params.id);
  res.json({ success: true, message: 'BOM deleted.' });
});

// Sales Invoices
apiRouter.get('/sales-invoices', async (_req: Request, res: Response) => {
  const items = await dbManager.getSalesInvoices();
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/sales-invoices', async (req: Request, res: Response) => {
  const inv = { ...req.body, id: req.body.id || `inv-${Date.now()}` };
  const saved = await dbManager.saveSalesInvoice(inv);
  res.status(201).json({ success: true, data: saved });
});

apiRouter.put('/sales-invoices/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const saved = await dbManager.saveSalesInvoice({ ...req.body, id });
  res.json({ success: true, data: saved });
});

apiRouter.delete('/sales-invoices/:id', async (req: Request, res: Response) => {
  await dbManager.deleteSalesInvoice(req.params.id);
  res.json({ success: true, message: 'Invoice deleted.' });
});

// Warehouses
apiRouter.get('/warehouses', async (_req: Request, res: Response) => {
  const items = await dbManager.getWarehouses();
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/warehouses', async (req: Request, res: Response) => {
  const wh = { ...req.body, id: req.body.id || `wh-${Date.now()}` };
  const saved = await dbManager.saveWarehouse(wh);
  res.status(201).json({ success: true, data: saved });
});

apiRouter.put('/warehouses/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const saved = await dbManager.saveWarehouse({ ...req.body, id });
  res.json({ success: true, data: saved });
});

apiRouter.delete('/warehouses/:id', async (req: Request, res: Response) => {
  await dbManager.deleteWarehouse(req.params.id);
  res.json({ success: true, message: 'Warehouse deleted.' });
});

// Stock Movements
apiRouter.get('/stock-movements', async (_req: Request, res: Response) => {
  const items = await dbManager.getStockMovements();
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/stock-movements', async (req: Request, res: Response) => {
  const sm = { ...req.body, id: req.body.id || `sm-${Date.now()}` };
  const saved = await dbManager.saveStockMovement(sm);
  res.status(201).json({ success: true, data: saved });
});

// Stock Audits
apiRouter.get('/stock-audits', async (_req: Request, res: Response) => {
  const items = await dbManager.getStockAudits();
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/stock-audits', async (req: Request, res: Response) => {
  const sa = { ...req.body, id: req.body.id || `audit-${Date.now()}` };
  const saved = await dbManager.saveStockAudit(sa);
  res.status(201).json({ success: true, data: saved });
});

apiRouter.delete('/stock-audits/:id', async (req: Request, res: Response) => {
  await dbManager.deleteStockAudit(req.params.id);
  res.json({ success: true, message: 'Stock audit deleted.' });
});

// ==========================================================
// 9. QUOTATIONS & SITE SURVEYS
// ==========================================================

apiRouter.get('/quotations', async (_req: Request, res: Response) => {
  const items = await dbManager.getQuotations();
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/quotations', async (req: Request, res: Response) => {
  const q = { ...req.body, id: req.body.id || `qtn-${Date.now()}` };
  const saved = await dbManager.saveQuotation(q);
  res.status(201).json({ success: true, data: saved });
});

apiRouter.put('/quotations/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const saved = await dbManager.saveQuotation({ ...req.body, id });
  res.json({ success: true, data: saved });
});

apiRouter.delete('/quotations/:id', async (req: Request, res: Response) => {
  await dbManager.deleteQuotation(req.params.id);
  res.json({ success: true, message: 'Quotation deleted.' });
});

// Site Surveys
apiRouter.get('/surveys', async (_req: Request, res: Response) => {
  const items = await dbManager.getSurveys();
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/surveys', async (req: Request, res: Response) => {
  const s = { ...req.body, id: req.body.id || `sur-${Date.now()}` };
  const saved = await dbManager.saveSurvey(s);
  res.status(201).json({ success: true, data: saved });
});

apiRouter.put('/surveys/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const saved = await dbManager.saveSurvey({ ...req.body, id });
  res.json({ success: true, data: saved });
});

apiRouter.delete('/surveys/:id', async (req: Request, res: Response) => {
  await dbManager.deleteSurvey(req.params.id);
  res.json({ success: true, message: 'Survey deleted.' });
});

// ==========================================================
// 10. FINANCE (PAYMENTS & EXPENSES)
// ==========================================================

apiRouter.get('/payments', async (_req: Request, res: Response) => {
  const items = await dbManager.getPayments();
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/payments', async (req: Request, res: Response) => {
  const pay = { ...req.body, id: req.body.id || `pay-${Date.now()}` };
  const saved = await dbManager.savePayment(pay);
  res.status(201).json({ success: true, data: saved });
});

apiRouter.delete('/payments/:id', async (req: Request, res: Response) => {
  await dbManager.deletePayment(req.params.id);
  res.json({ success: true, message: 'Payment deleted.' });
});

apiRouter.get('/expenses', async (_req: Request, res: Response) => {
  const items = await dbManager.getExpenses();
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/expenses', async (req: Request, res: Response) => {
  const ex = { ...req.body, id: req.body.id || `exp-${Date.now()}` };
  const saved = await dbManager.saveExpense(ex);
  res.status(201).json({ success: true, data: saved });
});

apiRouter.delete('/expenses/:id', async (req: Request, res: Response) => {
  await dbManager.deleteExpense(req.params.id);
  res.json({ success: true, message: 'Expense deleted.' });
});

// ==========================================================
// 11. SERVICE TICKETS & AMC CONTRACTS
// ==========================================================

apiRouter.get('/service-tickets', async (_req: Request, res: Response) => {
  const items = await dbManager.getServiceTickets();
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/service-tickets', async (req: Request, res: Response) => {
  const tk = { ...req.body, id: req.body.id || `tk-${Date.now()}` };
  const saved = await dbManager.saveServiceTicket(tk);
  res.status(201).json({ success: true, data: saved });
});

apiRouter.put('/service-tickets/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const saved = await dbManager.saveServiceTicket({ ...req.body, id });
  res.json({ success: true, data: saved });
});

apiRouter.delete('/service-tickets/:id', async (req: Request, res: Response) => {
  await dbManager.deleteServiceTicket(req.params.id);
  res.json({ success: true, message: 'Service ticket deleted.' });
});

apiRouter.get('/amc-contracts', async (_req: Request, res: Response) => {
  const items = await dbManager.getAMCContracts();
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/amc-contracts', async (req: Request, res: Response) => {
  const amc = { ...req.body, id: req.body.id || `amc-${Date.now()}` };
  const saved = await dbManager.saveAMCContract(amc);
  res.status(201).json({ success: true, data: saved });
});

apiRouter.put('/amc-contracts/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const saved = await dbManager.saveAMCContract({ ...req.body, id });
  res.json({ success: true, data: saved });
});

apiRouter.delete('/amc-contracts/:id', async (req: Request, res: Response) => {
  await dbManager.deleteAMCContract(req.params.id);
  res.json({ success: true, message: 'AMC contract deleted.' });
});

// ==========================================================
// 12. NOTIFICATIONS & SETTINGS
// ==========================================================

apiRouter.get('/notifications', async (_req: Request, res: Response) => {
  const items = await dbManager.getNotifications();
  res.json({ success: true, count: items.length, data: items });
});

apiRouter.post('/notifications', async (req: Request, res: Response) => {
  const n = { ...req.body, id: req.body.id || `notif-${Date.now()}` };
  const saved = await dbManager.saveNotification(n);
  res.status(201).json({ success: true, data: saved });
});

apiRouter.put('/notifications/:id/read', async (req: Request, res: Response) => {
  const items = await dbManager.getNotifications();
  const target = items.find(n => n.id === req.params.id);
  if (target) {
    target.isRead = true;
    await dbManager.saveNotification(target);
  }
  res.json({ success: true });
});

apiRouter.put('/notifications/read-all', async (_req: Request, res: Response) => {
  const items = await dbManager.getNotifications();
  for (const n of items) {
    n.isRead = true;
    await dbManager.saveNotification(n);
  }
  res.json({ success: true });
});

apiRouter.get('/settings', async (_req: Request, res: Response) => {
  const s = await dbManager.getSettings();
  res.json({ success: true, data: s });
});

apiRouter.post(['/settings', '/settings/update'], async (req: Request, res: Response) => {
  const s = req.body;
  const saved = await dbManager.saveSettings(s);
  res.json({ success: true, data: saved });
});

// ==========================================================
// 13. USERS MANAGEMENT API
// ==========================================================

apiRouter.get('/users', async (_req: Request, res: Response) => {
  const users = await dbManager.getUsers();
  res.json({ success: true, count: users.length, data: users });
});

apiRouter.post('/users', async (req: Request, res: Response) => {
  const u = { ...req.body, id: req.body.id || `usr-${Date.now()}` };
  const saved = await dbManager.saveUser(u);
  res.status(201).json({ success: true, data: saved });
});

apiRouter.put('/users/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const saved = await dbManager.saveUser({ ...req.body, id });
  res.json({ success: true, data: saved });
});

apiRouter.delete('/users/:id', async (req: Request, res: Response) => {
  await dbManager.deleteUser(req.params.id);
  res.json({ success: true, message: 'User deleted.' });
});
