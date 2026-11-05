import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { dbManager, getDbConfigFromEnv } from '../mysqlDatabase';
import { generateToken, verifyToken } from '../services/tokenService';
import { authService } from '../services/authService';

export const apiRouter = Router();

// Initialize DB Manager
dbManager.init().catch(err => {
  console.error('[DB Manager] Startup error connecting to MySQL:', err?.message || err);
});

// Role-based helper functions
export function isCustomerUser(user: any): boolean {
  if (!user) return false;
  const accountType = String(user.accountType || '').toUpperCase();
  const role = String(user.role || '').toUpperCase();
  return accountType === 'CUSTOMER' || role === 'CUSTOMER' || role === 'CLIENT';
}

export function isStaffOrAdminUser(user: any): boolean {
  if (!user) return false;
  const accountType = String(user.accountType || '').toUpperCase();
  const role = String(user.role || '').toUpperCase();
  if (accountType === 'ADMIN' || accountType === 'EMPLOYEE') return true;
  if (role === 'ADMIN' || role === 'SUPER ADMIN') return true;
  const allowed = [
    'PROJECT MANAGER', 'SITE ENGINEER', 'TECHNICIAN', 'QUALITY INSPECTOR',
    'FIELD EXECUTIVE', 'OPERATIONS', 'SOLAR TECHNICIAN', 'ENGINEER',
    'SALES EXECUTIVE', 'HR MANAGER', 'ACCOUNTANT', 'EMPLOYEE'
  ];
  return allowed.includes(role);
}

// Unified session token extractor from cookies (parsed or raw header), Bearer authorization, or custom header
export function extractSessionToken(req: Request): string | null {
  // 1. Direct cookie-parser
  if (req.cookies && req.cookies.rejoysolar_session) {
    const val = String(req.cookies.rejoysolar_session).trim();
    if (val && val !== 'null' && val !== 'undefined') return val;
  }
  if (req.cookies && req.cookies.rejoysolar_session_lax) {
    const val = String(req.cookies.rejoysolar_session_lax).trim();
    if (val && val !== 'null' && val !== 'undefined') return val;
  }
  // 2. Fallback to raw Cookie header regex for rejoysolar_session
  if (req.headers.cookie) {
    const match = req.headers.cookie.match(/(?:^|;\s*)rejoysolar_session=([^;]*)/);
    if (match && match[1]) {
      const decoded = decodeURIComponent(match[1].trim());
      if (decoded && decoded !== 'null' && decoded !== 'undefined') return decoded;
    }
    const laxMatch = req.headers.cookie.match(/(?:^|;\s*)rejoysolar_session_lax=([^;]*)/);
    if (laxMatch && laxMatch[1]) {
      const decoded = decodeURIComponent(laxMatch[1].trim());
      if (decoded && decoded !== 'null' && decoded !== 'undefined') return decoded;
    }
    const legacyMatch = req.headers.cookie.match(/(?:^|;\s*)rejoysolar_auth_token=([^;]*)/);
    if (legacyMatch && legacyMatch[1]) {
      const decoded = decodeURIComponent(legacyMatch[1].trim());
      if (decoded && decoded !== 'null' && decoded !== 'undefined') return decoded;
    }
  }
  // 3. Authorization Bearer header
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const h = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
    if (h && h !== 'null' && h !== 'undefined') return h;
  }
  // 4. Custom token headers
  const xAuth = (req.headers['x-auth-token'] as string) || (req.headers['x-session-token'] as string);
  if (xAuth && typeof xAuth === 'string') {
    const val = xAuth.trim();
    if (val && val !== 'null' && val !== 'undefined') return val;
  }
  return null;
}

// Role-based authorization middleware
export async function authenticateSessionMiddleware(req: Request, _res: Response, next: () => void) {
  try {
    const token = extractSessionToken(req);
    const pool = dbManager.getPool();

    if (token && pool) {
      const val = await authService.validateSession(pool, token);
      if (val.valid && val.user) {
        (req as any).user = val.user;
        return next();
      }
    }

    if (token) {
      const jwtVal = verifyToken(token);
      if (jwtVal.valid && jwtVal.payload) {
        const u = await dbManager.findUserByIdOrEmail(jwtVal.payload.sub || jwtVal.payload.email);
        if (u) {
          (req as any).user = u;
          return next();
        }
      }
    }
  } catch (err: any) {
    console.warn('[Auth Middleware] Verification notice:', err?.message || err);
  }
  next();
}

