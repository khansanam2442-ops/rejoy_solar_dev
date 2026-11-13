import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import { Request, Response } from 'express';

export type AccountType = 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER';

export interface AuthCredentialRecord {
  id: string;
  user_id: string;
  email: string;
  password_hash: string;
  role: string;
  account_type: AccountType;
  linked_entity_id?: string | null;
  status: string;
  failed_login_attempts: number;
  last_login_at?: string | null;
  password_changed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SanitizedUser {
  id: string;
  userId: string;
  employeeId?: string;
  customerId?: string;
  name: string;
  email: string;
  role: string;
  phone?: string;
  department?: string;
  designation?: string;
  isFieldWorker: boolean;
  accountType: AccountType;
  status: string;
}

export class AuthService {
  private static instance: AuthService;

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Safe bcrypt hashing with cost factor 10
   */
  public async hashPassword(password: string): Promise<string> {
    const clean = String(password || '').trim();
    if (!clean) {
      throw new Error('Password cannot be empty.');
    }
    if (clean.startsWith('$2a$') || clean.startsWith('$2b$') || clean.startsWith('$2y$') || clean.startsWith('$argon2id$')) {
      return clean;
    }
    return bcrypt.hash(clean, 10);
  }

  /**
   * Password verification comparing plaintext against bcrypt hash
   */
  public async verifyPassword(plain: string, hash: string): Promise<boolean> {
    const clean = String(plain || '').trim();
    if (!clean || !hash) return false;
    if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) {
      return bcrypt.compare(clean, hash);
    }
    // Backward compatibility for legacy plaintext during migration
    return clean === hash;
  }

