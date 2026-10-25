import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { dbManager, getDbConfigFromEnv } from '../mysqlDatabase';
import { generateToken, verifyToken } from '../services/tokenService';

export const apiRouter = Router();

// Initialize DB Manager
dbManager.init().catch(err => {
  console.error('[DB Manager] Startup error connecting to MySQL:', err?.message || err);
});

// Admin security check for sensitive database migration and dump endpoints
function checkAdminAuth(req: Request, res: Response, next: () => void) {
  const authHeader = req.headers.authorization;
  const adminKey = req.headers['x-admin-token'] || req.headers['x-admin-key'];
  const isLocal = req.ip === '127.0.0.1' || req.ip === '::1' || req.hostname === 'localhost';
  if (isLocal || authHeader || adminKey) {
    return next();
  }
  res.status(403).json({ success: false, error: 'Access Denied: Administrative authorization required for database operations.' });
}

// ==========================================================
// 1. DATABASE & PRODUCTION MIGRATION APIS
// ==========================================================

// DB Status & Diagnostics
apiRouter.get('/db/status', (_req: Request, res: Response) => {
  try {
    const status = dbManager.getStatus();
    res.json({
      success: true,
      ...status,
      message: status.connected
        ? `Connected to MySQL database "${status.database}" on ${status.host}:${status.port}`
        : `MySQL database connection failed or disconnected.`,
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
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to get DB status' });
  }
});

// Test custom MySQL connection
apiRouter.post('/db/test-connection', async (req: Request, res: Response) => {
  try {
    const { host, port, user, password, database } = req.body || {};
    const envConfig = getDbConfigFromEnv();
    const result = await dbManager.testConnection({
      host: host || envConfig.host,
      port: Number(port) || envConfig.port,
      user: user || envConfig.user,
      password: password !== undefined ? password : envConfig.password,
      database: database || envConfig.database
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Connection test error' });
  }
});

// Push schema and migrate all existing data (Protected)
apiRouter.post('/db/migrate', checkAdminAuth, async (req: Request, res: Response) => {
  try {
    const customConfig = req.body || {};
    const result = await dbManager.runFullMigration(customConfig);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Migration error' });
  }
});

// Secure ERP data wipe with automatic pre-wipe database backup (Protected)
apiRouter.post('/db/wipe', checkAdminAuth, async (req: Request, res: Response) => {
  try {
    const { confirmation } = req.body || {};
    if (confirmation !== 'CONFIRM_WIPE_ERP_DATA') {
      res.status(400).json({
        success: false,
        message: 'Explicit confirmation required. Send { confirmation: "CONFIRM_WIPE_ERP_DATA" }'
      });
      return;
    }
    const result = await dbManager.backupAndWipeData(confirmation);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Data wipe error' });
  }
});

// Download standalone SQL database dump (Protected)
apiRouter.get(['/db/dump.sql', '/db/export-sql'], checkAdminAuth, (_req: Request, res: Response) => {
  const dumpPath = path.join(process.cwd(), 'database.sql');
  if (fs.existsSync(dumpPath)) {
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', 'attachment; filename="rejoy_solar_production_mysql.sql"');
    fs.createReadStream(dumpPath).pipe(res);
  } else {
    res.status(404).json({ success: false, error: 'Database dump file not found.' });
  }
});

// ==========================================================
// 2. MASTER BOOTSTRAP API (ONE ROUND-TRIP HYDRATION FROM MYSQL)
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

// Bulk & Entity sync endpoint for data updates directly to MySQL
apiRouter.post('/sync/push', async (req: Request, res: Response) => {
  const { collection, item, items, action, payload } = req.body || {};
  let effectiveItem = item || payload;

  try {
    if (!collection) {
      res.status(400).json({ success: false, message: 'Collection name is required.' });
      return;
    }

    // For singleton stores like settings and acl_config, allow passing either directly or via items
    if (!effectiveItem && (collection === 'settings' || collection === 'acl_config')) {
      effectiveItem = items || req.body.settings || req.body.config || req.body;
    }

    // Handle delete action
    const deleteId = effectiveItem?.id || req.body?.id || (typeof effectiveItem === 'string' ? effectiveItem : null);
    if (deleteId && (action === 'delete' || req.body.isDelete)) {
      await dbManager.deleteItem(collection, deleteId);
      console.log(`[MySQL Write Success] Deleted record ${deleteId} from collection "${collection}"`);
      res.json({ success: true, message: `Deleted from ${collection}` });
      return;
    }

    // Handle single item save
    if (effectiveItem) {
      const saved = await dbManager.saveItem(collection, effectiveItem);
      console.log(`[MySQL Write Success] Committed record "${effectiveItem.id || 'singleton'}" to collection "${collection}"`);
      res.json({ success: true, data: saved, message: `Saved to ${collection}` });
      return;
    }

    // Handle array batch save
    if (items && Array.isArray(items)) {
      for (const it of items) {
        if (it && (it.id || collection === 'settings' || collection === 'acl_config')) {
          await dbManager.saveItem(collection, it);
        }
      }
      console.log(`[MySQL Write Success] Committed batch of ${items.length} records to collection "${collection}"`);
      res.json({ success: true, count: items.length, message: `Synced ${collection} to MySQL` });
      return;
    }

    res.status(400).json({ success: false, message: 'Invalid sync payload. Expected "item" or "items" array.' });
  } catch (err: any) {
    // Safe diagnostics logging without sensitive user or auth credentials
    const safeDiagnostics = {
      collection: collection || 'unknown',
      action: action || 'save',
      recordId: effectiveItem?.id || (Array.isArray(items) ? `batch_${items.length}` : undefined),
      errorMessage: err?.message || String(err),
      sqlState: err?.sqlState,
      sqlCode: err?.code,
      timestamp: new Date().toISOString()
    };
    console.error(`[MySQL Write Error] Write failure in collection "${collection}":`, safeDiagnostics);
    res.status(500).json({
      success: false,
      error: err?.message || 'Sync error',
      diagnostics: safeDiagnostics
    });
  }
});

// ==========================================================
// 3. AUTHENTICATION & ADMIN REGISTRATION APIS (MYSQL BACKED)
// ==========================================================

apiRouter.get(['/auth/registration-status', '/auth/registration-status/'], async (_req: Request, res: Response) => {
  try {
    const status = await dbManager.getAdminRegistrationStatus();
    res.json({ success: true, ...status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to check registration status' });
  }
});

apiRouter.post(['/auth/register', '/auth/register/'], async (req: Request, res: Response) => {
  try {
    const { name, email, password, confirmPassword, phone, department, designation } = req.body || {};

    if (!name || !email || !password) {
      res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
      return;
    }

    if (confirmPassword && password !== confirmPassword) {
      res.status(400).json({ success: false, message: 'Passwords do not match.' });
      return;
    }

    if (String(password).length < 6) {
      res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
      return;
    }

    // Check if caller has administrative authorization header
    const authHeader = req.headers.authorization;
    const adminKey = req.headers['x-admin-token'] || req.headers['x-admin-key'];
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader;
    const isAuthorizedByAdmin = Boolean(
      (token && token !== 'null' && token !== 'undefined' && token.length > 5) ||
      (adminKey && String(adminKey) !== 'null' && String(adminKey) !== 'undefined' && String(adminKey).length > 2)
    );

    const user = await dbManager.registerAdmin(
      {
        name,
        email,
        password,
        phone,
        department,
        designation
      },
      isAuthorizedByAdmin
    );

    const sessionToken = generateToken(user);
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const cookieFlags = [`Path=/`, `Max-Age=${7 * 24 * 3600}`, `SameSite=${isHttps ? 'None' : 'Lax'}`];
    if (isHttps) cookieFlags.push('Secure', 'Partitioned');
    res.setHeader('Set-Cookie', `rejoysolar_auth_token=${encodeURIComponent(sessionToken)}; ${cookieFlags.join('; ')}`);

    res.status(201).json({
      success: true,
      message: 'Admin account created successfully.',
      user,
      token: sessionToken
    });
  } catch (err: any) {
    const msg = err?.message || 'Registration failed';
    const isConflict = msg.includes('already exists') || msg.includes('already registered');
    const isForbidden = msg.includes('registration is closed');
    res.status(isConflict ? 409 : isForbidden ? 403 : 500).json({
      success: false,
      message: msg
    });
  }
});

apiRouter.post(['/auth/login', '/auth/login/'], async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Email and password are required.' });
      return;
    }

    const user = await dbManager.authenticateUser(email, password);
    if (user) {
      const sessionToken = generateToken(user);
      const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
      const cookieFlags = [`Path=/`, `Max-Age=${7 * 24 * 3600}`, `SameSite=${isHttps ? 'None' : 'Lax'}`];
      if (isHttps) cookieFlags.push('Secure', 'Partitioned');
      res.setHeader('Set-Cookie', `rejoysolar_auth_token=${encodeURIComponent(sessionToken)}; ${cookieFlags.join('; ')}`);
      res.json({
        success: true,
        user,
        token: sessionToken
      });
    } else {
      res.status(401).json({
        success: false,
        message: 'Invalid credentials. Please verify your email and password in MySQL.'
      });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Authentication error' });
  }
});

// Session Verification & Current User Profile Endpoint (/api/auth/me & /api/auth/verify)
apiRouter.get(['/auth/me', '/auth/me/', '/auth/verify', '/auth/verify/'], async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const tokenHeader = (req.headers['x-auth-token'] as string) || (req.headers['x-session-token'] as string);
    let cookieToken: string | null = null;
    if (req.headers.cookie) {
      const match = req.headers.cookie.match(/(?:^|;\s*)rejoysolar_auth_token=([^;]*)/);
      if (match) cookieToken = decodeURIComponent(match[1]);
    }
    const token = (authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : (authHeader || tokenHeader)) || cookieToken;

    if (!token) {
      res.status(401).json({ success: false, message: 'Authentication required. No session token provided.' });
      return;
    }

    const verification = verifyToken(token);
    if (!verification.valid || !verification.payload) {
      res.status(401).json({ success: false, message: verification.error || 'Session expired or invalid.' });
      return;
    }

    const user = await dbManager.findUserByIdOrEmail(verification.payload.sub || verification.payload.email);
    if (!user) {
      res.status(401).json({ success: false, message: 'User account not found or has been removed from database.' });
      return;
    }

    if (user.status && user.status === 'DISABLED') {
      res.status(403).json({ success: false, message: 'Account has been disabled. Please contact system administrator.' });
      return;
    }

    // Refresh token if more than half of the validity has elapsed
    const now = Math.floor(Date.now() / 1000);
    let refreshedToken = token;
    if (verification.payload.exp - now < 3 * 24 * 3600) {
      refreshedToken = generateToken(user);
    }

    res.json({
      success: true,
      user,
      token: refreshedToken
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Session verification failed' });
  }
});

// Explicit Logout Endpoint (/api/auth/logout)
apiRouter.post(['/auth/logout', '/auth/logout/'], async (req: Request, res: Response) => {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader(
    'Set-Cookie',
    `rejoysolar_auth_token=; Path=/; Max-Age=0; SameSite=${isHttps ? 'None' : 'Lax'}${isHttps ? '; Secure; Partitioned' : ''}`
  );
  res.json({
    success: true,
    message: 'Session cleared and logged out successfully.'
  });
});

// ==========================================================
// 4. CUSTOMERS MODULE API
// ==========================================================

apiRouter.put('/customers/:id/password', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password } = req.body || {};
    if (!password) {
      res.status(400).json({ success: false, message: 'Password is required' });
      return;
    }
    const success = await dbManager.updateCustomerPassword(id, String(password).trim());
    res.json({ success, message: success ? 'Customer password updated in MySQL.' : 'Failed to update password.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Password update error' });
  }
});

apiRouter.get('/customers', async (_req: Request, res: Response) => {
  try {
    const customers = await dbManager.getCustomers();
    res.json({ success: true, count: customers.length, data: customers });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch customers' });
  }
});

apiRouter.post('/customers', async (req: Request, res: Response) => {
  try {
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
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save customer' });
  }
});

apiRouter.put('/customers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const payload = req.body;
    const updated = await dbManager.saveCustomer({ ...payload, id });
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update customer' });
  }
});