// Mount session authenticator globally on API router
apiRouter.use(authenticateSessionMiddleware);

export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: () => void) => {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
    }
    if (user.role === 'Admin' || user.role === 'Super Admin' || allowedRoles.includes(user.role)) {
      return next();
    }
    return res.status(403).json({ success: false, message: 'Access denied: Insufficient privileges.' });
  };
}

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

    // Role-based permission enforcement: Customers have read-only access to projects & stages
    const user = (req as any).user;
    if (user && isCustomerUser(user)) {
      const restricted = ['projects', 'solar_projects', 'solar_project_stages', 'stages'];
      if (restricted.includes(String(collection).toLowerCase())) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: Customers have read-only access to project stages and progress.'
        });
      }
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

    const pool = dbManager.getPool();
    let sessionToken = '';
    if (pool) {
      sessionToken = await authService.createSession(pool, {
        userId: user.id,
        email: user.email,
        role: user.role || 'Admin',
        accountType: 'ADMIN',
        linkedEntityId: user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      authService.setSessionCookie(res, req, sessionToken);
    } else {
      sessionToken = generateToken(user);
    }

    res.status(201).json({
      success: true,
      message: 'Admin account created successfully in MySQL.',
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

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPass = String(password).trim();
    const pool = dbManager.getPool();

    let authResult: { user: any; sessionToken: string } | null = null;

    if (pool) {
      try {
        authResult = await authService.authenticate(pool, cleanEmail, cleanPass, {
          ip: req.ip,
          userAgent: req.headers['user-agent']
        });
      } catch (authErr: any) {
        if (authErr?.message?.includes('disabled')) {
          res.status(403).json({ success: false, message: authErr.message });
          return;
        }
        console.warn('[Login] Centralized auth check notice:', authErr?.message || authErr);
      }
    }

    // Fallback authentication via dbManager if needed
    if (!authResult) {
      const legacyUser = await dbManager.authenticateUser(cleanEmail, cleanPass);
      if (legacyUser) {
        let sessToken = '';
        if (pool) {
          sessToken = await authService.createSession(pool, {
            userId: legacyUser.id,
            email: legacyUser.email,
            role: legacyUser.role || 'Admin',
            accountType: legacyUser.role === 'Customer' ? 'CUSTOMER' : 'ADMIN',
            linkedEntityId: legacyUser.customerId || legacyUser.employeeId || legacyUser.id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
          });
        } else {
          sessToken = generateToken(legacyUser);
        }
        authResult = { user: legacyUser, sessionToken: sessToken };
      }
    }

    if (authResult) {
      // Set secure HttpOnly cookie on client response
      authService.setSessionCookie(res, req, authResult.sessionToken);

      // Return authenticated sanitized user (without sensitive credentials)
      res.json({
        success: true,
        user: authResult.user,
        token: authResult.sessionToken
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
    const token = extractSessionToken(req);

    if (!token) {
      res.status(401).json({ success: false, message: 'Authentication required. No session token provided.' });
      return;
    }

    const pool = dbManager.getPool();

    // 1. Authoritative check via solar_auth_sessions table in MySQL
    if (pool) {
      const sessVerification = await authService.validateSession(pool, token);
      if (sessVerification.valid && sessVerification.user) {
        // Touch cookie freshness and preserve session cookie in browser
        authService.setSessionCookie(res, req, token);
        res.json({
          success: true,
          user: sessVerification.user,
          token
        });
        return;
      }
    }

    // 2. Fallback verification via HMAC token
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

    res.json({
      success: true,
      user,
      token
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Session verification failed' });
  }
});

// Explicit Logout Endpoint (/api/auth/logout)
apiRouter.post(['/auth/logout', '/auth/logout/'], async (req: Request, res: Response) => {
  const token = extractSessionToken(req);
  const pool = dbManager.getPool();
  if (token && pool) {
    await authService.destroySession(pool, token).catch(() => {});
  }
  authService.clearSessionCookie(res, req);
  res.json({
    success: true,
    message: 'Session cleared and logged out successfully.'
  });
});

// Password Change Endpoint (/api/auth/change-password)
apiRouter.post(['/auth/change-password', '/auth/change-password/'], async (req: Request, res: Response) => {
  try {
    const { userId, oldPassword, newPassword } = req.body || {};
    if (!userId || !oldPassword || !newPassword) {
      res.status(400).json({ success: false, message: 'User ID, current password, and new password are required.' });
      return;
    }
    const result = await dbManager.changeUserPassword(userId, oldPassword, newPassword);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, message: err?.message || 'Password change failed.' });
  }
});

// Password Reset Endpoint (/api/auth/reset-password)
apiRouter.post(['/auth/reset-password', '/auth/reset-password/'], async (req: Request, res: Response) => {
  try {
    const { email, newPassword } = req.body || {};
    if (!email) {
      res.status(400).json({ success: false, message: 'Email address is required.' });
      return;
    }
    const result = await dbManager.resetUserPassword(email, newPassword);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, message: err?.message || 'Password reset failed.' });
  }
});

// ==========================================================
// 3B. USERS MODULE API (MYSQL USER MANAGEMENT)
// ==========================================================

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
    const payload = req.body || {};
    if (!payload.name || !payload.email) {
      res.status(400).json({ success: false, message: 'User name and email are required.' });
      return;
    }
    const id = payload.id || `usr-${Date.now()}`;
    const saved = await dbManager.saveUser({ ...payload, id });
    res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to create user' });
  }
});

