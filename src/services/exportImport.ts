import { storageService } from './storage';
import { validateCustomer, validateEmployee } from './validation';
import { Customer, Employee, Lead } from '../types/solar';

export type ExportModule =
  | 'Leads'
  | 'Customers'
  | 'Employees'
  | 'Projects'
  | 'Payments'
  | 'Expenses'
  | 'Attendance'
  | 'Service';

export interface ImportValidationReport {
  module: ExportModule;
  totalRows: number;
  successful: number;
  failed: number;
  duplicate: number;
  skipped: number;
  validRecords: any[];
  skippedRecords: { row: number; name: string; reason: string }[];
  failedRecords: { row: number; reason: string }[];
  errors: string[];
}

export function exportToCSV(filename: string, headers: string[], rows: (string | number)[][]): void {
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => {
      const escaped = String(cell ?? '').replace(/"/g, '""');
      return `"${escaped}"`;
    }).join(','))
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function getSampleTemplate(module: ExportModule): { headers: string[]; sampleRow: (string | number)[] } {
  switch (module) {
    case 'Leads':
      return {
        headers: ['Customer Name', 'Company Name', 'Phone', 'Email', 'Address', 'City', 'Solar Capacity (kW)', 'Estimated Value (INR)', 'Source', 'Status'],
        sampleRow: ['Apex Plastics', 'Apex Polychem Ltd', '+91 98250 99881', 'info@apexpoly.com', 'Plot 12, GIDC', 'Ahmedabad', 100, 4800000, 'Website', 'QUALIFIED']
      };
    case 'Customers':
      return {
        headers: ['Customer Name', 'Company Name', 'Customer Type', 'Phone', 'Email', 'Site Address', 'City', 'GST Number', 'Sanctioned Load (kW)'],
        sampleRow: ['Gujarat Foundry Corp', 'Gujarat Foundry Pvt Ltd', 'Industrial', '+91 98790 12345', 'purchase@gfc.com', 'Plot 99, Odhav GIDC', 'Ahmedabad', '24AAACG1234H1Z1', 200]
      };
    case 'Employees':
      return {
        headers: ['Employee Code', 'Name', 'Department', 'Designation', 'Phone', 'Email', 'Joining Date', 'Monthly Salary'],
        sampleRow: ['EMP012', 'Kiran Patel', 'Civil', 'Civil Supervisor', '+91 98251 00223', 'kiran.patel@solarpulse.com', '2026-09-01', 45000]
      };
    case 'Payments':
      return {
        headers: ['Receipt Number', 'Customer Name', 'Milestone', 'Amount (INR)', 'Status', 'Due Date', 'Paid Date', 'Payment Mode'],
        sampleRow: ['RCPT-2026-099', 'ABC Industries Ltd.', 'Advance', 2000000, 'PAID', '2026-08-15', '2026-08-16', 'Bank NEFT/RTGS']
      };
    case 'Expenses':
      return {
        headers: ['Expense Number', 'Vendor Name', 'Category', 'Amount (INR)', 'Date', 'Payment Mode', 'Reference No', 'Notes'],
        sampleRow: ['EXP-2026-099', 'Polycab India Ltd', 'Material - Cables & BOS', 240000, '2026-09-02', 'Bank NEFT', 'REF-9921', 'DC 4 sq mm solar cable']
      };
    case 'Attendance':
      return {
        headers: ['Employee Name', 'Date', 'Check In Time', 'Status', 'Site Location'],
        sampleRow: ['Rajesh Kumar', '2026-09-07', '09:00 AM', 'PRESENT', 'Sanand GIDC Solar Site']
      };
    case 'Service':
      return {
        headers: ['Ticket ID', 'Customer Name', 'Issue', 'Category', 'Priority', 'Status'],
        sampleRow: ['SRV-2026-099', 'GreenTech Logistics Hub', 'Inverter offline code 302', 'Inverter Error / Offline', 'HIGH', 'OPEN']
      };
    case 'Projects':
      return {
        headers: ['Project Code', 'Customer Name', 'Title', 'Capacity (kW)', 'Total Value (INR)', 'Status', 'Start Date', 'Expected Completion'],
        sampleRow: ['SOL-2026-099', 'Navkar Precision', '50 kW Rooftop Solar', 50, 2400000, 'INSTALLATION', '2026-09-01', '2026-10-15']
      };
  }
}

/**
 * Robust CSV Line Parser that respects quotes, commas within quotes, and escaped quotes.
 */
