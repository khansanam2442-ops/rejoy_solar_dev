import { storageService } from './storage';
import {
  validateCustomer,
  validateEmployee,
  validateProject,
  validateProduct,
  validateVendor,
  validateLead,
  validatePayment,
  validateExpense,
  validateAttendance,
  validateServiceTicket
} from './validation';
import {
  Customer,
  Employee,
  Lead,
  SolarProject,
  ProjectStatus,
  ProductItem,
  Vendor,
  PaymentRecord,
  ExpenseRecord,
  AttendanceRecord,
  ServiceTicket
} from '../types/solar';
import { buildStandardWorkflowStages, WorkflowProgressLevel } from './workflowStages';

export type ExportModule =
  | 'Leads'
  | 'Customers'
  | 'Employees'
  | 'Projects'
  | 'Payments'
  | 'Expenses'
  | 'Attendance'
  | 'Service'
  | 'Products'
  | 'Vendors';

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
        headers: ['Receipt Number', 'Customer Name', 'Milestone', 'Amount (INR)', 'Status', 'Due Date', 'Paid Date', 'Payment Mode', 'Reference'],
        sampleRow: ['RCPT-2026-099', 'ABC Industries Ltd.', 'Advance', 2000000, 'PAID', '2026-08-15', '2026-08-16', 'Bank NEFT/RTGS', 'TXN-99881']
      };
    case 'Expenses':
      return {
        headers: ['Expense Number', 'Vendor Name', 'Category', 'Amount (INR)', 'Date', 'Payment Mode', 'Reference No', 'Notes'],
        sampleRow: ['EXP-2026-099', 'Polycab India Ltd', 'Material - Cables & BOS', 240000, '2026-09-02', 'Bank NEFT', 'REF-9921', 'DC 4 sq mm solar cable']
      };
    case 'Attendance':
      return {
        headers: ['Employee Name', 'Date', 'Check In Time', 'Check Out Time', 'Status', 'Site Location'],
        sampleRow: ['Rajesh Kumar', '2026-09-07', '09:00:00', '18:00:00', 'PRESENT', 'Sanand GIDC Solar Site']
      };
    case 'Service':
      return {
        headers: ['Ticket ID', 'Customer Name', 'Issue', 'Category', 'Priority', 'Status'],
        sampleRow: ['SRV-2026-099', 'GreenTech Logistics Hub', 'Inverter offline code 302', 'INVERTER', 'HIGH', 'OPEN']
      };
    case 'Projects':
      return {
        headers: ['Project Code', 'Customer Name', 'Title', 'Capacity (kW)', 'Total Value (INR)', 'Status', 'Start Date', 'Expected Completion', 'Site Address', 'City'],
        sampleRow: ['SOL-2026-099', 'Navkar Precision', '50 kW Rooftop Solar System', 50, 2400000, 'INSTALLATION', '2026-09-01', '2026-10-15', 'Plot 45, GIDC Phase II', 'Sanand']
      };
    case 'Products':
      return {
        headers: ['SKU', 'Product Name', 'Category', 'Brand', 'Model', 'Unit', 'HSN Code', 'GST Rate (%)', 'Unit Price (INR)', 'Current Stock', 'Reorder Level'],
        sampleRow: ['MOD-MONO-550', '550W Mono PERC Solar Module', 'Solar Panels', 'Waaree', 'WS-550', 'Nos', '8541', 12, 11500, 150, 20]
      };
    case 'Vendors':
      return {
        headers: ['Vendor Code', 'Vendor Name', 'Contact Person', 'Phone', 'Email', 'Address', 'City', 'State', 'GST Number', 'Payment Terms'],
        sampleRow: ['VEN-015', 'Polycab Wires Ltd', 'Suresh Sharma', '+91 98250 11445', 'sales@polycab.com', 'Plot 45, GIDC Industrial Estate', 'Vadodara', 'Gujarat', '24AABCP1234F1Z5', '30 Days Net']
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
  const batchProjects: SolarProject[] = [...storageService.getProjects()];
  const batchLeads: Lead[] = [...storageService.getLeads()];
  const batchProducts: ProductItem[] = [...storageService.getProducts()];
  const batchVendors: Vendor[] = [...storageService.getVendors()];
  const batchPayments: PaymentRecord[] = [...storageService.getPayments()];
  const batchExpenses: ExpenseRecord[] = [...storageService.getExpenses()];
  const batchAttendance: AttendanceRecord[] = [...storageService.getAttendance()];
  const batchServiceTickets: ServiceTicket[] = [...storageService.getServiceTickets()];

  // Helper for flexible date parsing
  const parseDateStr = (raw: string | undefined): string | undefined => {
    if (!raw || !raw.trim()) return undefined;
    const s = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (dmy) {
      return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
    return undefined;
  };

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

  // Column index resolvers for flexible project CSV columns
  const projCodeIdx = findColIdx(headerRow, ['project code', 'project id', 'code', 'project no', 'project number'], 0);
  const projCustIdx = findColIdx(headerRow, ['customer name', 'client name', 'customer', 'client', 'name'], 1);
  const projTitleIdx = findColIdx(headerRow, ['title', 'project title', 'project name', 'project'], 2);
  const projCapIdx = findColIdx(headerRow, ['capacity (kw)', 'capacity', 'solar capacity (kw)', 'capacity kw', 'load', 'kw', 'system size'], 3);
  const projValIdx = findColIdx(headerRow, ['total value (inr)', 'total value', 'value', 'amount', 'cost', 'project cost', 'price'], 4);
  const projStatIdx = findColIdx(headerRow, ['status', 'project status', 'stage status'], 5);
  const projStartIdx = findColIdx(headerRow, ['start date', 'start', 'commencement date', 'kickoff'], 6);
  const projExpIdx = findColIdx(headerRow, ['expected completion', 'completion date', 'expected completion date', 'due date', 'target date', 'end date'], 7);
  const projAddrIdx = findColIdx(headerRow, ['site address', 'address', 'location', 'site location', 'premises'], 8);
  const projCityIdx = findColIdx(headerRow, ['city', 'district', 'town'], 9);

  // Column resolvers for Leads
  const leadNameIdx = findColIdx(headerRow, ['customer name', 'name', 'client name', 'client', 'lead name'], 0);
  const leadCompIdx = findColIdx(headerRow, ['company name', 'company', 'organization', 'firm', 'business'], 1);
  const leadPhoneIdx = findColIdx(headerRow, ['phone', 'mobile', 'contact', 'phone number', 'contact number'], 2);
  const leadEmailIdx = findColIdx(headerRow, ['email', 'email address', 'mail'], 3);
  const leadAddrIdx = findColIdx(headerRow, ['address', 'site address', 'street', 'location'], 4);
  const leadCityIdx = findColIdx(headerRow, ['city', 'district', 'town'], 5);
  const leadCapIdx = findColIdx(headerRow, ['solar capacity (kw)', 'solar capacity', 'capacity (kw)', 'capacity kw', 'capacity', 'load', 'kw'], 6);
  const leadValIdx = findColIdx(headerRow, ['estimated value (inr)', 'estimated value', 'estimated amount', 'value', 'amount', 'budget'], 7);
  const leadSourceIdx = findColIdx(headerRow, ['source', 'lead source', 'channel'], 8);
  const leadStatIdx = findColIdx(headerRow, ['status', 'lead status', 'stage'], 9);
  const leadNotesIdx = findColIdx(headerRow, ['notes', 'remarks', 'comment'], -1);

  // Column resolvers for Employees
  const empCodeIdx = findColIdx(headerRow, ['employee code', 'emp code', 'code', 'emp id', 'employee id'], 0);
  const empNameIdx = findColIdx(headerRow, ['name', 'employee name', 'full name', 'staff name'], 1);
  const empDeptIdx = findColIdx(headerRow, ['department', 'dept'], 2);
  const empDesigIdx = findColIdx(headerRow, ['designation', 'role', 'title', 'position'], 3);
  const empPhoneIdx = findColIdx(headerRow, ['phone', 'mobile', 'contact', 'phone number', 'contact number'], 4);
  const empEmailIdx = findColIdx(headerRow, ['email', 'email address', 'mail'], 5);
  const empDateIdx = findColIdx(headerRow, ['joining date', 'date of joining', 'doj', 'start date'], 6);
  const empSalIdx = findColIdx(headerRow, ['monthly salary', 'salary', 'salary monthly', 'monthly pay', 'ctc'], 7);
  const empStatIdx = findColIdx(headerRow, ['status', 'employment status'], -1);
  const empRoleIdx = findColIdx(headerRow, ['system role', 'role', 'access role', 'app role'], -1);
  const empFieldIdx = findColIdx(headerRow, ['is field worker', 'field worker', 'field employee'], -1);

  // Column resolvers for Products
  const prodSkuIdx = findColIdx(headerRow, ['sku', 'item code', 'product code', 'part number', 'code'], 0);
  const prodNameIdx = findColIdx(headerRow, ['product name', 'name', 'item name', 'description', 'title'], 1);
  const prodCatIdx = findColIdx(headerRow, ['category', 'item category', 'type', 'product category'], 2);
  const prodBrandIdx = findColIdx(headerRow, ['brand', 'make', 'manufacturer'], 3);
  const prodModelIdx = findColIdx(headerRow, ['model', 'model number', 'model no'], 4);
  const prodUnitIdx = findColIdx(headerRow, ['unit', 'uom', 'measuring unit'], 5);
  const prodHsnIdx = findColIdx(headerRow, ['hsn code', 'hsn', 'hsn/sac', 'sac code'], 6);
  const prodGstIdx = findColIdx(headerRow, ['gst rate (%)', 'gst rate', 'gst %', 'gst', 'tax rate'], 7);
  const prodPriceIdx = findColIdx(headerRow, ['unit price (inr)', 'unit price', 'price', 'rate', 'cost', 'selling price'], 8);
  const prodStockIdx = findColIdx(headerRow, ['current stock', 'stock', 'quantity', 'qty', 'stock qty'], 9);
  const prodReorderIdx = findColIdx(headerRow, ['reorder level', 'min stock', 'minimum stock', 'reorder point', 'reorder qty'], 10);

  // Column resolvers for Vendors
  const vndCodeIdx = findColIdx(headerRow, ['vendor code', 'code', 'vendor id', 'supplier code'], 0);
  const vndNameIdx = findColIdx(headerRow, ['vendor name', 'name', 'supplier name', 'company', 'company name'], 1);
  const vndContactIdx = findColIdx(headerRow, ['contact person', 'contact name', 'person', 'representative'], 2);
  const vndPhoneIdx = findColIdx(headerRow, ['phone', 'mobile', 'contact number', 'phone number', 'contact'], 3);
  const vndEmailIdx = findColIdx(headerRow, ['email', 'email address', 'mail'], 4);
  const vndAddrIdx = findColIdx(headerRow, ['address', 'office address', 'street', 'premises'], 5);
  const vndCityIdx = findColIdx(headerRow, ['city', 'district', 'town'], 6);
  const vndStateIdx = findColIdx(headerRow, ['state', 'province'], 7);
  const vndGstIdx = findColIdx(headerRow, ['gst number', 'gstin', 'gst', 'gst no'], 8);
  const vndTermsIdx = findColIdx(headerRow, ['payment terms', 'terms', 'credit terms'], 9);

  // Column resolvers for Payments
  const payRcptIdx = findColIdx(headerRow, ['receipt number', 'receipt no', 'receipt', 'voucher no', 'rcpt no'], 0);
  const payCustIdx = findColIdx(headerRow, ['customer name', 'client name', 'customer', 'client', 'name'], 1);
  const payMileIdx = findColIdx(headerRow, ['milestone', 'payment milestone', 'stage', 'description'], 2);
  const payAmtIdx = findColIdx(headerRow, ['amount (inr)', 'amount', 'total amount', 'received amount', 'paid amount'], 3);
  const payStatIdx = findColIdx(headerRow, ['status', 'payment status'], 4);
  const payDueIdx = findColIdx(headerRow, ['due date', 'target date', 'expected date'], 5);
  const payPaidIdx = findColIdx(headerRow, ['paid date', 'payment date', 'receipt date', 'date'], 6);
  const payModeIdx = findColIdx(headerRow, ['payment mode', 'mode', 'method', 'payment method'], 7);
  const payRefIdx = findColIdx(headerRow, ['reference', 'transaction reference', 'ref no', 'txn id', 'transaction id', 'cheque no'], 8);

  // Column resolvers for Expenses
  const expNumIdx = findColIdx(headerRow, ['expense number', 'expense no', 'voucher no', 'exp no', 'number'], 0);
  const expVndIdx = findColIdx(headerRow, ['vendor name', 'vendor', 'payee', 'supplier', 'name'], 1);
  const expCatIdx = findColIdx(headerRow, ['category', 'expense category', 'type'], 2);
  const expAmtIdx = findColIdx(headerRow, ['amount (inr)', 'amount', 'total', 'cost', 'expense amount'], 3);
  const expDateIdx = findColIdx(headerRow, ['date', 'expense date', 'bill date'], 4);
  const expModeIdx = findColIdx(headerRow, ['payment mode', 'mode', 'method'], 5);
  const expRefIdx = findColIdx(headerRow, ['reference no', 'reference', 'invoice no', 'bill no', 'ref no', 'txn id'], 6);
  const expNotesIdx = findColIdx(headerRow, ['notes', 'description', 'remarks', 'memo'], 7);

  // Column resolvers for Attendance
  const attNameIdx = findColIdx(headerRow, ['employee name', 'name', 'staff name', 'employee'], 0);
  const attDateIdx = findColIdx(headerRow, ['date', 'attendance date', 'day'], 1);
  const attInIdx = findColIdx(headerRow, ['check in time', 'check in', 'in time', 'time in', 'login time'], 2);
  const attOutIdx = findColIdx(headerRow, ['check out time', 'check out', 'out time', 'time out', 'logout time'], 3);
  const attStatIdx = findColIdx(headerRow, ['status', 'attendance status'], 4);
  const attLocIdx = findColIdx(headerRow, ['site location', 'site', 'location', 'project site', 'project'], 5);

  // Column resolvers for Service
  const srvIdIdx = findColIdx(headerRow, ['ticket id', 'ticket number', 'ticket no', 'srv no', 'id'], 0);
  const srvCustIdx = findColIdx(headerRow, ['customer name', 'client name', 'customer', 'client', 'name'], 1);
  const srvIssueIdx = findColIdx(headerRow, ['issue', 'description', 'problem', 'subject', 'title'], 2);
  const srvCatIdx = findColIdx(headerRow, ['category', 'ticket category', 'issue type', 'type'], 3);
  const srvPriIdx = findColIdx(headerRow, ['priority', 'urgency', 'severity'], 4);
  const srvStatIdx = findColIdx(headerRow, ['status', 'ticket status'], 5);

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
      const customerName = (cols[leadNameIdx] ?? '').trim();
      const companyName = (leadCompIdx >= 0 ? cols[leadCompIdx] : '')?.trim() || '';
      const phone = (cols[leadPhoneIdx] ?? '').trim();
      const email = (leadEmailIdx >= 0 ? cols[leadEmailIdx] : '')?.trim() || '';
      const address = (leadAddrIdx >= 0 ? cols[leadAddrIdx] : '')?.trim() || '';
      const city = (leadCityIdx >= 0 ? cols[leadCityIdx] : '')?.trim() || 'Ahmedabad';
      const rawCap = (leadCapIdx >= 0 ? cols[leadCapIdx] : '')?.replace(/[^0-9.]/g, '');
      const solarCapacityKw = parseFloat(rawCap) || 10;
      const rawVal = (leadValIdx >= 0 ? cols[leadValIdx] : '')?.replace(/[^0-9.]/g, '');
      const estimatedValue = parseFloat(rawVal) || Math.round(solarCapacityKw * 48000);
      const source = (leadSourceIdx >= 0 ? cols[leadSourceIdx] : '')?.trim() || 'Website';
      const rawStat = (leadStatIdx >= 0 ? cols[leadStatIdx] : '')?.trim().toUpperCase();
      const status = (['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST'].includes(rawStat)
        ? rawStat
        : 'NEW') as Lead['status'];
      const notes = (leadNotesIdx >= 0 ? cols[leadNotesIdx] : '')?.trim() || 'Imported via CSV Hub';

      if (!customerName) {
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

      const dupCheck = validateLead({ customerName, companyName, phone, email }, batchLeads);
      if (!dupCheck.valid) {
        duplicate++;
        skippedRecords.push({ row: rowNum, name: customerName, reason: dupCheck.message || 'Duplicate lead record' });
        errors.push(`Row ${rowNum} Skipped (Duplicate): ${dupCheck.message}`);
        return;
      }

      const newLead: Lead = {
        id: `lead-import-${Date.now()}-${rowNum}`,
        customerName,
        companyName,
        phone,
        email,
        address,
        city,
        solarCapacityKw,
        estimatedValue,
        source,
        status,
        notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      batchLeads.push(newLead);
      validRecords.push(newLead);
      successful++;
    } else if (module === 'Employees') {
      const name = (cols[empNameIdx] ?? '').trim();
      let code = (cols[empCodeIdx] ?? '').trim();
      const department = ((empDeptIdx >= 0 ? cols[empDeptIdx] : '')?.trim() || 'Operations') as Employee['department'];
      const designation = (empDesigIdx >= 0 ? cols[empDesigIdx] : '')?.trim() || 'Staff';
      const phone = (empPhoneIdx >= 0 ? cols[empPhoneIdx] : '')?.trim() || '';
      let email = (empEmailIdx >= 0 ? cols[empEmailIdx] : '')?.trim().toLowerCase() || '';
      const joiningDate = parseDateStr(empDateIdx >= 0 ? cols[empDateIdx] : '') || new Date().toISOString().slice(0, 10);
      const rawSalary = (empSalIdx >= 0 ? cols[empSalIdx] : '')?.replace(/[^0-9.]/g, '');
      const salaryMonthly = parseFloat(rawSalary) || 0;
      const rawStatus = (empStatIdx >= 0 ? cols[empStatIdx] : '')?.trim().toUpperCase();
      const status = (rawStatus === 'INACTIVE' || rawStatus === 'DISABLED' ? rawStatus : 'ACTIVE') as Employee['status'];
      const systemRole = (empRoleIdx >= 0 ? cols[empRoleIdx] : '')?.trim() || 'Staff Member';
      const isFieldWorker = (empFieldIdx >= 0 ? ['true', 'yes', '1'].includes(String(cols[empFieldIdx]).trim().toLowerCase()) : false);

      if (!name) {
        failed++;
        failedRecords.push({ row: rowNum, reason: 'Employee name is mandatory.' });
        errors.push(`Row ${rowNum}: Employee name is mandatory.`);
        return;
      }

      if (!code) {
        code = `EMP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      }

      if (!email) {
        email = `${code.toLowerCase().replace(/[^a-z0-9]/g, '')}@rejoysolar.com`;
      }

      const dupCheck = validateEmployee({ employeeCode: code, name, phone, email }, batchEmployees);
      if (!dupCheck.valid) {
        duplicate++;
        skippedRecords.push({ row: rowNum, name, reason: dupCheck.message || 'Duplicate employee' });
        errors.push(`Row ${rowNum} Skipped (Duplicate): ${dupCheck.message}`);
        return;
      }

      const newEmp: Employee = {
        id: `batch-e-${Date.now()}-${rowNum}`,
        employeeCode: code,
        name,
        department,
        designation,
        phone,
        email,
        joiningDate,
        salaryMonthly,
        status,
        systemRole: systemRole as any,
        isFieldWorker,
        photoUrl: '',
        loginEnabled: true,
        accountStatus: 'ACTIVE'
      };
      batchEmployees.push(newEmp);
      validRecords.push(newEmp);
      successful++;
    } else if (module === 'Projects') {
      const rawCode = (cols[projCodeIdx] ?? '').trim();
      const rawCustomer = (cols[projCustIdx] ?? '').trim();
      const rawTitle = (cols[projTitleIdx] ?? '').trim();
      const rawCapStr = (cols[projCapIdx] ?? '').replace(/[^0-9.]/g, '');
      const rawValStr = (cols[projValIdx] ?? '').replace(/[^0-9.]/g, '');
      const rawStatus = (cols[projStatIdx] ?? '').trim().toUpperCase();
      const rawStart = (cols[projStartIdx] ?? '').trim();
      const rawExp = (cols[projExpIdx] ?? '').trim();
      const rawAddr = (cols[projAddrIdx] ?? '').trim();
      const rawCity = (cols[projCityIdx] ?? '').trim();

      const customerName = rawCustomer || rawTitle;
      if (!customerName) {
        failed++;
        failedRecords.push({ row: rowNum, reason: 'Customer name or project title is mandatory.' });
        errors.push(`Row ${rowNum}: Customer name or project title is mandatory.`);
        return;
      }

      const capacityKw = parseFloat(rawCapStr);
      if (isNaN(capacityKw) || capacityKw <= 0) {
        failed++;
        failedRecords.push({ row: rowNum, reason: `Valid solar capacity in kW (> 0) is required (got "${cols[projCapIdx] || 'empty'}").` });
        errors.push(`Row ${rowNum}: Valid solar capacity in kW (> 0) is required (got "${cols[projCapIdx] || 'empty'}").`);
        return;
      }

      let totalValue = parseFloat(rawValStr);
      if (isNaN(totalValue) || totalValue <= 0) {
        totalValue = Math.round(capacityKw * 48000);
      }

      const title = rawTitle || `${capacityKw} kW Rooftop Solar - ${customerName}`;
      const city = rawCity || 'Ahmedabad';
      const siteAddress = rawAddr || `${city}, Gujarat`;

      const validStatuses: ProjectStatus[] = [
        'PLANNING',
        'SURVEY',
        'DESIGN & APPROVALS',
        'CIVIL & STRUCTURE',
        'INSTALLATION',
        'TESTING & COMMISSIONING',
        'HANDOVER',
        'COMPLETED',
        'DELAYED',
        'ON HOLD'
      ];
      let status: ProjectStatus = 'SURVEY';
      const cleanUpper = rawStatus.replace(/_/g, ' ');
      if (validStatuses.includes(cleanUpper as any)) {
        status = cleanUpper as ProjectStatus;
      } else if (cleanUpper.includes('COMPLETE')) {
        status = 'COMPLETED';
      } else if (cleanUpper.includes('INSTALL')) {
        status = 'INSTALLATION';
      } else if (cleanUpper.includes('PLAN')) {
        status = 'PLANNING';
      }

      const startDate = parseDateStr(rawStart) || new Date().toISOString().split('T')[0];
      const expectedCompletionDate = parseDateStr(rawExp) || new Date(Date.now() + 45 * 86400000).toISOString().split('T')[0];
      const projectCode = rawCode || `SOL-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

      // Check duplicates against existing projects + intra-file batch
      const dupCheck = validateProject(
        { projectCode, customerName, title, capacityKw, siteAddress },
        batchProjects
      );
      if (!dupCheck.valid) {
        duplicate++;
        skippedRecords.push({
          row: rowNum,
          name: `${projectCode} (${customerName})`,
          reason: dupCheck.message || 'Duplicate project record'
        });
        errors.push(`Row ${rowNum} Skipped (Duplicate): ${dupCheck.message}`);
        return;
      }

      const projId = `proj-import-${Date.now()}-${rowNum}`;
      const progressLevel: WorkflowProgressLevel = (status === 'COMPLETED' ? 'COMPLETED' : (status === 'INSTALLATION' ? '68_PERCENT' : 'NEW'));
      const stages = buildStandardWorkflowStages(projId, capacityKw, progressLevel);

      // Match customer from storage
      const matchedCustomer = batchCustomers.find(c =>
        c.name.trim().toLowerCase() === customerName.toLowerCase() ||
        c.companyName?.trim().toLowerCase() === customerName.toLowerCase()
      );

      const newProj: SolarProject = {
        id: projId,
        projectCode,
        customerId: matchedCustomer ? matchedCustomer.id : `cust-link-${Date.now()}-${rowNum}`,
        customerName,
        title,
        capacityKw,
        totalValue,
        status,
        currentStageKey: status === 'COMPLETED' ? 'final_handover' : 'site_survey',
        completionPercentage: status === 'COMPLETED' ? 100 : (status === 'INSTALLATION' ? 68 : 0),
        progressPercentage: status === 'COMPLETED' ? 100 : (status === 'INSTALLATION' ? 68 : 0),
        siteAddress,
        city,
        startDate,
        expectedCompletionDate,
        assignedUsers: [],
        stages,
        notes: 'Imported via CSV Hub',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      batchProjects.push(newProj);
      validRecords.push(newProj);
      successful++;
    } else if (module === 'Products') {
      const name = (cols[prodNameIdx] ?? '').trim();
      const rawSku = (cols[prodSkuIdx] ?? '').trim();
      const category = ((prodCatIdx >= 0 ? cols[prodCatIdx] : '')?.trim() || 'Solar Panels') as ProductItem['category'];
      const brand = (prodBrandIdx >= 0 ? cols[prodBrandIdx] : '')?.trim() || 'Waaree';
      const model = (prodModelIdx >= 0 ? cols[prodModelIdx] : '')?.trim() || '';
      const unit = ((prodUnitIdx >= 0 ? cols[prodUnitIdx] : '')?.trim() || 'NOS') as ProductItem['unit'];
      const hsnCode = (prodHsnIdx >= 0 ? cols[prodHsnIdx] : '')?.trim() || '85414011';
      const rawGst = (prodGstIdx >= 0 ? cols[prodGstIdx] : '')?.replace(/[^0-9.]/g, '');
      const gstRate = parseFloat(rawGst) || 18;
      const rawPrice = (prodPriceIdx >= 0 ? cols[prodPriceIdx] : '')?.replace(/[^0-9.]/g, '');
      const unitPrice = parseFloat(rawPrice) || 0;
      const rawStock = (prodStockIdx >= 0 ? cols[prodStockIdx] : '')?.replace(/[^0-9.]/g, '');
      const currentStock = parseFloat(rawStock) || 0;
      const rawReorder = (prodReorderIdx >= 0 ? cols[prodReorderIdx] : '')?.replace(/[^0-9.]/g, '');
      const reorderLevel = parseFloat(rawReorder) || 10;

      if (!name) {
        failed++;
        failedRecords.push({ row: rowNum, reason: 'Product name is mandatory.' });
        errors.push(`Row ${rowNum}: Product name is mandatory.`);
        return;
      }

      const sku = rawSku || `PRD-${Date.now().toString().slice(-4)}-${rowNum}`;

      const dupCheck = validateProduct({ sku, name }, batchProducts);
      if (!dupCheck.valid) {
        duplicate++;
        skippedRecords.push({ row: rowNum, name: `${name} (${sku})`, reason: dupCheck.message || 'Duplicate product record' });
        errors.push(`Row ${rowNum} Skipped (Duplicate): ${dupCheck.message}`);
        return;
      }

      const prodId = `prod-import-${Date.now()}-${rowNum}`;
      const newProd: ProductItem = {
        id: prodId,
        sku,
        name,
        category,
        brand,
        model,
        specification: `${brand} ${model}`.trim(),
        unit,
        hsnCode,
        gstRate,
        unitPrice,
        sellingPrice: Math.round(unitPrice * 1.15),
        currentStock,
        minStockThreshold: reorderLevel,
        reorderLevel,
        location: 'Warehouse A - Bay 1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      batchProducts.push(newProd);
      validRecords.push(newProd);
      successful++;
    } else if (module === 'Vendors') {
      const name = (cols[vndNameIdx] ?? '').trim();
      const rawCode = (cols[vndCodeIdx] ?? '').trim();
      const contactPerson = (vndContactIdx >= 0 ? cols[vndContactIdx] : '')?.trim() || 'Purchasing Manager';
      const phone = (vndPhoneIdx >= 0 ? cols[vndPhoneIdx] : '')?.trim() || '';
      const email = (vndEmailIdx >= 0 ? cols[vndEmailIdx] : '')?.trim() || '';
      const address = (vndAddrIdx >= 0 ? cols[vndAddrIdx] : '')?.trim() || '';
      const city = (vndCityIdx >= 0 ? cols[vndCityIdx] : '')?.trim() || 'Ahmedabad';
      const state = (vndStateIdx >= 0 ? cols[vndStateIdx] : '')?.trim() || 'Gujarat';
      const gstNumber = (vndGstIdx >= 0 ? cols[vndGstIdx] : '')?.trim().toUpperCase() || '';
      const paymentTerms = (vndTermsIdx >= 0 ? cols[vndTermsIdx] : '')?.trim() || '30 Days Net';

      if (!name) {
        failed++;
        failedRecords.push({ row: rowNum, reason: 'Vendor name is mandatory.' });
        errors.push(`Row ${rowNum}: Vendor name is mandatory.`);
        return;
      }

      const vendorCode = rawCode || `VND-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

      const dupCheck = validateVendor({ vendorCode, name, gstNumber, phone, email }, batchVendors);
      if (!dupCheck.valid) {
        duplicate++;
        skippedRecords.push({ row: rowNum, name: `${name} (${vendorCode})`, reason: dupCheck.message || 'Duplicate vendor record' });
        errors.push(`Row ${rowNum} Skipped (Duplicate): ${dupCheck.message}`);
        return;
      }

      const newVendor: Vendor = {
        id: `vnd-import-${Date.now()}-${rowNum}`,
        vendorCode,
        name,
        contactPerson,
        phone,
        email,
        address,
        city,
        state,
        gstNumber,
        paymentTerms,
        category: 'Modules',
        rating: 4.5,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      batchVendors.push(newVendor);
      validRecords.push(newVendor);
      successful++;
    } else if (module === 'Payments') {
      const rawAmt = (cols[payAmtIdx] ?? '').replace(/[^0-9.]/g, '');
      const amount = parseFloat(rawAmt);
      const customerName = (cols[payCustIdx] ?? '').trim() || 'Solar Client';
      const rawRcpt = (cols[payRcptIdx] ?? '').trim();
      const milestone = (payMileIdx >= 0 ? cols[payMileIdx] : '')?.trim() || 'Advance';
      const rawStat = (payStatIdx >= 0 ? cols[payStatIdx] : '')?.trim().toUpperCase();
      const status = (['PAID', 'PENDING', 'OVERDUE', 'CANCELLED'].includes(rawStat) ? rawStat : 'PAID') as PaymentRecord['status'];
      const dueDate = parseDateStr(payDueIdx >= 0 ? cols[payDueIdx] : '') || new Date().toISOString().split('T')[0];
      const paidDate = parseDateStr(payPaidIdx >= 0 ? cols[payPaidIdx] : '') || (status === 'PAID' ? new Date().toISOString().split('T')[0] : undefined);
      const paymentMode = (payModeIdx >= 0 ? cols[payModeIdx] : '')?.trim() || 'Bank NEFT/RTGS';
      const transactionReference = (payRefIdx >= 0 ? cols[payRefIdx] : '')?.trim() || '';

      if (isNaN(amount) || amount <= 0) {
        failed++;
        failedRecords.push({ row: rowNum, reason: `Valid payment amount (> 0) is required (got "${cols[payAmtIdx] || 'empty'}").` });
        errors.push(`Row ${rowNum}: Valid payment amount (> 0) is required (got "${cols[payAmtIdx] || 'empty'}").`);
        return;
      }

      const receiptNumber = rawRcpt || `RCPT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

      const dupCheck = validatePayment({ receiptNumber, transactionReference }, batchPayments);
      if (!dupCheck.valid) {
        duplicate++;
        skippedRecords.push({ row: rowNum, name: receiptNumber, reason: dupCheck.message || 'Duplicate payment record' });
        errors.push(`Row ${rowNum} Skipped (Duplicate): ${dupCheck.message}`);
        return;
      }

      // Link to existing customer/project if matching
      const matchedCust = batchCustomers.find(c => c.name.toLowerCase() === customerName.toLowerCase() || c.companyName?.toLowerCase() === customerName.toLowerCase());
      const matchedProj = batchProjects.find(p => p.customerName.toLowerCase() === customerName.toLowerCase());

      const newPayment: PaymentRecord = {
        id: `pay-import-${Date.now()}-${rowNum}`,
        receiptNumber,
        projectId: matchedProj ? matchedProj.id : `proj-link-${Date.now()}-${rowNum}`,
        customerId: matchedCust ? matchedCust.id : `cust-link-${Date.now()}-${rowNum}`,
        customerName,
        milestone,
        amount,
        status,
        dueDate,
        paidDate,
        paymentMode,
        transactionReference,
        notes: 'Imported via CSV Hub',
        tallySyncStatus: 'NOT SYNCED',
        createdAt: new Date().toISOString()
      };
      batchPayments.push(newPayment);
      validRecords.push(newPayment);
      successful++;
    } else if (module === 'Expenses') {
      const rawAmt = (cols[expAmtIdx] ?? '').replace(/[^0-9.]/g, '');
      const amount = parseFloat(rawAmt);
      const vendorName = (cols[expVndIdx] ?? '').trim() || 'General Vendor';
      const rawExpNo = (cols[expNumIdx] ?? '').trim();
      const category = (expCatIdx >= 0 ? cols[expCatIdx] : '')?.trim() || 'Material - Cables & BOS';
      const date = parseDateStr(expDateIdx >= 0 ? cols[expDateIdx] : '') || new Date().toISOString().split('T')[0];
      const paymentMode = (expModeIdx >= 0 ? cols[expModeIdx] : '')?.trim() || 'Bank NEFT';
      const referenceNo = (expRefIdx >= 0 ? cols[expRefIdx] : '')?.trim() || '';
      const notes = (expNotesIdx >= 0 ? cols[expNotesIdx] : '')?.trim() || 'Imported via CSV Hub';

      if (isNaN(amount) || amount <= 0) {
        failed++;
        failedRecords.push({ row: rowNum, reason: `Valid expense amount (> 0) is required (got "${cols[expAmtIdx] || 'empty'}").` });
        errors.push(`Row ${rowNum}: Valid expense amount (> 0) is required (got "${cols[expAmtIdx] || 'empty'}").`);
        return;
      }

      const expenseNumber = rawExpNo || `EXP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

      const dupCheck = validateExpense({ expenseNumber, referenceNo }, batchExpenses);
      if (!dupCheck.valid) {
        duplicate++;
        skippedRecords.push({ row: rowNum, name: expenseNumber, reason: dupCheck.message || 'Duplicate expense record' });
        errors.push(`Row ${rowNum} Skipped (Duplicate): ${dupCheck.message}`);
        return;
      }

      const newExpense: ExpenseRecord = {
        id: `exp-import-${Date.now()}-${rowNum}`,
        expenseNumber,
        vendorName,
        category,
        amount,
        date,
        paymentMode,
        referenceNo,
        notes,
        tallySyncStatus: 'NOT SYNCED',
        createdAt: new Date().toISOString()
      };
      batchExpenses.push(newExpense);
      validRecords.push(newExpense);
      successful++;
    } else if (module === 'Attendance') {
      const employeeName = (cols[attNameIdx] ?? '').trim();
      const attendanceDate = parseDateStr(attDateIdx >= 0 ? cols[attDateIdx] : '') || new Date().toISOString().split('T')[0];
      const checkInTime = (attInIdx >= 0 ? cols[attInIdx] : '')?.trim() || '09:00:00';
      const checkOutTime = (attOutIdx >= 0 ? cols[attOutIdx] : '')?.trim() || '18:00:00';
      const rawStatus = (attStatIdx >= 0 ? cols[attStatIdx] : '')?.trim().toUpperCase();
      const status = (['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'ON_DUTY'].includes(rawStatus) ? rawStatus : 'PRESENT') as AttendanceRecord['status'];
      const siteLocation = (attLocIdx >= 0 ? cols[attLocIdx] : '')?.trim() || 'Solar Site';

      if (!employeeName) {
        failed++;
        failedRecords.push({ row: rowNum, reason: 'Employee name is mandatory.' });
        errors.push(`Row ${rowNum}: Employee name is mandatory.`);
        return;
      }

      const matchedEmp = batchEmployees.find(e => e.name.toLowerCase() === employeeName.toLowerCase() || e.employeeCode.toLowerCase() === employeeName.toLowerCase());
      const employeeId = matchedEmp ? matchedEmp.id : `emp-${employeeName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

      const dupCheck = validateAttendance({ employeeName, employeeId, attendanceDate, date: attendanceDate }, batchAttendance);
      if (!dupCheck.valid) {
        duplicate++;
        skippedRecords.push({ row: rowNum, name: `${employeeName} (${attendanceDate})`, reason: dupCheck.message || 'Duplicate attendance record' });
        errors.push(`Row ${rowNum} Skipped (Duplicate): ${dupCheck.message}`);
        return;
      }

      const newAttendance: AttendanceRecord = {
        id: `att-import-${Date.now()}-${rowNum}`,
        employeeId,
        employeeName,
        date: attendanceDate,
        attendanceDate,
        checkInTime,
        checkOutTime,
        status,
        siteLocation,
        siteProjectTitle: siteLocation,
        createdAt: new Date().toISOString()
      };
      batchAttendance.push(newAttendance);
      validRecords.push(newAttendance);
      successful++;
    } else if (module === 'Service') {
      const rawTicketId = (cols[srvIdIdx] ?? '').trim();
      const customerName = (cols[srvCustIdx] ?? '').trim();
      const issue = (cols[srvIssueIdx] ?? '').trim();
      const category = (srvCatIdx >= 0 ? cols[srvCatIdx] : '')?.trim() || 'INVERTER';
      const rawPriority = (srvPriIdx >= 0 ? cols[srvPriIdx] : '')?.trim().toUpperCase();
      const priority = (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(rawPriority) ? rawPriority : 'MEDIUM') as ServiceTicket['priority'];
      const rawStatus = (srvStatIdx >= 0 ? cols[srvStatIdx] : '')?.trim().toUpperCase();
      const status = (['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(rawStatus) ? rawStatus : 'OPEN') as ServiceTicket['status'];

      if (!issue && !customerName) {
        failed++;
        failedRecords.push({ row: rowNum, reason: 'Customer name or issue description is mandatory.' });
        errors.push(`Row ${rowNum}: Customer name or issue description is mandatory.`);
        return;
      }

      const ticketId = rawTicketId || `SRV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

      const dupCheck = validateServiceTicket({ ticketId, ticketNumber: ticketId }, batchServiceTickets);
      if (!dupCheck.valid) {
        duplicate++;
        skippedRecords.push({ row: rowNum, name: ticketId, reason: dupCheck.message || 'Duplicate service ticket' });
        errors.push(`Row ${rowNum} Skipped (Duplicate): ${dupCheck.message}`);
        return;
      }

      const matchedCust = batchCustomers.find(c => c.name.toLowerCase() === customerName.toLowerCase() || c.companyName?.toLowerCase() === customerName.toLowerCase());
      const matchedProj = batchProjects.find(p => p.customerName.toLowerCase() === customerName.toLowerCase());

      const newTicket: ServiceTicket = {
        id: `srv-import-${Date.now()}-${rowNum}`,
        ticketId,
        ticketNumber: ticketId,
        customerId: matchedCust ? matchedCust.id : `cust-link-${Date.now()}-${rowNum}`,
        customerName: customerName || 'Solar Client',
        projectId: matchedProj ? matchedProj.id : `proj-link-${Date.now()}-${rowNum}`,
        projectTitle: matchedProj ? matchedProj.title : 'Solar Rooftop Installation',
        issue: issue || 'Solar System Inspection',
        title: issue || 'Solar System Inspection',
        category,
        priority,
        status,
        notes: 'Imported via CSV Hub',
        createdAt: new Date().toISOString()
      };
      batchServiceTickets.push(newTicket);
      validRecords.push(newTicket);
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