  /**
   * Initializes MySQL tables for centralized auth credentials and server sessions
   */
  public async initAuthSchema(pool: mysql.Pool): Promise<void> {
    try {
      // 1. Create centralized credentials table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS \`solar_auth_credentials\` (
          \`id\` VARCHAR(64) PRIMARY KEY,
          \`user_id\` VARCHAR(64) NOT NULL UNIQUE,
          \`email\` VARCHAR(191) NOT NULL UNIQUE,
          \`password_hash\` VARCHAR(255) NOT NULL,
          \`role\` VARCHAR(64) NOT NULL,
          \`account_type\` ENUM('ADMIN', 'EMPLOYEE', 'CUSTOMER') NOT NULL,
          \`linked_entity_id\` VARCHAR(64) DEFAULT NULL,
          \`status\` VARCHAR(32) DEFAULT 'ACTIVE',
          \`failed_login_attempts\` INT DEFAULT 0,
          \`last_login_at\` TIMESTAMP NULL DEFAULT NULL,
          \`password_changed_at\` TIMESTAMP NULL DEFAULT NULL,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX \`idx_auth_cred_role\` (\`role\`),
          INDEX \`idx_auth_cred_type\` (\`account_type\`),
          INDEX \`idx_auth_cred_linked\` (\`linked_entity_id\`),
          INDEX \`idx_auth_cred_status\` (\`status\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // 2. Create server-managed session storage table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS \`solar_auth_sessions\` (
          \`id\` VARCHAR(128) PRIMARY KEY,
          \`user_id\` VARCHAR(64) NOT NULL,
          \`email\` VARCHAR(191) NOT NULL,
          \`role\` VARCHAR(64) NOT NULL,
          \`account_type\` VARCHAR(32) NOT NULL,
          \`linked_entity_id\` VARCHAR(64) DEFAULT NULL,
          \`ip_address\` VARCHAR(64) DEFAULT NULL,
          \`user_agent\` TEXT DEFAULT NULL,
          \`expires_at\` TIMESTAMP NOT NULL,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          \`last_active_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX \`idx_auth_sess_user_id\` (\`user_id\`),
          INDEX \`idx_auth_sess_expires_at\` (\`expires_at\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      console.log('[Auth Service] Centralized auth tables verified (solar_auth_credentials, solar_auth_sessions).');

      // 3. Migrate and synchronize existing accounts into solar_auth_credentials
      await this.migrateExistingAccounts(pool);
    } catch (err: any) {
      console.error('[Auth Service] Schema initialization notice:', err?.message || err);
      throw err;
    }
  }

  /**
   * Migrate existing solar_users, solar_employee, and solar_customers into solar_auth_credentials
   */
  public async migrateExistingAccounts(pool: mysql.Pool): Promise<void> {
    try {
      let migratedUsers = 0;
      let migratedEmployees = 0;
      let migratedCustomers = 0;

      // Migrate from solar_users
      try {
        const [users]: any = await pool.query('SELECT * FROM `solar_users`');
        if (Array.isArray(users)) {
          for (const u of users) {
            if (!u.email || !u.password) continue;
            const email = String(u.email).trim().toLowerCase();
            const rawPass = String(u.password);
            const passwordHash = await this.hashPassword(rawPass);
            const accountType: AccountType = (u.role === 'Customer') ? 'CUSTOMER' : (u.role === 'Admin' || u.role === 'Super Admin') ? 'ADMIN' : 'EMPLOYEE';
            const linkedEntityId = u.employee_id || u.customer_id || u.id;
            const status = u.status === 'DISABLED' || u.status === 'INACTIVE' ? 'DISABLED' : 'ACTIVE';

            await pool.query(`
              INSERT INTO \`solar_auth_credentials\` (
                \`id\`, \`user_id\`, \`email\`, \`password_hash\`, \`role\`,
                \`account_type\`, \`linked_entity_id\`, \`status\`
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                \`role\` = VALUES(\`role\`),
                \`account_type\` = VALUES(\`account_type\`),
                \`linked_entity_id\` = COALESCE(VALUES(\`linked_entity_id\`), \`linked_entity_id\`),
                \`status\` = VALUES(\`status\`)
                ${!u.password?.startsWith('$2') ? ', `password_hash` = VALUES(`password_hash`)' : ''}
            `, [
              `cred-${u.id}`,
              u.id,
              email,
              passwordHash,
              u.role || 'Admin',
              accountType,
              linkedEntityId,
              status
            ]);
            migratedUsers++;
          }
        }
      } catch (err: any) {
        console.warn('[Auth Service] Notice migrating users to credentials:', err.message);
      }

      // Migrate from solar_employees (and fallback to solar_employee) — skip accounts without explicit password
      try {
        let employees: any[] = [];
        try {
          const [empRows]: any = await pool.query('SELECT * FROM `solar_employees`');
          if (Array.isArray(empRows)) employees = empRows;
        } catch {}
        if (employees.length === 0) {
          try {
            const [empRowsOld]: any = await pool.query('SELECT * FROM `solar_employee`');
            if (Array.isArray(empRowsOld)) employees = empRowsOld;
          } catch {}
        }
        if (Array.isArray(employees)) {
          for (const emp of employees) {
            if (!emp.email) continue;
            const email = String(emp.email).trim().toLowerCase();
            // Do not overwrite or assign a weak static password; generate unguessable random secret if employee row lacks password
            const rawEmpPass = emp.password ? String(emp.password) : `${emp.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const role = emp.system_role || emp.assigned_role || emp.designation || 'Technician';
            const accountType: AccountType = (role === 'Admin' || role === 'Super Admin') ? 'ADMIN' : 'EMPLOYEE';
            const status = (emp.status === 'INACTIVE' || emp.account_status === 'DISABLED' || emp.login_enabled === 0) ? 'DISABLED' : 'ACTIVE';
            const passwordHash = await this.hashPassword(rawEmpPass);

            await pool.query(`
              INSERT INTO \`solar_auth_credentials\` (
                \`id\`, \`user_id\`, \`email\`, \`password_hash\`, \`role\`,
                \`account_type\`, \`linked_entity_id\`, \`status\`
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                \`role\` = VALUES(\`role\`),
                \`account_type\` = VALUES(\`account_type\`),
                \`linked_entity_id\` = VALUES(\`linked_entity_id\`),
                \`status\` = VALUES(\`status\`)
            `, [
              `cred-${emp.id}`,
              emp.id,
              email,
              passwordHash,
              role,
              accountType,
              emp.id,
              status
            ]);
            migratedEmployees++;
          }
        }
      } catch (err: any) {
        console.warn('[Auth Service] Notice migrating employees to credentials:', err.message);
      }

      // Migrate from solar_customers
      try {
        const [customers]: any = await pool.query('SELECT * FROM `solar_customers`');
        if (Array.isArray(customers)) {
          for (const c of customers) {
            if (!c.email || !c.password) continue;
            const email = String(c.email).trim().toLowerCase();
            const rawPass = String(c.password);
            const passwordHash = await this.hashPassword(rawPass);
            const status = c.status === 'INACTIVE' ? 'DISABLED' : 'ACTIVE';

            await pool.query(`
              INSERT INTO \`solar_auth_credentials\` (
                \`id\`, \`user_id\`, \`email\`, \`password_hash\`, \`role\`,
                \`account_type\`, \`linked_entity_id\`, \`status\`
              ) VALUES (?, ?, ?, ?, 'Customer', 'CUSTOMER', ?, ?)
              ON DUPLICATE KEY UPDATE
                \`role\` = 'Customer',
                \`account_type\` = 'CUSTOMER',
                \`linked_entity_id\` = VALUES(\`linked_entity_id\`),
                \`status\` = VALUES(\`status\`)
                ${!c.password?.startsWith('$2') ? ', `password_hash` = VALUES(`password_hash`)' : ''}
            `, [
              `cred-cust-${c.id}`,
              `usr-${c.id}`,
              email,
              passwordHash,
              c.id,
              status
            ]);
            migratedCustomers++;
          }
        }
      } catch (err: any) {
        console.warn('[Auth Service] Notice migrating customers to credentials:', err.message);
      }

      console.log(`[Auth Service] Completed credential sync: ${migratedUsers} users, ${migratedEmployees} employees, ${migratedCustomers} customers synced to solar_auth_credentials.`);
    } catch (e: any) {
      console.warn('[Auth Service] Migration notice:', e?.message || e);
    }
  }

  /**
   * Create or update a credential record in solar_auth_credentials
   */
  public async setCredential(pool: mysql.Pool, data: {
    userId: string;
    email: string;
    password?: string;
    role: string;
    accountType: AccountType;
    linkedEntityId?: string | null;
    status?: string;
  }): Promise<void> {
    const cleanEmail = data.email.trim().toLowerCase();
    const status = data.status || 'ACTIVE';

    if (data.password) {
      const passwordHash = await this.hashPassword(data.password);
      await pool.query(`
        INSERT INTO \`solar_auth_credentials\` (
          \`id\`, \`user_id\`, \`email\`, \`password_hash\`, \`role\`,
          \`account_type\`, \`linked_entity_id\`, \`status\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          \`email\` = VALUES(\`email\`),
          \`password_hash\` = VALUES(\`password_hash\`),
          \`role\` = VALUES(\`role\`),
          \`account_type\` = VALUES(\`account_type\`),
          \`linked_entity_id\` = VALUES(\`linked_entity_id\`),
          \`status\` = VALUES(\`status\`),
          \`password_changed_at\` = NOW()
      `, [
        `cred-${data.userId}`,
        data.userId,
        cleanEmail,
        passwordHash,
        data.role,
        data.accountType,
        data.linkedEntityId || data.userId,
        status
      ]);
    } else {
      await pool.query(`
        UPDATE \`solar_auth_credentials\`
        SET \`email\` = ?, \`role\` = ?, \`account_type\` = ?, \`linked_entity_id\` = ?, \`status\` = ?
        WHERE \`user_id\` = ? OR \`email\` = ?
      `, [
        cleanEmail,
        data.role,
        data.accountType,
        data.linkedEntityId || data.userId,
        status,
        data.userId,
        cleanEmail
      ]);
    }
  }

  /**
   * Authenticate email and password against solar_auth_credentials
   */
  public async authenticate(pool: mysql.Pool, email: string, pass: string, clientInfo?: { ip?: string; userAgent?: string }): Promise<{
    user: SanitizedUser;
    sessionToken: string;
  } | null> {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPass = String(pass || '').trim();

    if (!cleanEmail || !cleanPass) return null;

    const [rows]: any = await pool.query(
      'SELECT * FROM `solar_auth_credentials` WHERE LOWER(`email`) = ? LIMIT 1',
      [cleanEmail]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }

    const cred: AuthCredentialRecord = rows[0];

    // Check account status
    if (cred.status === 'DISABLED' || cred.status === 'INACTIVE') {
      throw new Error('This account has been disabled. Please contact system administrator.');
    }

    // Verify password with bcrypt
    const isMatch = await this.verifyPassword(cleanPass, cred.password_hash);
    if (!isMatch) {
      // Increment failed attempts
      await pool.query(
        'UPDATE `solar_auth_credentials` SET `failed_login_attempts` = `failed_login_attempts` + 1 WHERE `id` = ?',
        [cred.id]
      ).catch(() => {});
      return null;
    }

    // Upgrade hash if legacy plaintext was detected
    if (!cred.password_hash.startsWith('$2a$') && !cred.password_hash.startsWith('$2b$') && !cred.password_hash.startsWith('$2y$')) {
      const upgradedHash = await this.hashPassword(cleanPass);
      await pool.query(
        'UPDATE `solar_auth_credentials` SET `password_hash` = ?, `failed_login_attempts` = 0, `last_login_at` = NOW() WHERE `id` = ?',
        [upgradedHash, cred.id]
      ).catch(() => {});
    } else {
      await pool.query(
        'UPDATE `solar_auth_credentials` SET `failed_login_attempts` = 0, `last_login_at` = NOW() WHERE `id` = ?',
        [cred.id]
      ).catch(() => {});
    }

    // Build unified user profile from authoritative tables
    const userProfile = await this.fetchUserProfile(pool, cred);

    // Create server-managed session in solar_auth_sessions
    const sessionToken = await this.createSession(pool, {
      userId: cred.user_id,
      email: cred.email,
      role: cred.role,
      accountType: cred.account_type,
      linkedEntityId: cred.linked_entity_id,
      ipAddress: clientInfo?.ip,
      userAgent: clientInfo?.userAgent
    });

    return {
      user: userProfile,
      sessionToken
    };
  }

  /**
   * Fetch full user profile from linked table
   */
  public async fetchUserProfile(pool: mysql.Pool, cred: AuthCredentialRecord): Promise<SanitizedUser> {
    const isFieldWorkerRole = [
      'Site Survey Engineer',
      'Site Inspector',
      'Civil Team',
      'Structure Team',
      'Installation Team',
      'Electrical Team',
      'Technician'
    ].includes(cred.role);

    // If CUSTOMER account
    if (cred.account_type === 'CUSTOMER') {
      const custId = cred.linked_entity_id || cred.user_id.replace(/^usr-/, '');
      const [cRows]: any = await pool.query(
        'SELECT * FROM `solar_customers` WHERE `id` = ? OR `email` = ? LIMIT 1',
        [custId, cred.email]
      );
      if (Array.isArray(cRows) && cRows.length > 0) {
        const c = cRows[0];
        return {
          id: `usr-${c.id}`,
          userId: `usr-${c.id}`,
          customerId: c.id,
          name: c.name,
          email: c.email,
          role: 'Customer',
          phone: c.phone || '',
          department: 'Customer',
          designation: 'Customer',
          isFieldWorker: false,
          accountType: 'CUSTOMER',
          status: c.status || 'ACTIVE'
        };
      }
    }

    // If EMPLOYEE account or ADMIN, first check solar_employees (and fallback to solar_employee)
    const empId = cred.linked_entity_id || cred.user_id;
    let eRows: any[] = [];
    try {
      const [rows]: any = await pool.query(
        'SELECT * FROM `solar_employees` WHERE `id` = ? OR LOWER(`email`) = ? LIMIT 1',
        [empId, cred.email]
      );
      if (Array.isArray(rows) && rows.length > 0) eRows = rows;
    } catch {}

    if (eRows.length === 0) {
      try {
        const [rowsOld]: any = await pool.query(
          'SELECT * FROM `solar_employee` WHERE `id` = ? OR LOWER(`email`) = ? LIMIT 1',
          [empId, cred.email]
        );
        if (Array.isArray(rowsOld) && rowsOld.length > 0) eRows = rowsOld;
      } catch {}
    }

    if (Array.isArray(eRows) && eRows.length > 0) {
      const e = eRows[0];
      return {
        id: e.id,
        userId: cred.user_id,
        employeeId: e.employee_code || e.id,
        name: e.name,
        email: e.email,
        role: cred.role || e.system_role || e.designation || 'Technician',
        phone: e.phone || '',
        department: e.department || 'Operations',
        designation: e.designation || cred.role,
        isFieldWorker: Boolean(e.is_field_worker || isFieldWorkerRole),
        accountType: cred.account_type,
        status: e.status || 'ACTIVE'
      };
    }

    // Check solar_users
    const [uRows]: any = await pool.query(
      'SELECT * FROM `solar_users` WHERE `id` = ? OR LOWER(`email`) = ? LIMIT 1',
      [cred.user_id, cred.email]
    );
    if (Array.isArray(uRows) && uRows.length > 0) {
      const u = uRows[0];
      return {
        id: u.id,
        userId: u.id,
        employeeId: u.employee_id || u.id,
        name: u.name,
        email: u.email,
        role: cred.role || u.role,
        phone: u.phone || '',
        department: u.department || 'Administration',
        designation: u.designation || cred.role,
        isFieldWorker: Boolean(u.is_field_worker || isFieldWorkerRole),
        accountType: cred.account_type,
        status: u.status || 'ACTIVE'
      };
    }

    // Default fallback
    return {
      id: cred.user_id,
      userId: cred.user_id,
      name: cred.email.split('@')[0],
      email: cred.email,
      role: cred.role,
      isFieldWorker: isFieldWorkerRole,
      accountType: cred.account_type,
      status: cred.status
    };
  }

  /**
   * Create server session in solar_auth_sessions
   */
  public async createSession(pool: mysql.Pool, data: {
    userId: string;
    email: string;
    role: string;
    accountType: string;
    linkedEntityId?: string | null;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<string> {
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');

    await pool.query(`
      INSERT INTO \`solar_auth_sessions\` (
        \`id\`, \`user_id\`, \`email\`, \`role\`, \`account_type\`,
        \`linked_entity_id\`, \`ip_address\`, \`user_agent\`, \`expires_at\`
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      sessionToken,
      data.userId,
      data.email.toLowerCase(),
      data.role,
      data.accountType,
      data.linkedEntityId || null,
      data.ipAddress || null,
      data.userAgent || null,
      expiresAt
    ]);

    return sessionToken;
  }

  /**
   * Validate server session from solar_auth_sessions
   */
  public async validateSession(pool: mysql.Pool, sessionToken: string): Promise<{ valid: boolean; user?: SanitizedUser; error?: string }> {
    if (!sessionToken || typeof sessionToken !== 'string') {
      return { valid: false, error: 'No session token provided.' };
    }

    const cleanToken = sessionToken.trim();
    const [rows]: any = await pool.query(
      'SELECT * FROM \`solar_auth_sessions\` WHERE \`id\` = ? LIMIT 1',
      [cleanToken]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return { valid: false, error: 'Session not found or expired.' };
    }

    const sess = rows[0];
    let expiryMs = 0;
    if (sess.expires_at instanceof Date) {
      expiryMs = sess.expires_at.getTime();
    } else {
      const str = String(sess.expires_at || '');
      expiryMs = new Date(str.includes('Z') ? str : str.replace(' ', 'T') + 'Z').getTime();
      if (isNaN(expiryMs)) expiryMs = new Date(sess.expires_at).getTime();
    }

    if (expiryMs > 0 && Date.now() > expiryMs) {
      await pool.query('DELETE FROM `solar_auth_sessions` WHERE `id` = ?', [cleanToken]).catch(() => {});
      return { valid: false, error: 'Session has expired.' };
    }

    // Touch last_active_at
    await pool.query('UPDATE `solar_auth_sessions` SET `last_active_at` = NOW() WHERE `id` = ?', [cleanToken]).catch(() => {});

    // Get current credentials and profile
    const [credRows]: any = await pool.query(
      'SELECT * FROM `solar_auth_credentials` WHERE `user_id` = ? OR LOWER(`email`) = ? LIMIT 1',
      [sess.user_id, sess.email]
    );

    if (!Array.isArray(credRows) || credRows.length === 0) {
      return { valid: false, error: 'User credential record not found in MySQL.' };
    }

    const cred = credRows[0];
    if (cred.status === 'DISABLED' || cred.status === 'INACTIVE') {
      return { valid: false, error: 'Account has been disabled.' };
    }

    const userProfile = await this.fetchUserProfile(pool, cred);
    return { valid: true, user: userProfile };
  }

  /**
   * Destroy server session on logout
   */
  public async destroySession(pool: mysql.Pool, sessionToken: string): Promise<boolean> {
    if (!sessionToken) return true;
    try {
      await pool.query('DELETE FROM `solar_auth_sessions` WHERE `id` = ?', [sessionToken.trim()]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Securely update password with bcrypt hash
   */
  public async updatePassword(pool: mysql.Pool, userIdOrEmail: string, newPass: string): Promise<boolean> {
    const cleanPass = String(newPass || '').trim();
    if (!cleanPass || cleanPass.length < 6) {
      throw new Error('New password must be at least 6 characters in length.');
    }

    const passwordHash = await this.hashPassword(cleanPass);
    const idOrEmail = String(userIdOrEmail).trim().toLowerCase();

    // 1. Update solar_auth_credentials
    await pool.query(`
      UPDATE \`solar_auth_credentials\`
      SET \`password_hash\` = ?, \`password_changed_at\` = NOW()
      WHERE \`user_id\` = ? OR LOWER(\`email\`) = ?
    `, [passwordHash, idOrEmail, idOrEmail]);

    // 2. Synchronize to solar_users if exists
    await pool.query(`
      UPDATE \`solar_users\`
      SET \`password\` = ?
      WHERE \`id\` = ? OR LOWER(\`email\`) = ?
    `, [passwordHash, idOrEmail, idOrEmail]).catch(() => {});

    // 3. Synchronize to solar_customers if exists
    await pool.query(`
      UPDATE \`solar_customers\`
      SET \`password\` = ?
      WHERE \`id\` = ? OR LOWER(\`email\`) = ?
    `, [passwordHash, idOrEmail.replace(/^usr-/, ''), idOrEmail]).catch(() => {});

    return true;
  }

  /**
   * Robust detection of HTTPS and Cloud Run / proxy environments
   */
  public isSecureRequest(req: Request): boolean {
    if (req.secure) return true;
    if (req.protocol === 'https') return true;
    const proto = String(req.headers['x-forwarded-proto'] || '');
    if (proto.toLowerCase().includes('https')) return true;
    if (req.headers['x-forwarded-ssl'] === 'on') return true;
    if (req.headers['x-cloud-trace-context']) return true;
    if (process.env.NODE_ENV === 'production') return true;
    return false;
  }

  /**
   * Attach HttpOnly, Secure, SameSite, and Partitioned cookie to Express response
   */
  public setSessionCookie(res: Response, req: Request, sessionToken: string): void {
    const isHttps = this.isSecureRequest(req);
    const maxAgeMs = 7 * 24 * 3600 * 1000; // 7 days

    if (isHttps) {
      // Primary cookie for iframes (SameSite=None, Secure, Partitioned)
      res.cookie('rejoysolar_session', sessionToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/',
        maxAge: maxAgeMs,
        partitioned: true
      } as any);

      // Fallback cookie for top-level browser direct navigation (SameSite=Lax, Secure)
      res.cookie('rejoysolar_session_lax', sessionToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: maxAgeMs
      });
    } else {
      // Local development over plain HTTP on localhost / 127.0.0.1
      res.cookie('rejoysolar_session', sessionToken, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: maxAgeMs
      });
    }
  }

  /**
   * Clear session cookie on Express response
   */
  public clearSessionCookie(res: Response, req: Request): void {
    const isHttps = this.isSecureRequest(req);
    const cookieOpts: any = {
      httpOnly: true,
      secure: isHttps,
      sameSite: isHttps ? 'none' : 'lax',
      path: '/'
    };
    if (isHttps) {
      cookieOpts.partitioned = true;
    }

    res.clearCookie('rejoysolar_session', cookieOpts);
    res.clearCookie('rejoysolar_session_lax', {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      path: '/'
    });
    // Also clear legacy tokens
    res.clearCookie('rejoysolar_auth_token', {
      ...cookieOpts,
      httpOnly: false
    });
  }
}

export const authService = AuthService.getInstance();