apiRouter.put('/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const payload = req.body || {};
    const updated = await dbManager.saveUser({ ...payload, id });
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update user' });
  }
});

apiRouter.put('/users/:id/password', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { password } = req.body || {};
    if (!password || String(password).trim().length < 6) {
      res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
      return;
    }
    const ok = await dbManager.updateUserPassword(id, String(password).trim());
    res.json({ success: ok, message: ok ? 'User password securely updated in MySQL.' : 'User account not found.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Password update failed' });
  }
});

apiRouter.delete('/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await dbManager.deleteUser(id);
    res.json({ success: true, message: 'User deleted from MySQL.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete user' });
  }
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

// Batch Customer Import (Excel / CSV Hub)
apiRouter.post(['/customers/import', '/customers/import/'], async (req: Request, res: Response) => {
  try {
    const { customers, rows } = req.body || {};
    const list = Array.isArray(customers) ? customers : (Array.isArray(rows) ? rows : []);
    if (!list || list.length === 0) {
      res.status(400).json({ success: false, message: 'No customer records provided for import.' });
      return;
    }
    const result = await dbManager.importCustomers(list);
    res.json(result);
  } catch (err: any) {
    console.error('[MySQL Customer Import Error]:', err);
    res.status(500).json({
      success: false,
      error: err?.message || 'Database error during customer import.',
      total: 0,
      imported: 0,
      skipped: 0,
      failed: 0
    });
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

// Batch Lead Import (Excel / CSV Hub)
apiRouter.post(['/leads/import', '/leads/import/'], async (req: Request, res: Response) => {
  try {
    const { leads, rows } = req.body || {};
    const list = Array.isArray(leads) ? leads : (Array.isArray(rows) ? rows : (Array.isArray(req.body) ? req.body : []));
    if (!list || list.length === 0) {
      res.status(400).json({ success: false, message: 'No lead records provided for import.' });
      return;
    }
    const result = await dbManager.importLeads(list);
    res.json(result);
  } catch (err: any) {
    console.error('[MySQL Lead Import Error]:', err);
    res.status(500).json({
      success: false,
      error: err?.message || 'Database error during lead import.',
      total: 0,
      imported: 0,
      skipped: 0,
      failed: 0
    });
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

apiRouter.get(['/projects', '/projects/'], async (_req: Request, res: Response) => {
  try {
    const projects = await dbManager.getProjects();
    res.json({ success: true, count: projects.length, data: projects });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch projects' });
  }
});

apiRouter.get(['/projects/:id', '/projects/:id/'], async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const projects = await dbManager.getProjects();
    const proj = projects.find(p => p.id === id);
    if (!proj) {
      return res.status(404).json({ success: false, error: `Project "${id}" not found.` });
    }
    res.json({ success: true, data: proj });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch project' });
  }
});

apiRouter.post(['/projects', '/projects/'], async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (user && isCustomerUser(user)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Customers have read-only access to projects and stages.'
      });
    }

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

// Batch Project Import (Excel / CSV Hub)
apiRouter.post(['/projects/import', '/projects/import/'], async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (user && isCustomerUser(user)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Customers have read-only access to projects.'
      });
    }

    const { projects, rows } = req.body || {};
    const list = Array.isArray(projects) ? projects : (Array.isArray(rows) ? rows : []);
    if (!list || list.length === 0) {
      res.status(400).json({ success: false, message: 'No project records provided for import.' });
      return;
    }
    const result = await dbManager.importProjects(list);
    res.json(result);
  } catch (err: any) {
    console.error('[MySQL Project Import Error]:', err);
    res.status(500).json({
      success: false,
      error: err?.message || 'Database error during project import.',
      total: 0,
      imported: 0,
      skipped: 0,
      failed: 0
    });
  }
});

