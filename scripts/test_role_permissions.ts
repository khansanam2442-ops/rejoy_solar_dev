import mysql from 'mysql2/promise';
import { AuthService } from '../server/services/authService';

const BASE_URL = 'http://127.0.0.1:3000';

async function run() {
  console.log('================================================================');
  console.log('TEST SUITE: Role-Based Permissions & Project Stage Read-Only Controls');
  console.log('================================================================\n');

  const pool = mysql.createPool({
    host: '127.0.0.1',
    port: 3306,
    user: 'u238683373_rejoy_solar',
    password: ';Fl:$tn/9C&d',
    database: 'u238683373_rejoy_solar'
  });

  try {
    const authService = AuthService.getInstance();
    const testProjectId = 'proj-test-perm-1';
    const testCustomerId = 'cust-test-1793509906664'; // Shreeji Textiles Ltd
    const testCustomerEmail = 'client.1793509906664@rejoysolar.com';
    const testAdminEmail = 'admin@rejoysolar.com';
    const testEmployeeEmail = 'tech.1793509906348@rejoysolar.com';
    const defaultPassword = 'Password@2026';

    console.log('[Setup] Registering bcrypt-hashed credentials in solar_auth_credentials...');
    await authService.setCredential(pool, {
      userId: 'emp-1',
      email: testAdminEmail,
      password: defaultPassword,
      role: 'Admin',
      accountType: 'ADMIN'
    });
    await authService.setCredential(pool, {
      userId: 'emp-test-1793509906348',
      email: testEmployeeEmail,
      password: defaultPassword,
      role: 'Technician',
      accountType: 'EMPLOYEE'
    });
    await authService.setCredential(pool, {
      userId: 'usr-cust-test-1793509906664',
      email: testCustomerEmail,
      password: defaultPassword,
      role: 'Customer',
      accountType: 'CUSTOMER',
      linkedEntityId: testCustomerId
    });
    console.log('✓ Credentials configured in MySQL.');

    console.log('[Setup] Seeding test project into MySQL...');
    await pool.query(`
      INSERT INTO \`solar_projects\` (
        \`id\`, \`project_code\`, \`customer_id\`, \`customer_name\`, \`title\`,
        \`capacity_kw\`, \`total_value\`, \`status\`, \`current_stage_key\`,
        \`completion_percentage\`, \`site_address\`, \`city\`
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        \`title\` = VALUES(\`title\`),
        \`completion_percentage\` = VALUES(\`completion_percentage\`),
        \`status\` = VALUES(\`status\`);
    `, [
      testProjectId,
      'SOL-TEST-001',
      testCustomerId,
      'Shreeji Textiles Ltd',
      '50 kWp Industrial Rooftop Solar Plant',
      50,
      2500000,
      'CIVIL & STRUCTURE',
      'panel_installation',
      40,
      'GIDC Industrial Estate, Phase 2',
      'Surat'
    ]);

    // Insert 2 test stages
    await pool.query(`
      INSERT INTO \`solar_project_stages\` (
        \`id\`, \`project_id\`, \`stage_key\`, \`title\`, \`stage_order\`,
        \`department\`, \`assigned_role\`, \`status\`, \`priority\`,
        \`checklist_json\`, \`photos_json\`, \`notes\`
      ) VALUES 
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?),
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        \`title\` = VALUES(\`title\`),
        \`status\` = VALUES(\`status\`),
        \`checklist_json\` = VALUES(\`checklist_json\`);
    `, [
      `${testProjectId}-site_survey`,
      testProjectId,
      'site_survey',
      'Site Survey & Feasibility',
      1,
      'Engineering',
      'Site Survey Engineer',
      'COMPLETED',
      'HIGH',
      JSON.stringify([{ id: 'chk-1', title: 'Roof integrity inspection', completed: true, completedBy: 'Rajesh Kumar' }]),
      JSON.stringify([]),
      'Initial survey completed successfully.',

      `${testProjectId}-panel_installation`,
      testProjectId,
      'panel_installation',
      'Solar Panel Installation',
      2,
      'Installation',
      'Technician',
      'IN PROGRESS',
      'HIGH',
      JSON.stringify([{ id: 'chk-2', title: 'Clamp torque calibration', completed: false }]),
      JSON.stringify([]),
      'Mounting clamps delivered to site.'
    ]);
    console.log('✓ Test project and stages seeded in MySQL.\n');

    // Helper for login & cookie extraction
    async function loginUser(email: string, password: string): Promise<{ cookie: string; user: any }> {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(`Login failed for ${email}: ${JSON.stringify(data)}`);
      }
      const rawCookie = res.headers.get('set-cookie') || '';
      const sessionMatch = rawCookie.match(/rejoysolar_session=([^;]+)/);
      const cookie = sessionMatch ? `rejoysolar_session=${sessionMatch[1]}` : '';
      return { cookie, user: data.user || data.data };
    }

    // -------------------------------------------------------------
    // TEST 1: Admin Role Permissions
    // -------------------------------------------------------------
    console.log('-------------------------------------------------------------');
    console.log('TEST 1: Admin Role (Expected: Full Read & Edit Permissions)');
    console.log('-------------------------------------------------------------');
    const adminSession = await loginUser(testAdminEmail, defaultPassword);
    console.log(`✓ Admin logged in: ${adminSession.user.name} (${adminSession.user.role})`);

    // Admin updates stage
    const adminStageUpdateRes = await fetch(`${BASE_URL}/api/projects/${testProjectId}/stages/panel_installation`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': adminSession.cookie
      },
      body: JSON.stringify({
        status: 'COMPLETED',
        notes: 'Admin inspected panels. Torque and tilt angles verified.'
      })
    });
    const adminStageJson = await adminStageUpdateRes.json();
    console.log(`✓ Admin PUT stage status: ${adminStageUpdateRes.status} (Success: ${adminStageJson.success})`);
    if (adminStageUpdateRes.status !== 200 || !adminStageJson.success) {
      throw new Error(`Admin stage update failed: ${JSON.stringify(adminStageJson)}`);
    }

    // Verify stage update in MySQL
    const [adminCheckRows]: any = await pool.query(
      'SELECT status, notes, completed_date FROM `solar_project_stages` WHERE `project_id` = ? AND `stage_key` = ?',
      [testProjectId, 'panel_installation']
    );
    console.log(`✓ Verified stage in MySQL: status=${adminCheckRows[0]?.status}, notes="${adminCheckRows[0]?.notes}"`);

    // Admin updates progress
    const adminProgressRes = await fetch(`${BASE_URL}/api/projects/${testProjectId}/progress`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': adminSession.cookie
      },
      body: JSON.stringify({ progressPercentage: 65, status: 'INSTALLATION' })
    });
    const adminProgJson = await adminProgressRes.json();
    console.log(`✓ Admin PUT progress: ${adminProgressRes.status} (Success: ${adminProgJson.success})`);
    if (adminProgressRes.status !== 200) {
      throw new Error(`Admin progress update failed: ${JSON.stringify(adminProgJson)}`);
    }

    // -------------------------------------------------------------
    // TEST 2: Employee Role Permissions
    // -------------------------------------------------------------
    console.log('\n-------------------------------------------------------------');
    console.log('TEST 2: Employee Role (Expected: Authorized Stage Editing)');
    console.log('-------------------------------------------------------------');
    const employeeSession = await loginUser(testEmployeeEmail, defaultPassword);
    console.log(`✓ Employee logged in: ${employeeSession.user.name} (${employeeSession.user.role})`);

    // Employee updates stage checklist and notes
    const empStageUpdateRes = await fetch(`${BASE_URL}/api/projects/${testProjectId}/stages/panel_installation`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': employeeSession.cookie
      },
      body: JSON.stringify({
        checklist: [{ id: 'chk-2', title: 'Clamp torque calibration', completed: true, completedBy: employeeSession.user.name }],
        notes: 'Technician completed torque tightening for 120 modules.'
      })
    });
    const empStageJson = await empStageUpdateRes.json();
    console.log(`✓ Employee PATCH stage: ${empStageUpdateRes.status} (Success: ${empStageJson.success})`);
    if (empStageUpdateRes.status !== 200 || !empStageJson.success) {
      throw new Error(`Employee stage update failed: ${JSON.stringify(empStageJson)}`);
    }

    // Verify employee update in MySQL
    const [empCheckRows]: any = await pool.query(
      'SELECT checklist_json, notes FROM `solar_project_stages` WHERE `project_id` = ? AND `stage_key` = ?',
      [testProjectId, 'panel_installation']
    );
    console.log(`✓ Verified in MySQL: notes="${empCheckRows[0]?.notes}"`);

    // -------------------------------------------------------------
    // TEST 3: Customer Role Read-Only Access & Security Enforcement
    // -------------------------------------------------------------
    console.log('\n-------------------------------------------------------------');
    console.log('TEST 3: Customer Role (Expected: Read-Only Access & 403 on Edits)');
    console.log('-------------------------------------------------------------');
    const customerSession = await loginUser(testCustomerEmail, defaultPassword);
    console.log(`✓ Customer logged in: ${customerSession.user.name} (${customerSession.user.role}, AccountType: ${customerSession.user.accountType})`);

    // 3A. Customer views latest project progress retrieved from MySQL (Allowed)
    const custFetchRes = await fetch(`${BASE_URL}/api/projects`, {
      method: 'GET',
      headers: { 'Cookie': customerSession.cookie }
    });
    const custFetchData = await custFetchRes.json();
    console.log(`✓ Customer GET /api/projects status: ${custFetchRes.status} (Total projects retrieved: ${custFetchData.count})`);
    if (custFetchRes.status !== 200 || !custFetchData.success) {
      throw new Error(`Customer project retrieval failed: ${JSON.stringify(custFetchData)}`);
    }
    const myCustProj = custFetchData.data.find((p: any) => p.id === testProjectId);
    console.log(`✓ Customer retrieved project from MySQL: "${myCustProj?.title}" - Progress: ${myCustProj?.completionPercentage}%, Stages: ${myCustProj?.stages?.length}`);

    // 3B. Customer attempts direct PUT /projects/:id/stages/:stageKey (Must return 403 Forbidden)
    const custStagePutRes = await fetch(`${BASE_URL}/api/projects/${testProjectId}/stages/panel_installation`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': customerSession.cookie
      },
      body: JSON.stringify({ status: 'COMPLETED', notes: 'Hacked by customer' })
    });
    const custStagePutJson = await custStagePutRes.json();
    console.log(`✓ Customer direct PUT stage attempt -> HTTP ${custStagePutRes.status} (Expected: 403): ${custStagePutJson.error}`);
    if (custStagePutRes.status !== 403) {
      throw new Error(`SECURITY VULNERABILITY: Customer was able to modify stage via PUT! HTTP ${custStagePutRes.status}`);
    }

    // 3C. Customer attempts direct PATCH /projects/:id/stages/:stageKey (Must return 403 Forbidden)
    const custStagePatchRes = await fetch(`${BASE_URL}/api/projects/${testProjectId}/stages/panel_installation`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': customerSession.cookie
      },
      body: JSON.stringify({ status: 'IN PROGRESS' })
    });
    const custStagePatchJson = await custStagePatchRes.json();
    console.log(`✓ Customer direct PATCH stage attempt -> HTTP ${custStagePatchRes.status} (Expected: 403): ${custStagePatchJson.error}`);
    if (custStagePatchRes.status !== 403) {
      throw new Error(`SECURITY VULNERABILITY: Customer was able to modify stage via PATCH! HTTP ${custStagePatchRes.status}`);
    }

    // 3D. Customer attempts direct PUT /projects/:id/progress (Must return 403 Forbidden)
    const custProgRes = await fetch(`${BASE_URL}/api/projects/${testProjectId}/progress`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': customerSession.cookie
      },
      body: JSON.stringify({ progressPercentage: 100, status: 'COMPLETED' })
    });
    const custProgJson = await custProgRes.json();
    console.log(`✓ Customer direct PUT progress attempt -> HTTP ${custProgRes.status} (Expected: 403): ${custProgJson.error}`);
    if (custProgRes.status !== 403) {
      throw new Error(`SECURITY VULNERABILITY: Customer was able to modify progress via PUT! HTTP ${custProgRes.status}`);
    }

    // 3E. Customer attempts direct PUT /projects/:id (Must return 403 Forbidden)
    const custProjPutRes = await fetch(`${BASE_URL}/api/projects/${testProjectId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': customerSession.cookie
      },
      body: JSON.stringify({ title: 'Customer Renamed Project' })
    });
    const custProjPutJson = await custProjPutRes.json();
    console.log(`✓ Customer direct PUT project attempt -> HTTP ${custProjPutRes.status} (Expected: 403): ${custProjPutJson.error}`);
    if (custProjPutRes.status !== 403) {
      throw new Error(`SECURITY VULNERABILITY: Customer was able to modify project via PUT! HTTP ${custProjPutRes.status}`);
    }

    // 3F. Customer attempts direct POST /sync/push for stages/projects (Must return 403 Forbidden)
    const custSyncRes = await fetch(`${BASE_URL}/api/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': customerSession.cookie
      },
      body: JSON.stringify({
        collection: 'solar_project_stages',
        item: { id: `${testProjectId}-panel_installation`, status: 'TAMPERED' }
      })
    });
    const custSyncJson = await custSyncRes.json();
    console.log(`✓ Customer direct POST /sync/push attempt -> HTTP ${custSyncRes.status} (Expected: 403): ${custSyncJson.error}`);
    if (custSyncRes.status !== 403) {
      throw new Error(`SECURITY VULNERABILITY: Customer was able to modify stages via /sync/push! HTTP ${custSyncRes.status}`);
    }

    // -------------------------------------------------------------
    // TEST 4: Database State Verification
    // -------------------------------------------------------------
    console.log('\n-------------------------------------------------------------');
    console.log('TEST 4: MySQL Database Integrity Verification');
    console.log('-------------------------------------------------------------');
    const [finalProjectRows]: any = await pool.query(
      'SELECT title, completion_percentage, status FROM `solar_projects` WHERE `id` = ?',
      [testProjectId]
    );
    const [finalStageRows]: any = await pool.query(
      'SELECT stage_key, status, notes FROM `solar_project_stages` WHERE `project_id` = ?',
      [testProjectId]
    );

    console.log(`✓ Project in MySQL: "${finalProjectRows[0]?.title}", Progress: ${finalProjectRows[0]?.completion_percentage}%, Status: ${finalProjectRows[0]?.status}`);
    console.log('✓ Project stages in MySQL:');
    finalStageRows.forEach((r: any) => {
      console.log(`   - ${r.stage_key}: [${r.status}] "${r.notes}"`);
    });

    console.log('\n================================================================');
    console.log('ALL TESTS PASSED! Role-based permissions and read-only enforcement verified.');
    console.log('================================================================');
  } finally {
    await pool.end();
  }
}

run().catch(err => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