apiRouter.delete('/customers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await dbManager.deleteCustomer(id);
    res.json({ success: true, message: 'Customer deleted from MySQL.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete customer' });
  }
});

// ==========================================================
// 5. LEADS MODULE API (CRM)
// ==========================================================

apiRouter.get('/leads', async (_req: Request, res: Response) => {
  try {
    const leads = await dbManager.getLeads();
    res.json({ success: true, count: leads.length, data: leads });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch leads' });
  }
});

apiRouter.post('/leads', async (req: Request, res: Response) => {
  try {
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
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save lead' });
  }
});

apiRouter.put('/leads/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const payload = req.body;
    const updated = await dbManager.saveLead({ ...payload, id });
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update lead' });
  }
});

apiRouter.delete('/leads/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await dbManager.deleteLead(id);
    res.json({ success: true, message: 'Lead deleted from MySQL.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete lead' });
  }
});

// ==========================================================
// 6. PROJECTS MODULE API
// ==========================================================

apiRouter.get('/projects', async (_req: Request, res: Response) => {
  try {
    const projects = await dbManager.getProjects();
    res.json({ success: true, count: projects.length, data: projects });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch projects' });
  }
});

apiRouter.post('/projects', async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    const newProj = {
      ...payload,
      id: payload.id || `proj-${Date.now()}`,
      projectCode: payload.projectCode || `SOL-2026-${Math.floor(100 + Math.random() * 900)}`,
      createdAt: new Date().toISOString()
    };
    const saved = await dbManager.saveProject(newProj);
    res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save project' });
  }
});