apiRouter.put(['/projects/:id', '/projects/:id/'], async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (user && isCustomerUser(user)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Customers have read-only access to project stages and progress.'
      });
    }

    const { id } = req.params;
    const payload = req.body;
    const updated = await dbManager.saveProject({ ...payload, id });
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update project' });
  }
});

apiRouter.delete(['/projects/:id', '/projects/:id/'], async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (user && isCustomerUser(user)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Customers have read-only access to projects.'
      });
    }

    const { id } = req.params;
    await dbManager.deleteProject(id);
    res.json({ success: true, message: 'Project deleted from MySQL.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete project' });
  }
});

// Dedicated Project Stage Update API (Protected: Read-only for Customers; Editable by Admins & Staff)
apiRouter.put(['/projects/:id/stages/:stageKey', '/projects/:id/stages/:stageKey/'], async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (user && isCustomerUser(user)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Customers have read-only access to project stages and progress.'
      });
    }

    const { id: projectId, stageKey } = req.params;
    const updates = req.body || {};
    const updated = await dbManager.updateStageInProject(
      projectId,
      stageKey,
      updates,
      user?.name || 'Administrator',
      user?.role || 'Admin'
    );
    if (!updated) {
      return res.status(404).json({ success: false, error: `Project "${projectId}" or stage "${stageKey}" not found.` });
    }
    res.json({ success: true, data: updated, message: `Stage "${stageKey}" updated successfully in MySQL.` });
  } catch (err: any) {
    console.error('[Update Stage Error]:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to update stage in MySQL' });
  }
});

apiRouter.patch(['/projects/:id/stages/:stageKey', '/projects/:id/stages/:stageKey/'], async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (user && isCustomerUser(user)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Customers have read-only access to project stages and progress.'
      });
    }

    const { id: projectId, stageKey } = req.params;
    const updates = req.body || {};
    const updated = await dbManager.updateStageInProject(
      projectId,
      stageKey,
      updates,
      user?.name || 'Administrator',
      user?.role || 'Admin'
    );
    if (!updated) {
      return res.status(404).json({ success: false, error: `Project "${projectId}" or stage "${stageKey}" not found.` });
    }
    res.json({ success: true, data: updated, message: `Stage "${stageKey}" updated successfully in MySQL.` });
  } catch (err: any) {
    console.error('[Patch Stage Error]:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to update stage in MySQL' });
  }
});

// Dedicated Project Progress Update API
apiRouter.put(['/projects/:id/progress', '/projects/:id/progress/'], async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (user && isCustomerUser(user)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Customers have read-only access to project stages and progress.'
      });
    }

    const { id: projectId } = req.params;
    const { progressPercentage, status } = req.body || {};
    const updated = await dbManager.updateProjectProgress(
      projectId,
      Number(progressPercentage),
      status
    );
    if (!updated) {
      return res.status(404).json({ success: false, error: `Project "${projectId}" not found.` });
    }
    res.json({ success: true, data: updated, message: 'Project progress updated successfully in MySQL.' });
  } catch (err: any) {
    console.error('[Update Progress Error]:', err);
    res.status(500).json({ success: false, error: err?.message || 'Failed to update project progress in MySQL' });
  }
});

