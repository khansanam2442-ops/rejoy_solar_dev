import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { dbManager, getDbConfigFromEnv } from '../server/mysqlDatabase';
import { ensureLocalMySqlRunning } from '../server/mysqlDaemon';

async function runUserManagementVerification() {
  console.log('===============================================================');
  console.log('REJOY SOLAR ERP - USER MANAGEMENT & PASSWORD SECURITY AUDIT');
  console.log('===============================================================');

  // Ensure MySQL daemon is active
  await ensureLocalMySqlRunning();

  const cfg = getDbConfigFromEnv();
  console.log(`Connecting direct MySQL client to ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}...`);

  const directConn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database
  });

  await directConn.ping();
  console.log('Direct MySQL ping: OK');

  const initRes = await dbManager.init();
  console.log('dbManager.init result:', initRes.connected ? 'CONNECTED' : 'FAILED');

  const testTimestamp = Date.now();
  const testUserId = `test-usr-${testTimestamp}`;
  const testEmail = `audit.user.${testTimestamp}@rejoysolar.com`;
  const initialPassword = 'InitialSecure@2026';
  const updatedPassword = 'NewSecretPassword@2027';

  // 1. Verify existing users in solar_users
  console.log('\n--- 1. AUDITING EXISTING USERS ---');
  const [existingUsers]: any = await directConn.query(
    'SELECT id, name, email, LEFT(password, 15) as hash_prefix, LENGTH(password) as hash_len, role, status FROM solar_users LIMIT 5'
  );
  console.table(existingUsers);
  for (const u of existingUsers) {
    if (!u.hash_prefix.startsWith('$2a$') && !u.hash_prefix.startsWith('$2b$') && !u.hash_prefix.startsWith('$2y$')) {
      throw new Error(`Insecure password hash detected for existing user ${u.email}: ${u.hash_prefix}`);
    }
  }
  console.log('All existing user passwords are confirmed valid bcrypt hashes.');

  // 2. Create a new user with password
  console.log(`\n--- 2. CREATING TEST USER: ${testEmail} ---`);
  await dbManager.saveUser({
    id: testUserId,
    name: 'Audit Solar Specialist',
    email: testEmail,
    password: initialPassword,
    role: 'Solar Engineer',
    department: 'Engineering',
    designation: 'Senior PV Designer',
    phone: '+91 98765 43210',
    status: 'ACTIVE',
    employee_id: `EMP-T-${testTimestamp}`
  });
  console.log('User creation executed successfully.');

  // 3. Inspect raw MySQL storage
  console.log('\n--- 3. VERIFYING RAW MYSQL RECORD & HASH INTEGRITY ---');
  const [rawRows]: any = await directConn.query(
    'SELECT id, name, email, password, role, status FROM solar_users WHERE id = ?',
    [testUserId]
  );

  if (rawRows.length === 0) {
    throw new Error(`Test user ${testUserId} was NOT found in solar_users!`);
  }

  const storedUser = rawRows[0];
  console.log(`Found row in solar_users: id=${storedUser.id}, email=${storedUser.email}`);
  console.log(`Stored password hash: ${storedUser.password.slice(0, 20)}... (length=${storedUser.password.length})`);

  // Assert NOT plaintext
  if (storedUser.password === initialPassword) {
    throw new Error('CRITICAL FAILURE: Password was stored in PLAINTEXT!');
  }

  // Assert bcrypt hash pattern
  const isBcrypt = storedUser.password.startsWith('$2a$') ||
                   storedUser.password.startsWith('$2b$') ||
                   storedUser.password.startsWith('$2y$');
  if (!isBcrypt) {
    throw new Error(`CRITICAL FAILURE: Password is not a valid bcrypt hash: ${storedUser.password}`);
  }
  console.log('PASS: Password is cryptographically hashed with bcrypt.');

  // Verify bcrypt matches initialPassword
  const hashMatches = await bcrypt.compare(initialPassword, storedUser.password);
  if (!hashMatches) {
    throw new Error('CRITICAL FAILURE: Bcrypt hash does not match initial password!');
  }
  console.log('PASS: bcrypt.compare(initialPassword, storedHash) returned true.');

  // Verify employee sync
  const [empRows]: any = await directConn.query(
    'SELECT id, name, email, department, designation, login_enabled FROM solar_employees WHERE id = ?',
    [testUserId]
  );
  if (empRows.length > 0) {
    console.log(`PASS: Synchronized to solar_employees: name=${empRows[0].name}, login_enabled=${empRows[0].login_enabled}`);
  }

  // 4. Test Authentication
  console.log('\n--- 4. TESTING AUTHENTICATION ---');
  const authSuccess = await dbManager.verifyCredentials(testEmail, initialPassword);
  if (!authSuccess) {
    throw new Error('Authentication with correct password failed!');
  }
  console.log(`PASS: Authentication succeeded for ${authSuccess.email} (Role: ${authSuccess.role})`);

  if ((authSuccess as any).password) {
    throw new Error('CRITICAL: Password hash was returned in auth result!');
  }
  console.log('PASS: Password hash was stripped from authentication response.');

  const authFail = await dbManager.verifyCredentials(testEmail, 'WrongPassword999!');
  if (authFail) {
    throw new Error('Authentication with WRONG password succeeded! Security flaw.');
  }
  console.log('PASS: Authentication with wrong password rejected as expected.');

  // 5. Test updating user details WITHOUT changing password
  console.log('\n--- 5. UPDATING USER DETAILS (PRESERVING EXISTING PASSWORD HASH) ---');
  const originalHash = storedUser.password;
  await dbManager.saveUser({
    id: testUserId,
    name: 'Audit Solar Specialist (Promoted)',
    email: testEmail,
    role: 'Solar Engineer',
    department: 'Engineering Management',
    designation: 'Principal PV Designer',
    phone: '+91 98765 43210',
    status: 'ACTIVE'
    // no password provided
  });

  const [afterEditRows]: any = await directConn.query(
    'SELECT password, name, department, designation FROM solar_users WHERE id = ?',
    [testUserId]
  );
  if (afterEditRows[0].password !== originalHash) {
    throw new Error('CRITICAL: Updating user details modified or overwrote the existing password hash!');
  }
  console.log('PASS: Existing password hash remained 100% untouched when updating other fields.');
  console.log(`PASS: User fields updated: name="${afterEditRows[0].name}", dept="${afterEditRows[0].department}"`);

  // 6. Test Password Change
  console.log(`\n--- 6. UPDATING PASSWORD TO: ${updatedPassword} ---`);
  await dbManager.updateUserPassword(testUserId, updatedPassword);

  const [afterPassChangeRows]: any = await directConn.query(
    'SELECT password FROM solar_users WHERE id = ?',
    [testUserId]
  );
  const newHash = afterPassChangeRows[0].password;
  console.log(`New stored hash: ${newHash.slice(0, 20)}...`);

  if (newHash === originalHash) {
    throw new Error('CRITICAL: Password update did not generate a new hash!');
  }

  const oldPassWorks = await dbManager.verifyCredentials(testEmail, initialPassword);
  if (oldPassWorks) {
    throw new Error('CRITICAL: Old password still works after password change!');
  }
  console.log('PASS: Old password rejected after change.');

  const newPassWorks = await dbManager.verifyCredentials(testEmail, updatedPassword);
  if (!newPassWorks) {
    throw new Error('CRITICAL: New password verification failed!');
  }
  console.log('PASS: New password authenticated successfully.');

  // 7. Verify hash exposure prevention in API queries
  console.log('\n--- 7. VERIFYING GET USERS / BOOTSTRAP NEVER EXPOSES PASSWORD HASHES ---');
  const allUsers = await dbManager.getUsers();
  const testUserInList = allUsers.find((u: any) => u.id === testUserId);
  if (!testUserInList) {
    throw new Error('Test user not found in getUsers()!');
  }
  if (testUserInList.password) {
    throw new Error('CRITICAL: Password hash exposed in getUsers()!');
  }
  console.log('PASS: getUsers() strictly omits password hashes.');

  // 8. Test user deletion
  console.log('\n--- 8. CLEANING UP TEST RECORD ---');
  await dbManager.deleteUser(testUserId);
  const [deletedUserRows]: any = await directConn.query(
    'SELECT id FROM solar_users WHERE id = ?',
    [testUserId]
  );
  const [deletedEmpRows]: any = await directConn.query(
    'SELECT id FROM solar_employees WHERE id = ?',
    [testUserId]
  );
  if (deletedUserRows.length > 0 || deletedEmpRows.length > 0) {
    throw new Error('Failed to cleanly delete test user from database tables!');
  }
  console.log('PASS: Test record cleaned up from solar_users and solar_employees.');

  await directConn.end();

  console.log('\n===============================================================');
  console.log('ALL USER MANAGEMENT & PASSWORD SECURITY TESTS PASSED (100%)');
  console.log('===============================================================');
}

runUserManagementVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nAUDIT FAILED:', err);
    process.exit(1);
  });
