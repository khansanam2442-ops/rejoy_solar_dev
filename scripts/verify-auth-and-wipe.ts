import dotenv from 'dotenv';
dotenv.config();

import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { dbManager } from '../server/mysqlDatabase';

async function runAuthAndWipeTests() {
  console.log('--- STARTING AUTH & DATA MANAGEMENT VERIFICATION ---');

  // 1. Verify DB Connection using .env
  const config = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'u238683373_rejoy_solar',
    password: process.env.DB_PASS || ';Fl:$tn/9C&d',
    database: process.env.DB_NAME || 'u238683373_rejoy_solar',
  };

  const connection = await mysql.createConnection(config);
  console.log(`[PASS] Connected directly to MySQL database "${config.database}" as user "${config.user}".`);

  // Ensure DB Manager is initialized
  await dbManager.init();

  // Test 1: Check existing users & bcrypt hashing
  const [rows] = await connection.query('SELECT id, name, email, role, password FROM `solar_users`');
  const users = rows as any[];
  console.log(`Found ${users.length} user(s) in solar_users:`);
  for (const u of users) {
    const isBcrypt = typeof u.password === 'string' && (u.password.startsWith('$2a$') || u.password.startsWith('$2b$'));
    console.log(` - ${u.email} (${u.role}): password_is_bcrypt = ${isBcrypt}`);
    if (!isBcrypt) {
      throw new Error(`User ${u.email} does not have a bcrypt hashed password!`);
    }
  }
  console.log('[PASS] All existing users have valid bcrypt-hashed passwords.');

  // Test 2: Admin Registration logic
  const testEmail = `admin.test.${Date.now()}@rejoy-audit.com`;
  const testPassword = 'SecureAdminPassword#2026';

  // Attempt registration with authorized admin
  const registeredUser = await dbManager.registerAdmin(
    {
      name: 'Audit Administrator',
      email: testEmail,
      password: testPassword,
      phone: '+91 99887 76655',
      department: 'Executive Board',
      designation: 'Director of Solar EPC'
    },
    true // authorized
  );

  console.log(`[PASS] Successfully registered admin user: ${registeredUser.email} (ID: ${registeredUser.id})`);

  // Verify directly in MySQL table that password is not plaintext and matches bcrypt hash
  const [userInDbRows] = await connection.query('SELECT * FROM `solar_users` WHERE `email` = ?', [testEmail]);
  const userInDb = (userInDbRows as any[])[0];
  if (!userInDb) throw new Error('Registered user was not found in MySQL solar_users!');
  
  if (!userInDb.password.startsWith('$2a$') && !userInDb.password.startsWith('$2b$')) {
    throw new Error('Password in MySQL is NOT hashed with bcrypt!');
  }
  const passwordMatchesHash = await bcrypt.compare(testPassword, userInDb.password);
  if (!passwordMatchesHash) {
    throw new Error('bcrypt hash does not verify with the original password!');
  }
  console.log('[PASS] Verified MySQL storage: password is fully bcrypt-hashed and verifies with bcrypt.compare.');

  // Test 3: Authenticate User with correct credentials
  const authSuccess = await dbManager.authenticateUser(testEmail, testPassword);
  if (!authSuccess || authSuccess.email !== testEmail) {
    throw new Error('Authentication with correct credentials failed!');
  }
  console.log('[PASS] Authentication succeeds with registered email & password.');

  // Test 4: Authenticate User with WRONG credentials
  const authFail = await dbManager.authenticateUser(testEmail, 'WrongPassword123');
  if (authFail !== null) {
    throw new Error('Authentication should have returned null for wrong password!');
  }
  console.log('[PASS] Authentication correctly rejects invalid password.');

  // Test 5: Prevent Duplicate Email Registration
  try {
    await dbManager.registerAdmin(
      {
        name: 'Duplicate Admin',
        email: testEmail,
        password: 'AnotherPassword',
      },
      true
    );
    throw new Error('Duplicate registration should have thrown an error!');
  } catch (err: any) {
    if (err.message.includes('already exists') || err.message.includes('already registered')) {
      console.log('[PASS] Duplicate email registration was successfully rejected.');
    } else {
      throw err;
    }
  }

  // Test 6: Registration Closure / Unauthorized Registration Prevention
  const regStatus = await dbManager.getAdminRegistrationStatus();
  console.log(`Admin registration status: adminCount = ${regStatus.adminCount}, allowPublicRegistration = ${regStatus.allowPublicRegistration}`);
  if (regStatus.adminCount > 0 && regStatus.allowPublicRegistration !== false) {
    throw new Error('Public registration should be closed when admins already exist!');
  }

  try {
    await dbManager.registerAdmin(
      {
        name: 'Unauthorized Stranger',
        email: `unauthorized.${Date.now()}@stranger.com`,
        password: 'SomePassword123',
      },
      false // NOT authorized
    );
    throw new Error('Unauthorized registration should have been blocked!');
  } catch (err: any) {
    if (err.message.includes('registration is closed') || err.message.includes('Unauthorized')) {
      console.log('[PASS] Unauthorized public admin registration was strictly blocked.');
    } else {
      throw err;
    }
  }

  // Cleanup test user
  await dbManager.deleteUser(registeredUser.id);
  console.log('[PASS] Cleaned up temporary audit admin user.');

  // Test 7: Verify backup and wipe functionality
  // First, verify that wipe requires exact confirmation string
  try {
    await dbManager.backupAndWipeData('wrong_confirmation');
    throw new Error('backupAndWipeData should reject invalid confirmation!');
  } catch (err: any) {
    if (err.message.includes('CONFIRM_WIPE_ERP_DATA')) {
      console.log('[PASS] Data wipe safely rejected without exact confirmation token.');
    } else {
      throw err;
    }
  }

  console.log('--- ALL AUTH & INTEGRATION CHECKS PASSED ---');
  await connection.end();
}

runAuthAndWipeTests()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