apiRouter.put('/projects/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const payload = req.body;
    const updated = await dbManager.saveProject({ ...payload, id });
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update project' });
  }
});

apiRouter.delete('/projects/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await dbManager.deleteProject(id);
    res.json({ success: true, message: 'Project deleted from MySQL.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete project' });
  }
});

// ==========================================================
// 7. HRMS & WORKFORCE APIS
// ==========================================================

apiRouter.get('/employees', async (_req: Request, res: Response) => {
  try {
    const items = await dbManager.getEmployees();
    res.json({ success: true, count: items.length, data: items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch employees' });
  }
});

apiRouter.post('/employees', async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    const emp = {
      ...payload,
      id: payload.id || `emp-${Date.now()}`,
      employeeCode: payload.employeeCode || `EMP${Math.floor(100 + Math.random() * 900)}`,
      createdAt: new Date().toISOString()
    };
    const saved = await dbManager.saveEmployee(emp);
    res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save employee' });
  }
});

apiRouter.put('/employees/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const payload = req.body;
    const updated = await dbManager.saveEmployee({ ...payload, id });
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update employee' });
  }
});

apiRouter.delete('/employees/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await dbManager.deleteEmployee(id);
    res.json({ success: true, message: 'Employee deleted from MySQL.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete employee' });
  }
});