// ==========================================================
// 7. HRMS & WORKFORCE APIS
// ==========================================================

apiRouter.get(['/employees', '/employee'], async (_req: Request, res: Response) => {
  try {
    const items = await dbManager.getEmployees();
    res.json({ success: true, count: items.length, data: items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch employees' });
  }
});

apiRouter.post(['/employees', '/employee'], async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    const emp = {
      ...payload,
      id: payload.id || `emp-${Date.now()}`,
      employeeCode: payload.employeeCode || `EMP${Math.floor(100 + Math.random() * 900)}`,
      createdAt: payload.createdAt || new Date().toISOString()
    };
    const saved = await dbManager.saveEmployee(emp);
    res.status(201).json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to save employee' });
  }
});

// Batch Employee Import (Excel / CSV Hub)
apiRouter.post(['/employees/import', '/employees/import/', '/employee/import', '/employee/import/'], async (req: Request, res: Response) => {
  try {
    const { employees, rows } = req.body || {};
    const list = Array.isArray(employees) ? employees : (Array.isArray(rows) ? rows : (Array.isArray(req.body) ? req.body : []));
    if (!list || list.length === 0) {
      res.status(400).json({ success: false, message: 'No employee records provided for import.' });
      return;
    }
    const result = await dbManager.importEmployees(list);
    res.json(result);
  } catch (err: any) {
    console.error('[MySQL Employee Import Error]:', err);
    res.status(500).json({
      success: false,
      error: err?.message || 'Database error during employee import.',
      total: 0,
      imported: 0,
      skipped: 0,
      failed: 0
    });
  }
});

apiRouter.put(['/employees/:id', '/employee/:id'], async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const payload = req.body;
    const updated = await dbManager.saveEmployee({ ...payload, id });
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update employee' });
  }
});

apiRouter.delete(['/employees/:id', '/employee/:id'], async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await dbManager.deleteEmployee(id);
    res.json({ success: true, message: 'Employee deleted from MySQL.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete employee' });
  }
});

// Employee Documents: List documents for employee
apiRouter.get('/employees/:id/documents', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const documents = await dbManager.getEmployeeDocuments(id);
    res.json({ success: true, count: documents.length, data: documents });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to fetch employee documents' });
  }
});

// Employee Documents: Upload single or multiple documents persistently
apiRouter.post('/employees/:id/documents/upload', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, category, fileName, mimeType, fileData, notes, uploadedBy } = req.body || {};

    if (!fileName || !fileData) {
      return res.status(400).json({ success: false, error: 'File name and fileData (base64) are required.' });
    }

    const safeEmpId = path.basename(id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeFileName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const docId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const diskFileName = `${docId}_${safeFileName}`;

    const empDocsDir = path.join(process.cwd(), 'uploads', 'employees', safeEmpId, 'documents');
    if (!fs.existsSync(empDocsDir)) {
      fs.mkdirSync(empDocsDir, { recursive: true });
    }

    // Extract raw base64 data if data URI
    const base64Data = fileData.includes(',') ? fileData.split(',')[1] : fileData;
    const fileBuffer = Buffer.from(base64Data, 'base64');

    if (fileBuffer.length > 20 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'Document file size exceeds 20 MB limit.' });
    }

    const filePath = path.join(empDocsDir, diskFileName);
    fs.writeFileSync(filePath, fileBuffer);

    const relativePath = path.join('uploads', 'employees', safeEmpId, 'documents', diskFileName);
    const fileUrl = `/uploads/employees/${safeEmpId}/documents/${diskFileName}`;

    const savedDoc = await dbManager.saveEmployeeDocument({
      id: docId,
      employeeId: id,
      category: category || 'Other',
      name: name || fileName.replace(/\.[^/.]+$/, ''),
      fileName: safeFileName,
      filePath: relativePath,
      fileUrl,
      mimeType: mimeType || 'application/octet-stream',
      fileSize: fileBuffer.length,
      uploadedBy: uploadedBy || 'HR Administrator',
      notes: notes || undefined
    });

    res.json({
      success: true,
      message: `Document "${safeFileName}" uploaded and stored persistently on production server.`,
      document: savedDoc
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to upload document' });
  }
});