export function parseCSVRows(csvText: string): string[][] {
  const result: string[][] = [];
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    const row: string[] = [];
    let insideQuotes = false;
    let cell = '';

    for (let c = 0; c < lines[i].length; c++) {
      const char = lines[i][c];
      if (char === '"') {
        if (insideQuotes && lines[i][c + 1] === '"') {
          cell += '"';
          c++; // skip escaped quote
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        row.push(cell.trim().replace(/^"|"$/g, ''));
        cell = '';
      } else {
        cell += char;
      }
    }
    row.push(cell.trim().replace(/^"|"$/g, ''));
    if (row.some(val => val.length > 0)) {
      result.push(row);
    }
  }

  return result;
}

function findColIdx(headers: string[], names: string[], fallbackIdx: number): number {
  const normalizedHeaders = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (const n of names) {
    const target = n.toLowerCase().replace(/[^a-z0-9]/g, '');
    const idx = normalizedHeaders.findIndex(h => h === target || h.includes(target));
    if (idx >= 0) return idx;
  }
  return fallbackIdx;
}

export function parseAndValidateCSV(text: string, module: ExportModule): ImportValidationReport {
  const allRows = parseCSVRows(text);
  if (allRows.length <= 1) {
    return {
      module,
      totalRows: 0,
      successful: 0,
      failed: 0,
      duplicate: 0,
      skipped: 0,
      validRecords: [],
      skippedRecords: [],
      failedRecords: [],
      errors: ['The uploaded CSV file is empty or missing data rows.']
    };
  }

  const headerRow = allRows[0];
  const dataRows = allRows.slice(1);
  const errors: string[] = [];
  const validRecords: any[] = [];
  const skippedRecords: { row: number; name: string; reason: string }[] = [];
  const failedRecords: { row: number; reason: string }[] = [];

  let successful = 0;
  let failed = 0;
  let duplicate = 0;

  // Track batch candidates to catch intra-file duplicates
  const batchCustomers: Customer[] = [...storageService.getCustomers()];
  const batchEmployees: Employee[] = [...storageService.getEmployees()];

  // Column index resolvers for flexible customer CSV columns
  const nameIdx = findColIdx(headerRow, ['customer name', 'name', 'client name', 'client'], 0);
  const companyIdx = findColIdx(headerRow, ['company name', 'company', 'enterprise', 'firm'], 1);
  const typeIdx = findColIdx(headerRow, ['customer type', 'type', 'category'], 2);
  const phoneIdx = findColIdx(headerRow, ['phone', 'mobile', 'contact', 'phone number', 'contact number'], 3);
  const emailIdx = findColIdx(headerRow, ['email', 'email address', 'mail'], 4);
  const addressIdx = findColIdx(headerRow, ['site address', 'address', 'site location', 'premises'], 5);
  const cityIdx = findColIdx(headerRow, ['city', 'district', 'town'], 6);
  const gstIdx = findColIdx(headerRow, ['gst number', 'gstin', 'gst', 'gst no'], 7);
  const loadIdx = findColIdx(headerRow, ['sanctioned load (kw)', 'sanctioned load', 'load (kw)', 'capacity (kw)', 'capacity', 'solar capacity (kw)', 'load'], 8);
  const stateIdx = findColIdx(headerRow, ['state', 'province'], -1);
  const pinIdx = findColIdx(headerRow, ['pincode', 'pin code', 'zip'], -1);
  const passIdx = findColIdx(headerRow, ['password'], -1);

  dataRows.forEach((cols, index) => {
    const rowNum = index + 2;

    if (cols.length === 0 || cols.every(c => c === '')) {
      failed++;
      failedRecords.push({ row: rowNum, reason: 'Empty row.' });
      errors.push(`Row ${rowNum}: Empty row.`);
      return;
    }

    if (module === 'Customers') {
      const name = (cols[nameIdx] ?? '').trim();
      const phone = (cols[phoneIdx] ?? '').trim();
      const email = (cols[emailIdx] ?? '').trim();
      const companyName = (cols[companyIdx] ?? '').trim();
      const rawType = (cols[typeIdx] ?? '').trim();
      const customerType = (['Industrial', 'Commercial', 'Residential', 'Agricultural'].includes(rawType)
        ? rawType
        : (companyName ? 'Commercial' : 'Residential')) as Customer['customerType'];
      const siteAddress = (cols[addressIdx] ?? '').trim();
      const city = (cols[cityIdx] ?? '').trim() || 'Ahmedabad';
      const state = (stateIdx >= 0 ? cols[stateIdx] : '') || 'Gujarat';
      const pincode = (pinIdx >= 0 ? cols[pinIdx] : '') || '380001';
      const gstNumber = (cols[gstIdx] ?? '').trim();
      const sanctionedLoadKw = Number(cols[loadIdx]) || 0;
      const rawPass = (passIdx >= 0 ? cols[passIdx] : '') || '123456';

      if (!name) {
        failed++;
        failedRecords.push({ row: rowNum, reason: 'Customer name is mandatory.' });
        errors.push(`Row ${rowNum}: Customer name is mandatory.`);
        return;
      }

      const phoneDigits = phone.replace(/\D/g, '');
      if (phoneDigits.length < 7) {
        failed++;
        failedRecords.push({ row: rowNum, reason: `Valid phone number is required (got "${phone || 'empty'}").` });
        errors.push(`Row ${rowNum}: Valid phone number is required (got "${phone || 'empty'}").`);
        return;
      }

      // Check duplicates against existing database + intra-file batch
      const dupCheck = validateCustomer({ name, companyName, phone, email, gstNumber, city }, batchCustomers);
      if (!dupCheck.valid) {
        duplicate++;
        skippedRecords.push({ row: rowNum, name, reason: dupCheck.message || 'Duplicate customer record' });
        errors.push(`Row ${rowNum} Skipped (Duplicate): ${dupCheck.message}`);
        return;
      }

      const newCust: Customer = {
        id: `batch-c-${Date.now()}-${rowNum}`,
        customerCode: `CUST-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        name,
        companyName,
        customerType,
        phone,
        email,
        password: rawPass,
        siteAddress: siteAddress || `${city}, ${state}`,
        city,
        state,
        pincode,
        gstNumber,
        sanctionedLoadKw,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      batchCustomers.push(newCust);
      validRecords.push(newCust);
      successful++;
    } else if (module === 'Leads') {
      const name = cols[0] || '';
      const companyName = cols[1] || '';
      const phone = cols[2] || '';
      const email = cols[3] || '';
      const address = cols[4] || '';
      const city = cols[5] || 'Ahmedabad';
      const capacity = Number(cols[6]) || 10;
      const estValue = Number(cols[7]) || capacity * 50000;
      const source = cols[8] || 'Website';
      const status = (cols[9] || 'NEW') as Lead['status'];

      if (!name) {
        failed++;
        failedRecords.push({ row: rowNum, reason: 'Customer name is mandatory.' });
        errors.push(`Row ${rowNum}: Customer name is mandatory.`);
        return;
      }
      if (!phone || phone.replace(/\D/g, '').length < 7) {
        failed++;
        failedRecords.push({ row: rowNum, reason: 'Valid phone number is required.' });
        errors.push(`Row ${rowNum}: Valid phone number is required.`);
        return;
      }

      const newLead: Lead = {
        id: `lead-import-${Date.now()}-${rowNum}`,
        customerName: name,
        companyName,
        phone,
        email,
        address,
        city,
        solarCapacityKw: capacity,
        estimatedValue: estValue,
        source,
        status,
        notes: 'Imported via CSV',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      validRecords.push(newLead);
      successful++;
    } else if (module === 'Employees') {
      const code = cols[0];
      const name = cols[1];
      const phone = cols[4] || '';
      const email = cols[5] || '';
      if (!code || !name) {
        failed++;
        failedRecords.push({ row: rowNum, reason: 'Employee code and name are mandatory.' });
        errors.push(`Row ${rowNum}: Employee code and name are mandatory.`);
        return;
      }
      const dupCheck = validateEmployee({ employeeCode: code, name, phone, email }, batchEmployees);
      if (!dupCheck.valid) {
        duplicate++;
        skippedRecords.push({ row: rowNum, name, reason: dupCheck.message || 'Duplicate employee' });
        errors.push(`Row ${rowNum} Duplicate Employee: ${dupCheck.message}`);
        return;
      }
      const newEmp: Employee = {
        id: `batch-e-${rowNum}`,
        employeeCode: code,
        name,
        department: (cols[2] as Employee['department']) || 'Operations',
        designation: cols[3] || 'Staff',
        phone,
        email,
        joiningDate: cols[6] || new Date().toISOString().slice(0, 10),
        salaryMonthly: Number(cols[7]) || 0,
        status: 'ACTIVE',
        photoUrl: '',
        loginEnabled: false,
        accountStatus: 'PENDING'
      };
      batchEmployees.push(newEmp);
      validRecords.push(newEmp);
      successful++;
    } else if (module === 'Payments') {
      if (!cols[0] || isNaN(Number(cols[3]))) {
        failed++;
        failedRecords.push({ row: rowNum, reason: 'Valid amount number is required.' });
        errors.push(`Row ${rowNum}: Valid amount number is required.`);
        return;
      }
      successful++;
    } else {
      successful++;
    }
  });

  return {
    module,
    totalRows: dataRows.length,
    successful,
    failed,
    duplicate,
    skipped: duplicate,
    validRecords,
    skippedRecords,
    failedRecords,
    errors
  };
}