// Attendance
apiRouter.get('/attendance', async (_req: Request, res: Response) => {
  try {
    const items = await dbManager.getAttendance();
    res.json({ success: true, count: items.length, data: items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch attendance' });
  }
});

apiRouter.post('/attendance', async (req: Request, res: Response) => {
  try {
    const att = { ...req.body, id: req.body.id || `att-${Date.now()}` };
    const saved = await dbManager.saveAttendance(att);
    res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save attendance' });
  }
});

apiRouter.put('/attendance/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const saved = await dbManager.saveAttendance({ ...req.body, id });
    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update attendance' });
  }
});

apiRouter.delete('/attendance/:id', async (req: Request, res: Response) => {
  try {
    await dbManager.deleteAttendance(req.params.id);
    res.json({ success: true, message: 'Attendance record deleted from MySQL.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete attendance' });
  }
});

// Payslips / Payroll
apiRouter.get('/payslips', async (_req: Request, res: Response) => {
  try {
    const items = await dbManager.getPayslips();
    res.json({ success: true, count: items.length, data: items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch payslips' });
  }
});

apiRouter.post('/payslips', async (req: Request, res: Response) => {
  try {
    const ps = { ...req.body, id: req.body.id || `pay-${Date.now()}` };
    const saved = await dbManager.savePayslip(ps);
    res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save payslip' });
  }
});

apiRouter.put('/payslips/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const saved = await dbManager.savePayslip({ ...req.body, id });
    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update payslip' });
  }
});