// Employee Documents: Delete document persistently
apiRouter.delete('/employees/:id/documents/:docId', async (req: Request, res: Response) => {
  try {
    const { id, docId } = req.params;
    await dbManager.deleteEmployeeDocument(id, docId);
    res.json({ success: true, message: 'Document removed from server and database.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to delete document' });
  }
});

// Employee Profile Photo Upload
apiRouter.post('/employees/:id/photo/upload', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { photoData, fileName, mimeType } = req.body || {};

    if (!photoData) {
      return res.status(400).json({ success: false, error: 'Photo data (base64) is required.' });
    }

    const safeEmpId = path.basename(id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const ext = fileName ? path.extname(fileName).toLowerCase() : '.jpg';
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
    const chosenExt = allowedExts.includes(ext) ? ext : '.jpg';
    const photoId = `photo-${Date.now()}`;
    const diskFileName = `${photoId}${chosenExt}`;

    const empProfileDir = path.join(process.cwd(), 'uploads', 'employees', safeEmpId, 'profile');
    if (!fs.existsSync(empProfileDir)) {
      fs.mkdirSync(empProfileDir, { recursive: true });
    }

    const base64Data = photoData.includes(',') ? photoData.split(',')[1] : photoData;
    const fileBuffer = Buffer.from(base64Data, 'base64');

    if (fileBuffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'Profile photo exceeds 5 MB limit.' });
    }

    const filePath = path.join(empProfileDir, diskFileName);
    fs.writeFileSync(filePath, fileBuffer);

    const fileUrl = `/uploads/employees/${safeEmpId}/profile/${diskFileName}`;

    // Update photo_url in solar_employees and solar_users
    await dbManager.updateEmployeePhoto(id, fileUrl);

    res.json({
      success: true,
      message: 'Employee profile photo uploaded and saved successfully.',
      photoUrl: fileUrl
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to upload photo' });
  }
});

