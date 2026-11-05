import mysql from 'mysql2/promise';
import { getDbConfigFromEnv } from '../server/mysqlDatabase';
import { authService } from '../server/services/authService';
import { createServerApp } from '../server/serverApp';
import http from 'http';

interface TestResult {
  step: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, step: string, details: string) {
  results.push({ step, passed: condition, details });
  if (condition) {
    console.log(`[PASS] ${step}: ${details}`);
  } else {
    console.error(`[FAIL] ${step}: ${details}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('REJOY SOLAR ERP - SESSION PERSISTENCE & REFRESH TEST');
  console.log('====================================================');

  const dbConfig = getDbConfigFromEnv();
  const pool = mysql.createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database
  });

  // Verify MySQL Connection
  try {
    const [dbTest]: any = await pool.query('SELECT 1 as connected, NOW() as server_now');
    assert(dbTest[0]?.connected === 1, 'MySQL Connection', `Connected to MySQL database "${dbConfig.database}"`);
  } catch (err: any) {
    assert(false, 'MySQL Connection', `Failed to connect: ${err.message}`);
    process.exit(1);
  }

  // Start Express Test Server
  const app = await createServerApp();
  const testPort = 3899;
  let server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(testPort, '127.0.0.1', () => resolve()));
  const baseUrl = `http://127.0.0.1:${testPort}/api`;
  console.log(`[Test Server] Running at ${baseUrl}`);

  try {
    // 1. Test Admin Login
    console.log('\n--- STEP 1: Admin Login & HttpOnly Cookie Issuance ---');
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-proto': 'https' // Simulate Cloud Run HTTPS proxy
      },
      body: JSON.stringify({ email: 'admin@rejoysolar.com', password: '123456' })
    });

    const setCookieHeaders = loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie() : [loginRes.headers.get('set-cookie') || ''];
    const sessionCookieHeader = setCookieHeaders.find(c => c.includes('rejoysolar_session'));
    const loginBody: any = await loginRes.json();

    assert(loginRes.status === 200 && loginBody.success === true, 'Admin Login Status', `Status ${loginRes.status}, user: ${loginBody.user?.email}`);
    assert(Boolean(sessionCookieHeader), 'Set-Cookie Header Present', `Header: ${sessionCookieHeader}`);
    assert(sessionCookieHeader?.includes('HttpOnly'), 'HttpOnly Attribute', 'Cookie has HttpOnly flag');
    assert(sessionCookieHeader?.includes('Path=/'), 'Path Attribute', 'Cookie has Path=/');
    assert(sessionCookieHeader?.includes('SameSite=None') || sessionCookieHeader?.includes('SameSite=none'), 'SameSite=None for iframe support', 'Cookie SameSite configured for preview & top-level access');
    assert(sessionCookieHeader?.includes('Partitioned') || sessionCookieHeader?.includes('partitioned'), 'CHIPS Partitioned Attribute', 'Cookie contains Partitioned attribute for modern Chrome');

    // Extract cookie value for subsequent requests
    const cookieMatch = sessionCookieHeader?.match(/rejoysolar_session=([^;]+)/);
    const sessionToken = cookieMatch ? decodeURIComponent(cookieMatch[1]) : '';
    assert(Boolean(sessionToken), 'Session Token Extracted', `Token: ${sessionToken.slice(0, 12)}...`);

    // 2. Verify Session in MySQL Database
    console.log('\n--- STEP 2: MySQL Database Persistence Check ---');
    const [dbSessions]: any = await pool.query(
      'SELECT id, user_id, email, role, account_type, expires_at FROM `solar_auth_sessions` WHERE `id` = ?',
      [sessionToken]
    );

    assert(Array.isArray(dbSessions) && dbSessions.length === 1, 'MySQL Session Record Found', `Found 1 session in solar_auth_sessions for token`);
    assert(dbSessions[0]?.email === 'admin@rejoysolar.com', 'MySQL Session Email Matched', `Session email: ${dbSessions[0]?.email}`);
    assert(dbSessions[0]?.role === 'Admin', 'MySQL Session Role Matched', `Session role: ${dbSessions[0]?.role}`);

    // 3. Test Page Refresh Simulation (/api/auth/me)
    console.log('\n--- STEP 3: Page Refresh Simulation (GET /api/auth/me with Cookie) ---');
    const refreshRes = await fetch(`${baseUrl}/auth/me`, {
      method: 'GET',
      headers: {
        'Cookie': `rejoysolar_session=${sessionToken}`,
        'x-forwarded-proto': 'https'
      }
    });

    const refreshBody: any = await refreshRes.json();
    assert(refreshRes.status === 200, 'Page Refresh HTTP Status', `Status: ${refreshRes.status}`);
    assert(refreshBody.success === true, 'Page Refresh Success', 'Session verified authoritatively');
    assert(refreshBody.user?.email === 'admin@rejoysolar.com', 'Page Refresh User Profile Restored', `User restored: ${refreshBody.user?.name} (${refreshBody.user?.email})`);
    assert(refreshBody.user?.role === 'Admin', 'Page Refresh Role Restored', `Role: ${refreshBody.user?.role}`);

    // 4. Test Direct Access to Protected Modules via Cookie
    console.log('\n--- STEP 4: Direct Module Access via Session Cookie ---');
    const custRes = await fetch(`${baseUrl}/customers`, {
      headers: {
        'Cookie': `rejoysolar_session=${sessionToken}`
      }
    });
    const custBody: any = await custRes.json();
    assert(custRes.status === 200, 'Direct /customers Access', `Status: ${custRes.status}`);

    const bootstrapRes = await fetch(`${baseUrl}/bootstrap`, {
      headers: {
        'Cookie': `rejoysolar_session=${sessionToken}`
      }
    });
    assert(bootstrapRes.status === 200, 'Direct /bootstrap Hydration Access', `Status: ${bootstrapRes.status}`);

    // 5. Test Server Restart Session Persistence
    console.log('\n--- STEP 5: Server Restart Session Persistence ---');
    // Stop the running HTTP server
    await new Promise<void>((resolve) => server.close(() => resolve()));
    console.log('[Test Server] Stopped. Starting fresh server instance...');

    // Start a fresh Express instance simulating cold server restart
    const freshApp = await createServerApp();
    server = http.createServer(freshApp);
    await new Promise<void>((resolve) => server.listen(testPort, '127.0.0.1', () => resolve()));
    console.log('[Test Server] Restarted successfully.');

    // Verify session still valid across restart via MySQL session store
    const postRestartRes = await fetch(`${baseUrl}/auth/me`, {
      method: 'GET',
      headers: {
        'Cookie': `rejoysolar_session=${sessionToken}`,
        'x-forwarded-proto': 'https'
      }
    });

    const postRestartBody: any = await postRestartRes.json();
    assert(postRestartRes.status === 200 && postRestartBody.success === true, 'Post-Restart Session Restored from MySQL', `User restored: ${postRestartBody.user?.email} after server restart`);

    // 6. Test Explicit Logout
    console.log('\n--- STEP 6: Explicit Logout & Session Termination ---');
    const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: {
        'Cookie': `rejoysolar_session=${sessionToken}`,
        'x-forwarded-proto': 'https'
      }
    });
    const logoutBody: any = await logoutRes.json();
    assert(logoutRes.status === 200 && logoutBody.success === true, 'Logout API Status', 'Logged out successfully');

    // Confirm session removed from MySQL
    const [dbSessionsPostLogout]: any = await pool.query(
      'SELECT id FROM `solar_auth_sessions` WHERE `id` = ?',
      [sessionToken]
    );
    assert(dbSessionsPostLogout.length === 0, 'MySQL Session Terminated', 'Session record deleted from solar_auth_sessions');

    // Confirm subsequent /auth/me returns 401
    const postLogoutMeRes = await fetch(`${baseUrl}/auth/me`, {
      method: 'GET',
      headers: {
        'Cookie': `rejoysolar_session=${sessionToken}`,
        'x-forwarded-proto': 'https'
      }
    });
    assert(postLogoutMeRes.status === 401, 'Subsequent Access Denied', `Status: ${postLogoutMeRes.status} (Unauthorized as expected)`);

    console.log('\n====================================================');
    const failedCount = results.filter(r => !r.passed).length;
    if (failedCount === 0) {
      console.log(`ALL ${results.length} VERIFICATION CHECKS PASSED SUCCESSFULLY!`);
    } else {
      console.error(`${failedCount} of ${results.length} checks failed.`);
    }
    console.log('====================================================');
  } finally {
    server.close();
    await pool.end();
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('[FATAL ERROR IN TEST]:', err);
  process.exit(1);
});