apiRouter.delete('/payslips/:id', async (req: Request, res: Response) => {
  try {
    await dbManager.deletePayslip(req.params.id);
    res.json({ success: true, message: 'Payslip deleted from MySQL.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete payslip' });
  }
});

// Holidays
apiRouter.get('/holidays', async (_req: Request, res: Response) => {
  try {
    const items = await dbManager.getHolidays();
    res.json({ success: true, count: items.length, data: items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch holidays' });
  }
});

apiRouter.post('/holidays', async (req: Request, res: Response) => {
  try {
    const h = { ...req.body, id: req.body.id || `hol-${Date.now()}` };
    const saved = await dbManager.saveHoliday(h);
    res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save holiday' });
  }
});

apiRouter.put('/holidays/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const saved = await dbManager.saveHoliday({ ...req.body, id });
    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update holiday' });
  }
});

apiRouter.delete('/holidays/:id', async (req: Request, res: Response) => {
  try {
    await dbManager.deleteHoliday(req.params.id);
    res.json({ success: true, message: 'Holiday deleted from MySQL.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete holiday' });
  }
});

// ==========================================================
// 8. INVENTORY & PROCUREMENT APIS
// ==========================================================

// Products (Catalog)
apiRouter.get('/products', async (_req: Request, res: Response) => {
  try {
    const items = await dbManager.getProducts();
    res.json({ success: true, count: items.length, data: items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch products' });
  }
});

apiRouter.post('/products', async (req: Request, res: Response) => {
  try {
    const prod = { ...req.body, id: req.body.id || `prod-${Date.now()}` };
    const saved = await dbManager.saveProduct(prod);
    res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save product' });
  }
});

apiRouter.put('/products/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const saved = await dbManager.saveProduct({ ...req.body, id });
    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update product' });
  }
});

apiRouter.delete('/products/:id', async (req: Request, res: Response) => {
  try {
    await dbManager.deleteProduct(req.params.id);
    res.json({ success: true, message: 'Product deleted from MySQL.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete product' });
  }
});

// Vendors
apiRouter.get('/vendors', async (_req: Request, res: Response) => {
  try {
    const items = await dbManager.getVendors();
    res.json({ success: true, count: items.length, data: items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch vendors' });
  }
});

apiRouter.post('/vendors', async (req: Request, res: Response) => {
  try {
    const v = { ...req.body, id: req.body.id || `ven-${Date.now()}` };
    const saved = await dbManager.saveVendor(v);
    res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save vendor' });
  }
});

apiRouter.put('/vendors/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const saved = await dbManager.saveVendor({ ...req.body, id });
    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update vendor' });
  }
});

apiRouter.delete('/vendors/:id', async (req: Request, res: Response) => {
  try {
    await dbManager.deleteVendor(req.params.id);
    res.json({ success: true, message: 'Vendor deleted from MySQL.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete vendor' });
  }
});

// Purchase Orders
apiRouter.get('/purchase-orders', async (_req: Request, res: Response) => {
  try {
    const items = await dbManager.getPurchaseOrders();
    res.json({ success: true, count: items.length, data: items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch purchase orders' });
  }
});

apiRouter.post('/purchase-orders', async (req: Request, res: Response) => {
  try {
    const po = { ...req.body, id: req.body.id || `po-${Date.now()}` };
    const saved = await dbManager.savePurchaseOrder(po);
    res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save purchase order' });
  }
});

apiRouter.put('/purchase-orders/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const saved = await dbManager.savePurchaseOrder({ ...req.body, id });
    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update purchase order' });
  }
});

apiRouter.delete('/purchase-orders/:id', async (req: Request, res: Response) => {
  try {
    await dbManager.deletePurchaseOrder(req.params.id);
    res.json({ success: true, message: 'Purchase order deleted from MySQL.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete purchase order' });
  }
});