// Secure streaming fallback endpoint for employee uploads with path traversal protection
apiRouter.get('/uploads/employees/:employeeId/:category/:filename', (req: Request, res: Response) => {
  try {
    const { employeeId, category, filename } = req.params;
    if (employeeId.includes('..') || category.includes('..') || filename.includes('..')) {
      return res.status(400).send('Invalid file path access request.');
    }

    const safeEmpId = path.basename(employeeId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeCat = path.basename(category).replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeName = path.basename(filename);

    const fullPath = path.join(process.cwd(), 'uploads', 'employees', safeEmpId, safeCat, safeName);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, error: 'File not found on server.' });
    }

    res.sendFile(fullPath);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to deliver file' });
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

// Batch Attendance Import (Excel / CSV Hub)
apiRouter.post(['/attendance/import', '/attendance/import/'], async (req: Request, res: Response) => {
  try {
    const { attendance, rows } = req.body || {};
    const list = Array.isArray(attendance) ? attendance : (Array.isArray(rows) ? rows : (Array.isArray(req.body) ? req.body : []));
    if (!list || list.length === 0) {
      res.status(400).json({ success: false, message: 'No attendance records provided for import.' });
      return;
    }
    const result = await dbManager.importAttendance(list);
    res.json(result);
  } catch (err: any) {
    console.error('[MySQL Attendance Import Error]:', err);
    res.status(500).json({
      success: false,
      error: err?.message || 'Database error during attendance import.',
      total: 0,
      imported: 0,
      skipped: 0,
      failed: 0
    });
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

apiRouter.put('/attendance/:id/fuel-approval', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { approvalStatus, approvedBy, notes } = req.body || {};
    const attendanceRecords = await dbManager.getAttendance();
    const existing = attendanceRecords.find((a: any) => a.id === id);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Attendance record not found.' });
    }

    const currentFuel = existing.fuelExpense || {};
    const updatedFuel = {
      ...currentFuel,
      approvalStatus: approvalStatus || 'APPROVED',
      approvedBy: approvedBy || (req as any).user?.name || 'Administrator',
      approvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      approvalNotes: notes || currentFuel.approvalNotes
    };

    const updatedRecord = {
      ...existing,
      fuelExpense: updatedFuel
    };

    const saved = await dbManager.saveAttendance(updatedRecord);
    res.json({ success: true, data: saved, message: `Fuel log marked as ${approvalStatus || 'APPROVED'}.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update fuel approval status' });
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

// Batch Product Import (Excel / CSV Hub)
apiRouter.post(['/products/import', '/products/import/'], async (req: Request, res: Response) => {
  try {
    const { products, rows } = req.body || {};
    const list = Array.isArray(products) ? products : (Array.isArray(rows) ? rows : (Array.isArray(req.body) ? req.body : []));
    if (!list || list.length === 0) {
      res.status(400).json({ success: false, message: 'No product records provided for import.' });
      return;
    }
    const result = await dbManager.importProducts(list);
    res.json(result);
  } catch (err: any) {
    console.error('[MySQL Product Import Error]:', err);
    res.status(500).json({
      success: false,
      error: err?.message || 'Database error during product import.',
      total: 0,
      imported: 0,
      skipped: 0,
      failed: 0
    });
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

// Batch Vendor Import (Excel / CSV Hub)
apiRouter.post(['/vendors/import', '/vendors/import/'], async (req: Request, res: Response) => {
  try {
    const { vendors, rows } = req.body || {};
    const list = Array.isArray(vendors) ? vendors : (Array.isArray(rows) ? rows : (Array.isArray(req.body) ? req.body : []));
    if (!list || list.length === 0) {
      res.status(400).json({ success: false, message: 'No vendor records provided for import.' });
      return;
    }
    const result = await dbManager.importVendors(list);
    res.json(result);
  } catch (err: any) {
    console.error('[MySQL Vendor Import Error]:', err);
    res.status(500).json({
      success: false,
      error: err?.message || 'Database error during vendor import.',
      total: 0,
      imported: 0,
      skipped: 0,
      failed: 0
    });
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

// Batch Payment Import (Excel / CSV Hub)
apiRouter.post(['/payments/import', '/payments/import/'], async (req: Request, res: Response) => {
  try {
    const { payments, rows } = req.body || {};
    const list = Array.isArray(payments) ? payments : (Array.isArray(rows) ? rows : (Array.isArray(req.body) ? req.body : []));
    if (!list || list.length === 0) {
      res.status(400).json({ success: false, message: 'No payment records provided for import.' });
      return;
    }
    const result = await dbManager.importPayments(list);
    res.json(result);
  } catch (err: any) {
    console.error('[MySQL Payment Import Error]:', err);
    res.status(500).json({
      success: false,
      error: err?.message || 'Database error during payment import.',
      total: 0,
      imported: 0,
      skipped: 0,
      failed: 0
    });
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

// Batch Expense Import (Excel / CSV Hub)
apiRouter.post(['/expenses/import', '/expenses/import/'], async (req: Request, res: Response) => {
  try {
    const { expenses, rows } = req.body || {};
    const list = Array.isArray(expenses) ? expenses : (Array.isArray(rows) ? rows : (Array.isArray(req.body) ? req.body : []));
    if (!list || list.length === 0) {
      res.status(400).json({ success: false, message: 'No expense records provided for import.' });
      return;
    }
    const result = await dbManager.importExpenses(list);
    res.json(result);
  } catch (err: any) {
    console.error('[MySQL Expense Import Error]:', err);
    res.status(500).json({
      success: false,
      error: err?.message || 'Database error during expense import.',
      total: 0,
      imported: 0,
      skipped: 0,
      failed: 0
    });
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

// Batch Service Tickets Import (Excel / CSV Hub)
apiRouter.post(['/service-tickets/import', '/service/import', '/service-tickets/import/', '/service/import/'], async (req: Request, res: Response) => {
  try {
    const { tickets, service, rows } = req.body || {};
    const list = Array.isArray(tickets) ? tickets : (Array.isArray(service) ? service : (Array.isArray(rows) ? rows : (Array.isArray(req.body) ? req.body : [])));
    if (!list || list.length === 0) {
      res.status(400).json({ success: false, message: 'No service ticket records provided for import.' });
      return;
    }
    const result = await dbManager.importServiceTickets(list);
    res.json(result);
  } catch (err: any) {
    console.error('[MySQL Service Ticket Import Error]:', err);
    res.status(500).json({
      success: false,
      error: err?.message || 'Database error during service tickets import.',
      total: 0,
      imported: 0,
      skipped: 0,
      failed: 0
    });
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
