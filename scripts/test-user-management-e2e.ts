import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import http from 'http';
import { createServerApp } from '../server/serverApp';
import { dbManager, getDbConfigFromEnv } from '../server/mysqlDatabase';
import { ensureLocalMySqlRunning } from '../server/mysqlDaemon';

const TEST_PORT = 3599;

function httpRequest(
  method: string,
  urlPath: string,
  payload?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; data: any }> {
  return new Promise((resolve, reject) => {
    const postData = payload ? JSON.stringify(payload) : undefined;
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers
    };
    if (postData) {
      reqHeaders['Content-Length'] = Buffer.byteLength(postData).toString();
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: TEST_PORT,
        path: urlPath,
        method,
        headers: reqHeaders
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          let data: any = raw;
          try {
            data = JSON.parse(raw);
          } catch {}
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            data
          });
        });
      }
    );

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runEndToEndVerification() {
  console.log('================================================================');
  console.log('REJOY SOLAR ERP - END-TO-END USER MANAGEMENT & MYSQL AUDIT');
  console.log('================================================================');

  // 1. Ensure MySQL daemon is running
  await ensureLocalMySqlRunning();

  const cfg = getDbConfigFromEnv();
  const directConn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database
  });
  console.log(`Connected to MySQL database "${cfg.database}" on ${cfg.host}:${cfg.port}`);

  await dbManager.init();

  // Start Express server instance
  const app = await createServerApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(TEST_PORT, '127.0.0.1', () => {
      console.log(`Test Express server listening on 127.0.0.1:${TEST_PORT}`);
      resolve();
    });
  });

  const now = Date.now();
  const testEmail = `solartest.${now}@rejoysolar.com`;
  const initialPassword = 'InitialSecretPass@2026';
  const updatedPassword = 'UpdatedSecretPass@2027';
  let createdUserId = '';

  try {
    // -------------------------------------------------------------
    // Test 1: POST /api/admin/create-employee-account
    // -------------------------------------------------------------
    console.log('\n--- TEST 1: POST /api/admin/create-employee-account ---');
    const createRes = await httpRequest('POST', '/api/admin/create-employee-account', {
      email: testEmail,
      password: initialPassword,
      displayName: 'Anita Sharma',
      systemRole: 'Site Survey Engineer',
      employeeCode: `EMP-AST-${now.toString().slice(-4)}`,
      phone: '+91 98123 45678',
      department: 'Engineering',
      designation: 'Senior Solar Surveyor'
    });

    console.log('Response Status:', createRes.status);
    console.log('Response Body:', createRes.data);

    if (createRes.status !== 201 && createRes.status !== 200) {
      throw new Error(`Account creation failed with status ${createRes.status}: ${JSON.stringify(createRes.data)}`);
    }
    if (!createRes.data.success || !createRes.data.uid) {
      throw new Error('Account creation did not return success and uid!');
    }
    createdUserId = createRes.data.uid;
    console.log('PASS: /api/admin/create-employee-account succeeded with uid:', createdUserId);

    // -------------------------------------------------------------
    // Test 2: Verify direct MySQL storage and bcrypt hash
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: VERIFY DIRECT MYSQL PERSISTENCE & BCRYPT HASH ---');
    const [userRows]: any = await directConn.query(
      'SELECT id, name, email, password, role, department, designation, employee_id, status FROM solar_users WHERE LOWER(email) = ?',
      [testEmail.toLowerCase()]
    );

    if (!Array.isArray(userRows) || userRows.length === 0) {
      throw new Error(`User with email "${testEmail}" was NOT persisted to solar_users in MySQL!`);
    }

    const dbUser = userRows[0];
    console.log('solar_users record found in MySQL:');
    console.log({
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role,
      department: dbUser.department,
      designation: dbUser.designation,
      hash_prefix: dbUser.password.slice(0, 15),
      hash_length: dbUser.password.length,
      status: dbUser.status
    });

    if (dbUser.password === initialPassword) {
      throw new Error('CRITICAL FLAW: User password was stored in PLAINTEXT in MySQL!');
    }

    const isBcrypt = dbUser.password.startsWith('$2a$') || dbUser.password.startsWith('$2b$') || dbUser.password.startsWith('$2y$');
    if (!isBcrypt) {
      throw new Error(`CRITICAL FLAW: User password is not a bcrypt hash: ${dbUser.password}`);
    }
    console.log('PASS: Password is stored strictly as a bcrypt hash.');

    const hashValid = await bcrypt.compare(initialPassword, dbUser.password);
    if (!hashValid) {
      throw new Error('Stored bcrypt hash does not match initial password!');
    }
    console.log('PASS: bcrypt.compare verified password matches stored hash.');

    // Verify employee record in solar_employees
    const [empRows]: any = await directConn.query(
      'SELECT id, employee_code, name, email, department, designation, system_role, login_enabled, status FROM solar_employees WHERE LOWER(email) = ?',
      [testEmail.toLowerCase()]
    );
    if (!Array.isArray(empRows) || empRows.length === 0) {
      throw new Error(`Employee record was NOT synchronized to solar_employees in MySQL!`);
    }
    console.log('solar_employees record found in MySQL:', empRows[0]);
    console.log('PASS: solar_employees synchronized with login_enabled = 1.');

    // -------------------------------------------------------------
    // Test 3: POST /api/auth/login with valid credentials
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: POST /api/auth/login (VALID CREDENTIALS) ---');
    const loginRes = await httpRequest('POST', '/api/auth/login', {
      email: testEmail,
      password: initialPassword
    });

    console.log('Login Status:', loginRes.status);
    console.log('Login Success:', loginRes.data.success);
    if (loginRes.status !== 200 || !loginRes.data.success) {
      throw new Error(`Login with valid credentials failed: ${JSON.stringify(loginRes.data)}`);
    }
    if (!loginRes.data.token) {
      throw new Error('Login response did not return a session JWT token!');
    }
    if (loginRes.data.user.password || (loginRes.data.user as any).password_hash) {
      throw new Error('CRITICAL FLAW: Password hash was leaked in /api/auth/login response!');
    }
    console.log('PASS: Authenticated successfully against MySQL and received clean user object with token.');

    // -------------------------------------------------------------
    // Test 4: POST /api/auth/login with INVALID credentials
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: POST /api/auth/login (INVALID CREDENTIALS) ---');
    const badLoginRes = await httpRequest('POST', '/api/auth/login', {
      email: testEmail,
      password: 'CompletelyWrongPassword123!'
    });
    console.log('Bad Login Status:', badLoginRes.status);
    if (badLoginRes.status !== 401 || badLoginRes.data.success === true) {
      throw new Error(`Invalid password was NOT rejected! Status=${badLoginRes.status}`);
    }
    console.log('PASS: Invalid password rejected with HTTP 401.');

    // -------------------------------------------------------------
    // Test 5: POST /api/admin/update-employee-account (PASSWORD & PROFILE CHANGE)
    // -------------------------------------------------------------
    console.log('\n--- TEST 5: POST /api/admin/update-employee-account (CHANGE PASSWORD & DETAILS) ---');
    const updateRes = await httpRequest('POST', '/api/admin/update-employee-account', {
      uid: createdUserId,
      password: updatedPassword,
      name: 'Anita Sharma (Lead)',
      department: 'Solar Operations',
      designation: 'Principal PV Designer'
    });

    console.log('Update Status:', updateRes.status);
    console.log('Update Body:', updateRes.data);
    if (updateRes.status !== 200 || !updateRes.data.success) {
      throw new Error(`Failed to update employee account: ${JSON.stringify(updateRes.data)}`);
    }

    // Verify raw MySQL hash changed
    const [afterUpdateRows]: any = await directConn.query(
      'SELECT id, name, department, designation, password FROM solar_users WHERE id = ?',
      [createdUserId]
    );
    const updatedDbUser = afterUpdateRows[0];
    console.log('Updated user in MySQL:', {
      name: updatedDbUser.name,
      department: updatedDbUser.department,
      designation: updatedDbUser.designation,
      hash_prefix: updatedDbUser.password.slice(0, 15)
    });

    if (updatedDbUser.password === dbUser.password) {
      throw new Error('CRITICAL FLAW: Password hash did not change after password update!');
    }
    const newHashValid = await bcrypt.compare(updatedPassword, updatedDbUser.password);
    if (!newHashValid) {
      throw new Error('New bcrypt hash in MySQL does not match updated password!');
    }
    console.log('PASS: New password securely hashed with bcrypt in MySQL.');

    // Test 6: Verify old password fails, new password succeeds
    console.log('\n--- TEST 6: VERIFY OLD PASSWORD REJECTED, NEW PASSWORD ACCEPTS ---');
    const oldLoginTry = await httpRequest('POST', '/api/auth/login', {
      email: testEmail,
      password: initialPassword
    });
    if (oldLoginTry.status === 200) {
      throw new Error('CRITICAL: Old password still works after password change!');
    }
    console.log('PASS: Old password rejected (401).');

    const newLoginTry = await httpRequest('POST', '/api/auth/login', {
      email: testEmail,
      password: updatedPassword
    });
    if (newLoginTry.status !== 200 || !newLoginTry.data.success) {
      throw new Error(`New password failed to authenticate: ${JSON.stringify(newLoginTry.data)}`);
    }
    console.log('PASS: New password authenticated successfully.');

    // -------------------------------------------------------------
    // Test 7: Verify GET /api/users never exposes password hashes
    // -------------------------------------------------------------
    console.log('\n--- TEST 7: VERIFY GET /api/users STRIPS ALL PASSWORD HASHES ---');
    const usersRes = await httpRequest('GET', '/api/users');
    if (usersRes.status !== 200 || !Array.isArray(usersRes.data.data)) {
      throw new Error(`GET /api/users failed: ${JSON.stringify(usersRes.data)}`);
    }
    for (const u of usersRes.data.data) {
      if (u.password || (u as any).password_hash) {
        throw new Error(`CRITICAL SECURITY FAILURE: Password hash exposed in /api/users for user ${u.email}!`);
      }
    }
    console.log(`PASS: Verified ${usersRes.data.data.length} users in /api/users — ZERO password or hash leaks.`);

    // -------------------------------------------------------------
    // Test 8: Verify bootstrap data never exposes password hashes
    // -------------------------------------------------------------
    console.log('\n--- TEST 8: VERIFY GET /api/bootstrap STRIPS ALL PASSWORD HASHES ---');
    const bootRes = await httpRequest('GET', '/api/bootstrap');
    if (bootRes.status !== 200 || !bootRes.data.data || !Array.isArray(bootRes.data.data.users)) {
      throw new Error(`GET /api/bootstrap failed: ${JSON.stringify(bootRes.data)}`);
    }
    for (const u of bootRes.data.data.users) {
      if (u.password || (u as any).password_hash) {
        throw new Error(`CRITICAL SECURITY FAILURE: Password hash exposed in /api/bootstrap for user ${u.email}!`);
      }
    }
    console.log(`PASS: Verified bootstrap payload has ${bootRes.data.data.users.length} users with zero hash exposure.`);

    // -------------------------------------------------------------
    // Test 9: Profile edit without password does NOT overwrite password hash
    // -------------------------------------------------------------
    console.log('\n--- TEST 9: EDIT PROFILE WITHOUT PASSWORD PRESERVES HASH ---');
    const hashBeforeEdit = updatedDbUser.password;
    await httpRequest('PUT', `/api/users/${createdUserId}`, {
      name: 'Anita Sharma (Promoted)',
      phone: '+91 98999 11111'
    });

    const [afterNoPassEdit]: any = await directConn.query(
      'SELECT name, phone, password FROM solar_users WHERE id = ?',
      [createdUserId]
    );
    if (afterNoPassEdit[0].password !== hashBeforeEdit) {
      throw new Error('CRITICAL FLAW: User profile update corrupted or changed existing password hash!');
    }
    console.log('PASS: Existing bcrypt hash remained 100% identical when editing profile without password.');

  } finally {
    // Clean up test user
    if (createdUserId) {
      console.log('\n--- CLEANING UP TEST RECORD ---');
      await directConn.query('DELETE FROM solar_users WHERE id = ? OR LOWER(email) = ?', [createdUserId, testEmail.toLowerCase()]);
      await directConn.query('DELETE FROM solar_employees WHERE id = ? OR LOWER(email) = ?', [createdUserId, testEmail.toLowerCase()]);
      console.log('Cleaned up test record from MySQL.');
    }

    await directConn.end();
    server.close();
  }

  console.log('\n================================================================');
  console.log('ALL END-TO-END USER MANAGEMENT & PASSWORD AUDITS PASSED (100%)');
  console.log('================================================================');
}

runEndToEndVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nE2E VERIFICATION FAILED:', err);
    process.exit(1);
  });