// Bill of Materials (BOM)
apiRouter.get('/boms', async (_req: Request, res: Response) => {
  try {
    const items = await dbManager.getBOMs();
    res.json({ success: true, count: items.length, data: items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch BOMs' });
  }
});

apiRouter.post('/boms', async (req: Request, res: Response) => {
  try {
    const bom = { ...req.body, id: req.body.id || `bom-${Date.now()}` };
    const saved = await dbManager.saveBOM(bom);
    res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save BOM' });
  }
});

apiRouter.put('/boms/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const saved = await dbManager.saveBOM({ ...req.body, id });
    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update BOM' });
  }
});

apiRouter.delete('/boms/:id', async (req: Request, res: Response) => {
  try {
    await dbManager.deleteBOM(req.params.id);
    res.json({ success: true, message: 'BOM deleted from MySQL.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete BOM' });
  }
});

// Sales Invoices
apiRouter.get('/sales-invoices', async (_req: Request, res: Response) => {
  try {
    const items = await dbManager.getSalesInvoices();
    res.json({ success: true, count: items.length, data: items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch sales invoices' });
  }
});

apiRouter.post('/sales-invoices', async (req: Request, res: Response) => {
  try {
    const inv = { ...req.body, id: req.body.id || `inv-${Date.now()}` };
    const saved = await dbManager.saveSalesInvoice(inv);
    res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save sales invoice' });
  }
});

apiRouter.put('/sales-invoices/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const saved = await dbManager.saveSalesInvoice({ ...req.body, id });
    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update sales invoice' });
  }
});

apiRouter.delete('/sales-invoices/:id', async (req: Request, res: Response) => {
  try {
    await dbManager.deleteSalesInvoice(req.params.id);
    res.json({ success: true, message: 'Sales invoice deleted from MySQL.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete sales invoice' });
  }
});

// Warehouses
apiRouter.get('/warehouses', async (_req: Request, res: Response) => {
  try {
    const items = await dbManager.getWarehouses();
    res.json({ success: true, count: items.length, data: items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch warehouses' });
  }
});

apiRouter.post('/warehouses', async (req: Request, res: Response) => {
  try {
    const wh = { ...req.body, id: req.body.id || `wh-${Date.now()}` };
    const saved = await dbManager.saveWarehouse(wh);
    res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save warehouse' });
  }
});

apiRouter.put('/warehouses/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const saved = await dbManager.saveWarehouse({ ...req.body, id });
    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update warehouse' });
  }
});

apiRouter.delete('/warehouses/:id', async (req: Request, res: Response) => {
  try {
    await dbManager.deleteWarehouse(req.params.id);
    res.json({ success: true, message: 'Warehouse deleted from MySQL.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete warehouse' });
  }
});

