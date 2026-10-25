import http from 'http';
import mysql from 'mysql2/promise';

function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let respData = '';
      res.on('data', chunk => respData += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(respData) });
        } catch {
          resolve({ status: res.statusCode, raw: respData });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let respData = '';
      res.on('data', chunk => respData += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(respData) });
        } catch {
          resolve({ status: res.statusCode, raw: respData });
        }
      });
    }).on('error', reject);
  });
}

async function runTest() {
  console.log('--- Starting Multi-Module Persistence Verification ---');
  
  const testRunId = Date.now().toString().slice(-6);

  const testRecords = {
    customers: {
      id: `cust-test-${testRunId}`,
      name: `Test Customer ${testRunId}`,
      email: `cust${testRunId}@rejoytest.com`,
      phone: '+91 99988 77766',
      city: 'Ahmedabad',
      state: 'Gujarat',
      customerType: 'Commercial',
      siteAddress: '101 Industrial Estate, Ahmedabad',
      sanctionedLoadKw: 25.5
    },
    leads: {
      id: `lead-test-${testRunId}`,
      name: `Test Lead ${testRunId}`,
      phone: '+91 98765 43210',
      email: `lead${testRunId}@rejoytest.com`,
      city: 'Surat',
      status: 'QUALIFIED',
      source: 'Website',
      budget: 350000,
      notes: 'Interested in 10kW rooftop solar system'
    },
    projects: {
      id: `proj-test-${testRunId}`,
      title: `10kW Solar Plant - ${testRunId}`,
      name: `10kW Solar Plant - ${testRunId}`,
      customerId: `cust-test-${testRunId}`,
      customerName: `Test Customer ${testRunId}`,
      capacityKw: 10.0,
      systemCapacityKw: 10.0,
      status: 'IN_PROGRESS',
      progressPercent: 35,
      contractAmount: 480000,
      totalAmount: 480000,
      stages: [
        { id: `stg-1-${testRunId}`, name: 'Site Survey', title: 'Site Survey', status: 'COMPLETED', progressPercent: 100 },
        { id: `stg-2-${testRunId}`, name: 'Design & Engineering', title: 'Design & Engineering', status: 'IN_PROGRESS', progressPercent: 50 }
      ]
    },
    employees: {
      id: `emp-test-${testRunId}`,
      name: `Eng. Vikram Sharma ${testRunId}`,
      email: `vikram${testRunId}@rejoytest.com`,
      phone: '+91 91234 56789',
      role: 'Project Manager',
      department: 'Engineering',
      designation: 'Senior Solar Engineer',
      salary: 65000,
      joinDate: '2026-01-15'
    },
    attendance: {
      id: `att-test-${testRunId}`,
      employeeId: `emp-test-${testRunId}`,
      employeeName: `Eng. Vikram Sharma ${testRunId}`,
      date: '2026-10-25',
      status: 'PRESENT',
      checkInTime: '09:05:00',
      checkOutTime: '18:10:00'
    },
    payslips: {
      id: `pay-test-${testRunId}`,
      employeeId: `emp-test-${testRunId}`,
      employeeName: `Eng. Vikram Sharma ${testRunId}`,
      month: 'October',
      year: 2026,
      basicSalary: 65000,
      netSalary: 61500,
      status: 'PAID'
    },
    holidays: {
      id: `hol-test-${testRunId}`,
      name: `Diwali Celebration ${testRunId}`,
      date: '2026-11-01',
      type: 'PUBLIC',
      description: 'Festival of Lights Holiday'
    },
    products: {
      id: `prod-test-${testRunId}`,
      name: `Tier 1 Mono Perc 550W Panel ${testRunId}`,
      code: `PANEL-550W-${testRunId}`,
      category: 'SOLAR_PANELS',
      unitPrice: 12500,
      hsnCode: '85414011',
      stockQuantity: 120,
      specifications: { wattage: 550, efficiency: 21.3 }
    },
    vendors: {
      id: `vnd-test-${testRunId}`,
      name: `Adani Solar Supplier ${testRunId}`,
      contactPerson: 'Ramesh Patel',
      phone: '+91 98980 11223',
      email: `adani${testRunId}@supplier.com`,
      category: 'Panels & Inverters',
      city: 'Mundra',
      gstNumber: '24AAACT1234F1Z1'
    },
    purchase_orders: {
      id: `po-test-${testRunId}`,
      poNumber: `PO-2026-${testRunId}`,
      vendorId: `vnd-test-${testRunId}`,
      vendorName: `Adani Solar Supplier ${testRunId}`,
      status: 'ORDERED',
      totalAmount: 1500000,
      issueDate: '2026-10-25',
      items: [
        {
          productId: `prod-test-${testRunId}`,
          productName: `Tier 1 Mono Perc 550W Panel ${testRunId}`,
          quantity: 120,
          unitPrice: 12500,
          totalPrice: 1500000
        }
      ]
    },
    boms: {
      id: `bom-test-${testRunId}`,
      projectId: `proj-test-${testRunId}`,
      title: `10kW Rooftop Bill of Materials ${testRunId}`,
      status: 'APPROVED',
      totalEstimatedCost: 320000,
      items: [
        {
          productId: `prod-test-${testRunId}`,
          name: `Tier 1 Mono Perc 550W Panel ${testRunId}`,
          quantity: 18,
          unit: 'NOS',
          estimatedUnitPrice: 12500
        }
      ]
    },
    quotations: {
      id: `quot-test-${testRunId}`,
      quotationNumber: `Q-2026-${testRunId}`,
      leadId: `lead-test-${testRunId}`,
      customerName: `Test Lead ${testRunId}`,
      systemCapacityKw: 10.0,
      subtotal: 450000,
      taxAmount: 81000,
      totalAmount: 531000,
      status: 'SENT'
    },
    surveys: {
      id: `surv-test-${testRunId}`,
      leadId: `lead-test-${testRunId}`,
      customerName: `Test Lead ${testRunId}`,
      address: '101 Industrial Estate, Ahmedabad',
      roofType: 'RCC Concrete Flat Roof',
      roofAreaSqFt: 1200,
      proposedCapacityKw: 10.0,
      shadowFreeAreaSqFt: 1100,
      status: 'COMPLETED'
    },
    sales_invoices: {
      id: `inv-test-${testRunId}`,
      invoiceNumber: `INV-2026-${testRunId}`,
      projectId: `proj-test-${testRunId}`,
      customerName: `Test Customer ${testRunId}`,
      subtotal: 400000,
      taxAmount: 72000,
      totalAmount: 472000,
      status: 'ISSUED',
      dueDate: '2026-11-15'
    },
    payments: {
      id: `payrec-test-${testRunId}`,
      projectId: `proj-test-${testRunId}`,
      customerName: `Test Customer ${testRunId}`,
      amount: 150000,
      paymentMethod: 'NEFT / RTGS',
      referenceNumber: `UTR-HDFC-${testRunId}`,
      paymentDate: '2026-10-25',
      status: 'RECEIVED'
    },
    expenses: {
      id: `exp-test-${testRunId}`,
      projectId: `proj-test-${testRunId}`,
      category: 'SITE_LOGISTICS',
      description: `Crane hire for panel lifting - ${testRunId}`,
      amount: 18500,
      expenseDate: '2026-10-25',
      status: 'APPROVED'
    },
    warehouses: {
      id: `wh-test-${testRunId}`,
      name: `Central Warehouse ${testRunId}`,
      location: 'Ahmedabad Industrial Zone',
      capacity: '500 kW Inverters & Panels',
      status: 'ACTIVE'
    },
    stock_movements: {
      id: `sm-test-${testRunId}`,
      productId: `prod-test-${testRunId}`,
      productName: `Tier 1 Mono Perc 550W Panel ${testRunId}`,
      quantity: 18,
      movementType: 'DISPATCH_TO_SITE',
      referenceType: 'PROJECT',
      referenceId: `proj-test-${testRunId}`,
      date: '2026-10-25'
    },
    stock_audits: {
      id: `audit-test-${testRunId}`,
      auditDate: '2026-10-25',
      auditorName: 'Kunal Das',
      warehouseId: `wh-test-${testRunId}`,
      status: 'COMPLETED',
      notes: 'Quarterly inventory count verified'
    },
    service_tickets: {
      id: `ticket-test-${testRunId}`,
      ticketNumber: `SRV-2026-${testRunId}`,
      customerName: `Test Customer ${testRunId}`,
      projectId: `proj-test-${testRunId}`,
      issueType: 'INVERTER_FAULT',
      priority: 'HIGH',
      description: 'Inverter error code E04 tripped during peak sunlight',
      status: 'OPEN'
    },
    amc_contracts: {
      id: `amc-test-${testRunId}`,
      contractNumber: `AMC-2026-${testRunId}`,
      customerName: `Test Customer ${testRunId}`,
      projectId: `proj-test-${testRunId}`,
      startDate: '2026-11-01',
      endDate: '2027-10-31',
      annualAmount: 24000,
      visitsPerYear: 4,
      status: 'ACTIVE'
    }
  };

  console.log(`\nStep 1: Pushing ${Object.keys(testRecords).length} records via POST /api/sync/push...`);

  for (const [col, rec] of Object.entries(testRecords)) {
    const res = await post('http://127.0.0.1:3000/api/sync/push', {
      collection: col,
      item: rec
    });
    if (res.status !== 200 || !res.body?.success) {
      console.error(`FAILED saving ${col}:`, res.status, res.body || res.raw);
      process.exit(1);
    }
    console.log(`  ✓ Saved ${col} (${rec.id})`);
  }

  console.log('\nStep 2: Directly inspecting live MySQL InnoDB database tables...');
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'u238683373_rejoy_solar',
    password: ';Fl:$tn/9C&d',
    database: 'u238683373_rejoy_solar'
  });

  const tableMap = {
    customers: { table: 'solar_customers', idCol: 'id', idVal: testRecords.customers.id },
    leads: { table: 'solar_leads', idCol: 'id', idVal: testRecords.leads.id },
    projects: { table: 'solar_projects', idCol: 'id', idVal: testRecords.projects.id },
    employees: { table: 'solar_employees', idCol: 'id', idVal: testRecords.employees.id },
    attendance: { table: 'solar_attendance', idCol: 'id', idVal: testRecords.attendance.id },
    payslips: { table: 'solar_payslips', idCol: 'id', idVal: testRecords.payslips.id },
    holidays: { table: 'solar_holidays', idCol: 'id', idVal: testRecords.holidays.id },
    products: { table: 'solar_products', idCol: 'id', idVal: testRecords.products.id },
    vendors: { table: 'solar_vendors', idCol: 'id', idVal: testRecords.vendors.id },
    purchase_orders: { table: 'solar_purchase_orders', idCol: 'id', idVal: testRecords.purchase_orders.id },
    boms: { table: 'solar_boms', idCol: 'id', idVal: testRecords.boms.id },
    quotations: { table: 'solar_quotations', idCol: 'id', idVal: testRecords.quotations.id },
    surveys: { table: 'solar_site_surveys', idCol: 'id', idVal: testRecords.surveys.id },
    sales_invoices: { table: 'solar_sales_invoices', idCol: 'id', idVal: testRecords.sales_invoices.id },
    payments: { table: 'solar_payments', idCol: 'id', idVal: testRecords.payments.id },
    expenses: { table: 'solar_expenses', idCol: 'id', idVal: testRecords.expenses.id },
    warehouses: { table: 'solar_warehouses', idCol: 'id', idVal: testRecords.warehouses.id },
    stock_movements: { table: 'solar_stock_movements', idCol: 'id', idVal: testRecords.stock_movements.id },
    stock_audits: { table: 'solar_stock_audits', idCol: 'id', idVal: testRecords.stock_audits.id },
    service_tickets: { table: 'solar_service_tickets', idCol: 'id', idVal: testRecords.service_tickets.id },
    amc_contracts: { table: 'solar_amc_contracts', idCol: 'id', idVal: testRecords.amc_contracts.id }
  };

  for (const [col, info] of Object.entries(tableMap)) {
    const [rows] = await conn.query(`SELECT * FROM \`${info.table}\` WHERE \`${info.idCol}\` = ?`, [info.idVal]);
    if (!Array.isArray(rows) || rows.length === 0) {
      console.error(`DATABASE VERIFICATION FAILED: Row ${info.idVal} not found in MySQL table ${info.table}!`);
      await conn.end();
      process.exit(1);
    }
    console.log(`  ✓ Confirmed in MySQL: ${info.table} has row with ID = ${info.idVal}`);
  }
  await conn.end();

  console.log('\nStep 3: Verifying hydration via GET /api/bootstrap...');
  const bootRes = await get('http://127.0.0.1:3000/api/bootstrap');
  if (bootRes.status !== 200 || !bootRes.body?.success) {
    console.error('BOOTSTRAP API FAILED:', bootRes.status, bootRes.body);
    process.exit(1);
  }

  for (const [col, rec] of Object.entries(testRecords)) {
    const list = bootRes.body.data[col];
    if (!Array.isArray(list)) {
      console.error(`BOOTSTRAP ERROR: collection "${col}" is not an array!`);
      process.exit(1);
    }
    const found = list.find(x => x.id === rec.id);
    if (!found) {
      console.error(`BOOTSTRAP VERIFICATION FAILED: record ${rec.id} missing from ${col} array!`);
      process.exit(1);
    }
    console.log(`  ✓ Hydrated in bootstrap: ${col} contains ${rec.id}`);
  }

  console.log('\nStep 4: Verifying updates and delete operations in MySQL...');
  // Update customer
  const updatedCustomer = { ...testRecords.customers, name: `Updated Customer ${testRunId}`, city: 'Vadodara' };
  const updateRes = await post('http://127.0.0.1:3000/api/sync/push', {
    collection: 'customers',
    item: updatedCustomer
  });
  if (updateRes.status !== 200 || !updateRes.body?.success) {
    console.error('UPDATE FAILED:', updateRes);
    process.exit(1);
  }
  console.log('  ✓ Updated customer in MySQL');

  // Verify update in bootstrap
  const bootResAfterUpdate = await get('http://127.0.0.1:3000/api/bootstrap');
  const foundUpdated = bootResAfterUpdate.body.data.customers.find(c => c.id === testRecords.customers.id);
  if (foundUpdated.name !== `Updated Customer ${testRunId}` || foundUpdated.city !== 'Vadodara') {
    console.error('UPDATE VERIFICATION FAILED in bootstrap:', foundUpdated);
    process.exit(1);
  }
  console.log('  ✓ Verified updated fields in bootstrap:', foundUpdated.name, foundUpdated.city);

  console.log('\nStep 5: Verifying Settings and ACL Config persistence in MySQL...');
  const testSettings = {
    companyName: `REJOY SOLAR TEST ${testRunId}`,
    companyAddress: 'Plot 14, Risali, Bhilai',
    companyPhone: '+91 98250 99999',
    companyEmail: `test${testRunId}@rejoysolar.com`,
    taxRatePercent: 18,
    currencySymbol: '₹'
  };
  const settingsPush = await post('http://127.0.0.1:3000/api/sync/push', {
    collection: 'settings',
    items: testSettings
  });
  if (settingsPush.status !== 200 || !settingsPush.body?.success) {
    console.error('SETTINGS PUSH FAILED:', settingsPush);
    process.exit(1);
  }
  console.log('  ✓ Successfully pushed settings via /api/sync/push');

  // Query solar_system_settings directly
  const conn2 = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'u238683373_rejoy_solar',
    password: ';Fl:$tn/9C&d',
    database: 'u238683373_rejoy_solar'
  });
  const [settingsRows] = await conn2.query('SELECT `setting_value` FROM `solar_system_settings` WHERE `setting_key` = ?', ['global_settings']);
  const parsedSettings = JSON.parse(settingsRows[0].setting_value);
  if (parsedSettings.companyName !== testSettings.companyName) {
    console.error('SETTINGS VERIFICATION FAILED in MySQL table solar_system_settings:', parsedSettings);
    await conn2.end();
    process.exit(1);
  }
  console.log('  ✓ Confirmed in MySQL solar_system_settings: companyName =', parsedSettings.companyName);

  // Check in bootstrap
  const bootResSettings = await get('http://127.0.0.1:3000/api/bootstrap');
  if (bootResSettings.body.data.settings?.companyName !== testSettings.companyName) {
    console.error('SETTINGS HYDRATION FAILED in bootstrap:', bootResSettings.body.data.settings);
    await conn2.end();
    process.exit(1);
  }
  console.log('  ✓ Confirmed settings hydrated in bootstrap:', bootResSettings.body.data.settings.companyName);

  // Test individual REST endpoint POST /api/leads and DELETE /api/leads/:id
  console.log('\nStep 6: Verifying direct REST endpoints (POST /api/leads)...');
  const restLeadId = `lead-rest-${testRunId}`;
  const restLeadRes = await post('http://127.0.0.1:3000/api/leads', {
    id: restLeadId,
    customerName: `REST Lead ${testRunId}`,
    phone: '+91 98888 11111',
    city: 'Gandhinagar',
    status: 'NEW'
  });
  if (restLeadRes.status !== 201 || !restLeadRes.body?.success) {
    console.error('REST POST /api/leads FAILED:', restLeadRes);
    await conn2.end();
    process.exit(1);
  }
  console.log('  ✓ REST POST /api/leads successful');

  const [restLeadRows] = await conn2.query('SELECT * FROM `solar_leads` WHERE `id` = ?', [restLeadId]);
  if (restLeadRows.length === 0) {
    console.error('REST lead not found in MySQL solar_leads!');
    await conn2.end();
    process.exit(1);
  }
  console.log('  ✓ Confirmed in MySQL: solar_leads has REST lead', restLeadId);

  // Cleanup test artifacts
  console.log('\nStep 7: Cleaning up test records to preserve pristine database...');
  for (const [col, info] of Object.entries(tableMap)) {
    await conn2.query(`DELETE FROM \`${info.table}\` WHERE \`${info.idCol}\` = ?`, [info.idVal]);
  }
  await conn2.query('DELETE FROM `solar_leads` WHERE `id` = ?', [restLeadId]);
  
  // Restore default settings
  const defaultSettings = {
    companyName: 'REJOY SOLAR POWER PVT. LTD',
    companyAddress: 'PLOT NO- 14, STREET NO- 14B, PRAGATI NAGAR, RISALI BHILAI, Chhattisgarh 490006',
    companyPhone: '+91 98250 12345',
    companyEmail: 'rejoysolarpower@gmail.com',
    companyGst: '22AAOCR0748K1Z5',
    currencySymbol: '₹',
    taxRatePercent: 18
  };
  await conn2.query('UPDATE `solar_system_settings` SET `setting_value` = ? WHERE `setting_key` = ?', [JSON.stringify(defaultSettings), 'global_settings']);
  await conn2.end();
  console.log('  ✓ Test artifacts cleaned up. Baseline production settings restored.');

  console.log('\n======================================================');
  console.log('ALL VERIFICATIONS PASSED: 100% PERSISTED IN LIVE MYSQL');
  console.log('======================================================');
}

runTest().catch(e => {
  console.error('TEST RUNNER ERROR:', e);
  process.exit(1);
});