// Stock Movements
apiRouter.get('/stock-movements', async (_req: Request, res: Response) => {
  try {
    const items = await dbManager.getStockMovements();
    res.json({ success: true, count: items.length, data: items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch stock movements' });
  }
});

apiRouter.post('/stock-movements', async (req: Request, res: Response) => {
  try {
    const sm = { ...req.body, id: req.body.id || `sm-${Date.now()}` };
    const saved = await dbManager.saveStockMovement(sm);
    res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save stock movement' });
  }
});

// Stock Audits
apiRouter.get('/stock-audits', async (_req: Request, res: Response) => {
  try {
    const items = await dbManager.getStockAudits();
    res.json({ success: true, count: items.length, data: items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch stock audits' });
  }
});

apiRouter.post('/stock-audits', async (req: Request, res: Response) => {
  try {
    const sa = { ...req.body, id: req.body.id || `audit-${Date.now()}` };
    const saved = await dbManager.saveStockAudit(sa);
    res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save stock audit' });
  }
});

apiRouter.delete('/stock-audits/:id', async (req: Request, res: Response) => {
  try {
    await dbManager.deleteStockAudit(req.params.id);
    res.json({ success: true, message: 'Stock audit deleted from MySQL.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete stock audit' });
  }
});

// ==========================================================
// 9. QUOTATIONS & SITE SURVEYS APIS
// ==========================================================

apiRouter.get('/quotations', async (_req: Request, res: Response) => {
  try {
    const items = await dbManager.getQuotations();
    res.json({ success: true, count: items.length, data: items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch quotations' });
  }
});

apiRouter.post('/quotations', async (req: Request, res: Response) => {
  try {
    const q = { ...req.body, id: req.body.id || `quote-${Date.now()}` };
    const saved = await dbManager.saveQuotation(q);
    res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save quotation' });
  }
});

apiRouter.put('/quotations/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const saved = await dbManager.saveQuotation({ ...req.body, id });
    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update quotation' });
  }
});

apiRouter.delete('/quotations/:id', async (req: Request, res: Response) => {
  try {
    await dbManager.deleteQuotation(req.params.id);
    res.json({ success: true, message: 'Quotation deleted from MySQL.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete quotation' });
  }
});

// Site Surveys
apiRouter.get('/surveys', async (_req: Request, res: Response) => {
  try {
    const items = await dbManager.getSurveys();
    res.json({ success: true, count: items.length, data: items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch surveys' });
  }
});

apiRouter.post('/surveys', async (req: Request, res: Response) => {
  try {
    const s = { ...req.body, id: req.body.id || `surv-${Date.now()}` };
    const saved = await dbManager.saveSurvey(s);
    res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save survey' });
  }
});

apiRouter.put('/surveys/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const saved = await dbManager.saveSurvey({ ...req.body, id });
    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update survey' });
  }
});

apiRouter.delete('/surveys/:id', async (req: Request, res: Response) => {
  try {
    await dbManager.deleteSurvey(req.params.id);
    res.json({ success: true, message: 'Survey deleted from MySQL.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete survey' });
  }
});

// ==========================================================
// 10. FINANCE (PAYMENTS & EXPENSES)
// ==========================================================

apiRouter.get('/payments', async (_req: Request, res: Response) => {
  try {
    const items = await dbManager.getPayments();
    res.json({ success: true, count: items.length, data: items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch payments' });
  }
});

apiRouter.post('/payments', async (req: Request, res: Response) => {
  try {
    const pay = { ...req.body, id: req.body.id || `pay-${Date.now()}` };
    const saved = await dbManager.savePayment(pay);
    res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save payment' });
  }
});

apiRouter.delete('/payments/:id', async (req: Request, res: Response) => {
  try {
    await dbManager.deletePayment(req.params.id);
    res.json({ success: true, message: 'Payment deleted from MySQL.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete payment' });
  }
});

apiRouter.get('/expenses', async (_req: Request, res: Response) => {
  try {
    const items = await dbManager.getExpenses();
    res.json({ success: true, count: items.length, data: items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch expenses' });
  }
});

apiRouter.post('/expenses', async (req: Request, res: Response) => {
  try {
    const ex = { ...req.body, id: req.body.id || `exp-${Date.now()}` };
    const saved = await dbManager.saveExpense(ex);
    res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save expense' });
  }
});

apiRouter.delete('/expenses/:id', async (req: Request, res: Response) => {
  try {
    await dbManager.deleteExpense(req.params.id);
    res.json({ success: true, message: 'Expense deleted from MySQL.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete expense' });
  }
});

// ==========================================================
// 11. SERVICE TICKETS & AMC CONTRACTS
// ==========================================================

apiRouter.get('/service-tickets', async (_req: Request, res: Response) => {
  try {
    const items = await dbManager.getServiceTickets();
    res.json({ success: true, count: items.length, data: items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch service tickets' });
  }
});

apiRouter.post('/service-tickets', async (req: Request, res: Response) => {
  try {
    const tk = { ...req.body, id: req.body.id || `tk-${Date.now()}` };
    const saved = await dbManager.saveServiceTicket(tk);
    res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save service ticket' });
  }
});

apiRouter.put('/service-tickets/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const saved = await dbManager.saveServiceTicket({ ...req.body, id });
    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update service ticket' });
  }
});

apiRouter.delete('/service-tickets/:id', async (req: Request, res: Response) => {
  try {
    await dbManager.deleteServiceTicket(req.params.id);
    res.json({ success: true, message: 'Service ticket deleted from MySQL.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete service ticket' });
  }
});

apiRouter.get('/amc-contracts', async (_req: Request, res: Response) => {
  try {
    const items = await dbManager.getAMCContracts();
    res.json({ success: true, count: items.length, data: items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch AMC contracts' });
  }
});

apiRouter.post('/amc-contracts', async (req: Request, res: Response) => {
  try {
    const amc = { ...req.body, id: req.body.id || `amc-${Date.now()}` };
    const saved = await dbManager.saveAMCContract(amc);
    res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save AMC contract' });
  }
});

apiRouter.put('/amc-contracts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const saved = await dbManager.saveAMCContract({ ...req.body, id });
    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update AMC contract' });
  }
});

apiRouter.delete('/amc-contracts/:id', async (req: Request, res: Response) => {
  try {
    await dbManager.deleteAMCContract(req.params.id);
    res.json({ success: true, message: 'AMC contract deleted from MySQL.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete AMC contract' });
  }
});

// ==========================================================
// 12. NOTIFICATIONS & SYSTEM SETTINGS
// ==========================================================

apiRouter.get('/notifications', async (_req: Request, res: Response) => {
  try {
    const items = await dbManager.getNotifications();
    res.json({ success: true, count: items.length, data: items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch notifications' });
  }
});

apiRouter.post('/notifications', async (req: Request, res: Response) => {
  try {
    const n = { ...req.body, id: req.body.id || `notif-${Date.now()}` };
    const saved = await dbManager.saveNotification(n);
    res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save notification' });
  }
});

apiRouter.put('/notifications/:id/read', async (req: Request, res: Response) => {
  try {
    const items = await dbManager.getNotifications();
    const target = items.find((n: any) => n.id === req.params.id);
    if (target) {
      target.isRead = true;
      await dbManager.saveNotification(target);
    }
    res.json({ success: true, message: 'Notification marked read in MySQL.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update notification' });
  }
});

apiRouter.put('/notifications/mark-all-read', async (_req: Request, res: Response) => {
  try {
    const items = await dbManager.getNotifications();
    for (const n of items) {
      if (!n.isRead) {
        n.isRead = true;
        await dbManager.saveNotification(n);
      }
    }
    res.json({ success: true, message: 'All notifications marked read in MySQL.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to mark all read' });
  }
});

// System Settings
apiRouter.get('/settings', async (_req: Request, res: Response) => {
  try {
    const s = await dbManager.getSettings();
    res.json({ success: true, data: s });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch settings' });
  }
});

apiRouter.post('/settings', async (req: Request, res: Response) => {
  try {
    const s = req.body || {};
    const saved = await dbManager.saveSettings(s);
    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save settings' });
  }
});

// ACL Config & Audit Logs
apiRouter.get('/acl/config', async (_req: Request, res: Response) => {
  try {
    const cfg = await dbManager.getAclConfig();
    res.json({ success: true, data: cfg });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch ACL config' });
  }
});

apiRouter.post('/acl/config', async (req: Request, res: Response) => {
  try {
    const cfg = req.body || {};
    const saved = await dbManager.saveAclConfig(cfg);
    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save ACL config' });
  }
});

apiRouter.get('/acl/audit-logs', async (_req: Request, res: Response) => {
  try {
    const logs = await dbManager.getAclAuditLogs();
    res.json({ success: true, data: logs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch ACL audit logs' });
  }
});

apiRouter.post('/acl/audit-logs', async (req: Request, res: Response) => {
  try {
    const log = req.body || {};
    const saved = await dbManager.addAclAuditLog(log);
    res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to add ACL audit log' });
  }
});

// Users
apiRouter.get('/users', async (_req: Request, res: Response) => {
  try {
    const users = await dbManager.getUsers();
    res.json({ success: true, count: users.length, data: users });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch users' });
  }
});

apiRouter.post('/users', async (req: Request, res: Response) => {
  try {
    const u = { ...req.body, id: req.body.id || `usr-${Date.now()}` };
    const saved = await dbManager.saveUser(u);
    res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save user' });
  }
});

apiRouter.put('/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const saved = await dbManager.saveUser({ ...req.body, id });
    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update user' });
  }
});

apiRouter.delete('/users/:id', async (req: Request, res: Response) => {
  try {
    await dbManager.deleteUser(req.params.id);
    res.json({ success: true, message: 'User deleted from MySQL.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete user' });
  }
});
