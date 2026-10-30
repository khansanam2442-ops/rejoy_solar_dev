import {
  SolarProject,
  ProjectAssignmentRole,
  ProjectUserAssignment,
  Customer,
  Lead,
  ProjectStage,
  PaymentRecord,
  ExpenseRecord,
  Employee,
  AttendanceRecord,
  Payslip,
  HolidayRecord,
  HolidayType,
  ServiceTicket,
  AMCContract,
  AppNotification,
  SystemSettings,
  SiteSurveyData,
  Quotation,
  WorkflowStageKey,
  StageStatus,
  LeadStatus,
  ProductItem,
  Vendor,
  PurchaseOrder,
  PurchaseItem,
  PurchaseLineItem,
  PurchaseDeliveryReceipt,
  DeliveryReceiptItem,
  BillOfMaterials,
  BOMItem,
  SalesInvoice,
  InvoiceLineItem,
  StockMovement,
  Warehouse,
  StockAuditRecord,
  UserRole
} from '../types/solar';
import { SystemAclConfig, AclAuditLogEntry } from '../types/acl';
import { DEFAULT_SYSTEM_ACL_CONFIG } from './aclDefaults';
import { safeStorage, safeSessionStorage } from './safeStorage';
import { buildStandardWorkflowStages, WorkflowProgressLevel } from './workflowStages';
import { getCurrentSalaryMonth } from '../utils/payrollPeriods';
import {
  validateCustomer,
  validateProduct,
  validateVendor,
  validateEmployee,
  validateBOM,
  validatePurchaseOrder,
  validatePOLineItems,
  validatePOLineItem,
  assertValid,
  DuplicateRecordError
} from './validation';

export {
  DuplicateRecordError,
  validateCustomer,
  validateProduct,
  validateVendor,
  validateEmployee,
  validateBOM,
  validatePurchaseOrder,
  validatePOLineItems,
  validatePOLineItem
};

const STORAGE_KEYS = {
  LEADS: 'solar_erp_leads_v2',
  CUSTOMERS: 'solar_erp_customers_v2',
  PROJECTS: 'solar_erp_projects_v2',
  PAYMENTS: 'solar_erp_payments_v2',
  EXPENSES: 'solar_erp_expenses_v2',
  EMPLOYEES: 'solar_erp_employees_v2',
  ATTENDANCE: 'solar_erp_attendance_v2',
  PAYSLIPS: 'solar_erp_payslips_v2',
  HOLIDAYS: 'solar_erp_holidays_v2',
  SERVICE_TICKETS: 'solar_erp_service_tickets_v2',
  AMC_CONTRACTS: 'solar_erp_amc_contracts_v2',
  NOTIFICATIONS: 'solar_erp_notifications_v2',
  SETTINGS: 'solar_erp_settings_v2',
  SURVEYS: 'solar_erp_surveys_v2',
  QUOTATIONS: 'solar_erp_quotations_v2',
  PRODUCTS: 'solar_erp_products_v2',
  VENDORS: 'solar_erp_vendors_v2',
  PURCHASE_ORDERS: 'solar_erp_purchase_orders_v2',
  BOMS: 'solar_erp_boms_v2',
  SALES_INVOICES: 'solar_erp_sales_invoices_v2',
  STOCK_MOVEMENTS: 'solar_erp_stock_movements_v2',
  ACL_CONFIG: 'solar_erp_acl_config_v2',
  ACL_AUDIT_LOGS: 'solar_erp_acl_audit_logs_v2',
  WAREHOUSES: 'solar_erp_warehouses_v2',
  STOCK_AUDITS: 'solar_erp_stock_audits_v2',
  USERS: 'solar_erp_users_v2',
};

const initialWarehouses: Warehouse[] = [];
const initialStockAudits: StockAuditRecord[] = [];
const initialAclAuditLogs: AclAuditLogEntry[] = [];
const initialEmployees: Employee[] = [];
const initialCustomers: Customer[] = [];
const initialLeads: Lead[] = [];
const initialProjects: SolarProject[] = [];
const initialPayments: PaymentRecord[] = [];
const initialExpenses: ExpenseRecord[] = [];
const initialAttendance: AttendanceRecord[] = [];
const initialPayslips: Payslip[] = [];
const initialHolidays: HolidayRecord[] = [];
const initialServiceTickets: ServiceTicket[] = [];
const initialAMCContracts: AMCContract[] = [];
const initialNotifications: AppNotification[] = [];
const initialSurveys: SiteSurveyData[] = [];
const initialQuotations: Quotation[] = [];
const initialProducts: ProductItem[] = [];
const initialVendors: Vendor[] = [];
const initialPurchaseOrders: PurchaseOrder[] = [];
const initialBOMs: BillOfMaterials[] = [];
const initialSalesInvoices: SalesInvoice[] = [];
const initialStockMovements: StockMovement[] = [];

const initialSettings: SystemSettings = {
  companyName: 'REJOY SOLAR POWER PVT. LTD',
  companyAddress: 'PLOT NO- 14, STREET NO- 14B, PRAGATI NAGAR, RISALI BHILAI, Chhattisgarh 490006',
  companyPhone: '+91 98250 12345',
  companyEmail: 'rejoysolarpower@gmail.com',
  companyGst: '22AAOCR0748K1Z5',
  logoUrl: '/logo-dark.png',
  currencySymbol: '₹',
  taxRatePercent: 18,
  tallyServerUrl: (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_TALLY_SERVER_URL) ? import.meta.env.VITE_TALLY_SERVER_URL : '',
  tallyCompany: 'Rejoy Solar 2026-27',
  tallyStatus: 'NOT CONFIGURED',
  whatsAppStatus: 'SANDBOX_READY'
};


const KEY_TO_COLLECTION: Record<string, string> = {
  [STORAGE_KEYS.LEADS]: 'leads',
  [STORAGE_KEYS.CUSTOMERS]: 'customers',
  [STORAGE_KEYS.PROJECTS]: 'projects',
  [STORAGE_KEYS.PAYMENTS]: 'payments',
  [STORAGE_KEYS.EXPENSES]: 'expenses',
  [STORAGE_KEYS.EMPLOYEES]: 'employees',
  [STORAGE_KEYS.ATTENDANCE]: 'attendance',
  [STORAGE_KEYS.PAYSLIPS]: 'payslips',
  [STORAGE_KEYS.HOLIDAYS]: 'holidays',
  [STORAGE_KEYS.SERVICE_TICKETS]: 'service_tickets',
  [STORAGE_KEYS.AMC_CONTRACTS]: 'amc_contracts',
  [STORAGE_KEYS.NOTIFICATIONS]: 'notifications',
  [STORAGE_KEYS.SETTINGS]: 'settings',
  [STORAGE_KEYS.SURVEYS]: 'surveys',
  [STORAGE_KEYS.QUOTATIONS]: 'quotations',
  [STORAGE_KEYS.PRODUCTS]: 'products',
  [STORAGE_KEYS.VENDORS]: 'vendors',
  [STORAGE_KEYS.PURCHASE_ORDERS]: 'purchase_orders',
  [STORAGE_KEYS.BOMS]: 'boms',
  [STORAGE_KEYS.SALES_INVOICES]: 'sales_invoices',
  [STORAGE_KEYS.STOCK_MOVEMENTS]: 'stock_movements',
  [STORAGE_KEYS.ACL_CONFIG]: 'acl_config',
  [STORAGE_KEYS.ACL_AUDIT_LOGS]: 'acl_audit_logs',
  [STORAGE_KEYS.WAREHOUSES]: 'warehouses',
  [STORAGE_KEYS.STOCK_AUDITS]: 'stock_audits',
  [STORAGE_KEYS.USERS]: 'users'
};

class StorageService {
  private memStore = new Map<string, any>();
  public isHydrated: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        // Clean only legacy v1 keys, strictly preserving all v2 authoritative keys
        const legacyV1Keys = [
          'solar_erp_leads', 'solar_erp_customers', 'solar_erp_projects', 'solar_erp_payments',
          'solar_erp_expenses', 'solar_erp_employees', 'solar_erp_attendance', 'solar_erp_payslips',
          'solar_erp_holidays', 'solar_erp_service_tickets', 'solar_erp_amc_contracts', 'solar_erp_notifications',
          'solar_erp_surveys', 'solar_erp_quotations', 'solar_erp_products', 'solar_erp_vendors',
          'solar_erp_purchase_orders', 'solar_erp_boms', 'solar_erp_sales_invoices', 'solar_erp_stock_movements',
          'solar_erp_warehouses', 'solar_erp_stock_audits', 'solar_erp_acl_audit_logs', 'solar_erp_settings'
        ];
        legacyV1Keys.forEach(k => {
          safeStorage.removeItem(k);
          safeSessionStorage.removeItem(k);
        });

        // Pre-populate memStore immediately from safeStorage for instant render without white screens or blank lists
        Object.values(STORAGE_KEYS).forEach(k => {
          const cached = safeStorage.getItem(k);
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              if (parsed !== undefined && parsed !== null) {
                this.memStore.set(k, parsed);
              }
            } catch {}
          }
        });
      } catch {}

      // Asynchronously hydrate authoritative data from backend MySQL
      this.hydrateFromBackend();
    }
  }

  public async hydrateFromBackend(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const apiUrl = (typeof window !== 'undefined' && (window as any).__SOLAR_API_URL__)
        ? (window as any).__SOLAR_API_URL__
        : ((typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL)
          ? String(import.meta.env.VITE_API_URL).replace(/\/$/, '')
          : '/api');

      const authToken = safeStorage.getItem('rejoysolar_auth_token');
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`;
        headers['x-auth-token'] = authToken;
      }
      try {
        const raw = safeStorage.getItem('rejoysolar_active_session');
        if (raw) {
          const u = JSON.parse(raw);
          if (u?.id) headers['x-user-id'] = u.id;
          if (u?.role) headers['x-user-role'] = u.role;
        }
      } catch {}

      const res = await fetch(`${apiUrl}/bootstrap`, { headers });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          Object.entries(KEY_TO_COLLECTION).forEach(([storageKey, collectionKey]) => {
            const backendItems = json.data[collectionKey];
            if (backendItems !== undefined && backendItems !== null) {
              if (Array.isArray(backendItems)) {
                let cleaned = backendItems.filter(Boolean);
                if (collectionKey === 'attendance') {
                  cleaned = cleaned.map((a: any) => ({
                    ...a,
                    date: a.date || a.attendanceDate || (a.createdAt ? String(a.createdAt).slice(0, 10) : ''),
                    attendanceDate: a.attendanceDate || a.date
                  }));
                } else if (collectionKey === 'quotations') {
                  cleaned = cleaned.map((q: any) => ({
                    ...q,
                    quotationDate: q.quotationDate || (q.createdAt ? String(q.createdAt).slice(0, 10) : '')
                  }));
                }
                this.memStore.set(storageKey, cleaned);
                safeStorage.setItem(storageKey, JSON.stringify(cleaned));
              } else {
                this.memStore.set(storageKey, backendItems);
                safeStorage.setItem(storageKey, JSON.stringify(backendItems));
              }
            }
          });
          this.isHydrated = true;
          window.dispatchEvent(new Event('solarpulse_storage_updated'));
        }
      }
    } catch (e) {
      console.warn('[Storage] Backend bootstrap notice:', e);
    }
  }

  private get<T>(key: string, defaultValue: T): T {
    if (this.memStore.has(key)) {
      const val = this.memStore.get(key);
      if (val !== undefined && val !== null) {
        if (Array.isArray(defaultValue)) {
          return (Array.isArray(val) ? val : defaultValue) as T;
        }
        return val as T;
      }
    }
    // Check safeStorage fallback
    if (typeof window !== 'undefined') {
      const stored = safeStorage.getItem(key);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed !== undefined && parsed !== null) {
            this.memStore.set(key, parsed);
            return parsed as T;
          }
        } catch {}
      }
    }
    this.memStore.set(key, defaultValue);
    return defaultValue;
  }

  private set<T>(key: string, data: T, singleItem?: any): void {
    this.memStore.set(key, data);
    if (typeof window !== 'undefined') {
      safeStorage.setItem(key, JSON.stringify(data));
      const collection = KEY_TO_COLLECTION[key];
      if (collection) {
        fetch('/api/sync/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ collection, item: singleItem, items: singleItem ? undefined : data })
        })
          .then(async (res) => {
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              console.error(`[MySQL Storage Error] Failed to persist ${collection}:`, err.error || err.message || res.statusText);
              window.dispatchEvent(new CustomEvent('solarpulse_storage_error', { detail: { collection, error: err.error || err.message || res.statusText } }));
            }
          })
          .catch((e) => {
            console.error(`[MySQL Network Error] Failed to sync ${collection}:`, e);
            window.dispatchEvent(new CustomEvent('solarpulse_storage_error', { detail: { collection, error: e.message } }));
          });
        window.dispatchEvent(new Event('solarpulse_storage_updated'));
      }
    }
  }

  private deleteSync(collection: string, id: string): void {
    if (typeof window !== 'undefined') {
      const storageKey = Object.entries(KEY_TO_COLLECTION).find(([, col]) => col === collection)?.[0];
      if (storageKey && this.memStore.has(storageKey)) {
        safeStorage.setItem(storageKey, JSON.stringify(this.memStore.get(storageKey)));
      }
      fetch('/api/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection, item: { id }, action: 'delete' })
      })
        .then(async (res) => {
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.error(`[MySQL Storage Error] Failed to sync delete for ${collection}:`, err.error || res.statusText);
            this.hydrateFromBackend();
            window.dispatchEvent(new CustomEvent('solarpulse_storage_error', { detail: { collection, error: err.error } }));
          }
        })
        .catch((e) => {
          console.error(`[MySQL Network Error] Failed to sync delete for ${collection}:`, e);
          this.hydrateFromBackend();
        });
      window.dispatchEvent(new Event('solarpulse_storage_updated'));
    }
  }

  // --- Leads ---
  getLeads(): Lead[] {
    return this.get<Lead[]>(STORAGE_KEYS.LEADS, initialLeads);
  }

  saveLead(lead: Lead): void {
    const leads = this.getLeads();
    const index = leads.findIndex(l => l.id === lead.id);
    if (index >= 0) {
      leads[index] = { ...lead, updatedAt: new Date().toISOString() };
    } else {
      leads.unshift({ ...lead, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    this.set(STORAGE_KEYS.LEADS, leads, lead);
  }

  deleteLead(id: string): void {
    const leads = this.getLeads().filter(l => l.id !== id);
    this.set(STORAGE_KEYS.LEADS, leads);
    this.deleteSync('leads', id);
  }

  addLead(leadData: Partial<Lead> & { customerName: string; phone: string; [key: string]: any }): Lead {
    const newLead: Lead = {
      id: `lead-${Date.now()}`,
      customerName: leadData.customerName,
      companyName: leadData.companyName || leadData.customerName,
      phone: leadData.phone,
      email: leadData.email || '',
      address: leadData.address || '',
      city: leadData.city || 'Ahmedabad',
      solarCapacityKw: Number(leadData.solarCapacityKw) || 10,
      estimatedValue: Number(leadData.estimatedValue) || 450000,
      source: leadData.source || 'Direct Call',
      assignedSalespersonId: leadData.assignedSalespersonId || leadData.assignedToId || 'emp-4',
      assignedSalespersonName: leadData.assignedSalespersonName || leadData.assignedToName || 'Priya Verma',
      status: (leadData.status as LeadStatus) || 'NEW',
      notes: leadData.notes || '',
      nextFollowUpDate: leadData.nextFollowUpDate || new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.saveLead(newLead);
    return newLead;
  }

  // Convert Lead to Customer & Project
  convertLeadToCustomerAndProject(
    leadId: string,
    convertedByName?: string,
    role?: string
  ): { customer: Customer; project: SolarProject } {
    let lead = this.getLeads().find(l => l.id === leadId);
    if (!lead) {
      const customers = this.getCustomers();
      const projects = this.getProjects();
      return { customer: customers[0], project: projects[0] };
    }

    // Pre-validate customer uniqueness before modifying lead or creating project
    const customerValidation = validateCustomer(
      {
        name: lead.customerName,
        companyName: lead.companyName,
        phone: lead.phone,
        email: lead.email,
        city: lead.city
      },
      this.getCustomers()
    );
    assertValid(customerValidation);

    const customerId = `cust-${Date.now()}`;
    const projectId = `proj-${Date.now()}`;

    const newCustomer: Customer = {
      id: customerId,
      name: lead.customerName,
      companyName: lead.companyName || lead.customerName,
      customerType: 'Commercial',
      phone: lead.phone,
      email: lead.email,
      siteAddress: lead.address,
      city: lead.city,
      state: 'Gujarat',
      pincode: '380001',
      status: 'ACTIVE',
      activeProjectId: projectId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const newProject: SolarProject = {
      id: projectId,
      projectCode: `SOL-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      customerId: customerId,
      customerName: newCustomer.name,
      title: `${lead.solarCapacityKw} kW Rooftop Solar Project`,
      capacityKw: lead.solarCapacityKw,
      totalValue: lead.estimatedValue || lead.solarCapacityKw * 50000,
      status: 'SURVEY',
      currentStageKey: 'site_survey',
      completionPercentage: 0,
      progressPercentage: 0,
      location: lead.city,
      assignedUsers: [
        {
          id: `asgn-${Date.now()}-lead`,
          projectId: projectId,
          userId: 'emp-5',
          userName: convertedByName || 'Rahul Mehta',
          employeeCode: 'EMP005',
          role: 'Sales Executive',
          department: 'Sales',
          assignedAt: new Date().toISOString(),
          assignedBy: convertedByName || 'System Admin',
          notes: 'Lead conversion and client account coordination',
          isActive: true
        }
      ],
      siteAddress: lead.address,
      city: lead.city,
      startDate: new Date().toISOString().split('T')[0],
      expectedCompletionDate: new Date(Date.now() + 45 * 86400000).toISOString().split('T')[0],
      stages: buildStandardWorkflowStages(projectId, lead.solarCapacityKw, 'NEW'),
      notes: `Converted from Lead ID: ${lead.id}${convertedByName ? ` by ${convertedByName} (${role || 'Sales'})` : ''}. ${lead.notes}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Update lead status to WON
    this.saveLead({ ...lead, status: 'WON' });
    this.saveCustomer(newCustomer);
    this.saveProject(newProject);

    this.addNotification({
      title: 'Lead Converted to Active Project',
      message: `${lead.customerName} converted into Customer & Project ${newProject.projectCode} (${lead.solarCapacityKw} kW). Stage 1 (Site Survey) is active.`,
      type: 'SUCCESS',
      linkType: 'PROJECT',
      linkId: projectId,
      customerId: customerId,
      projectId: projectId,
      projectName: newProject.title
    });

    return { customer: newCustomer, project: newProject };
  }

  // Create new Customer and Solar Project with strictly initialized Stage 1
  createCustomerAndProject(customerData: {
    name: string;
    companyName?: string;
    customerType?: 'Residential' | 'Commercial' | 'Industrial';
    phone: string;
    email?: string;
    password?: string;
    siteAddress?: string;
    city?: string;
    capacityKw?: number;
    estimatedValue?: number;
  }, createdByName: string = 'System Admin', role: string = 'Admin'): { customer: Customer; project: SolarProject } {
    // Pre-validate customer uniqueness
    const customerValidation = validateCustomer(
      {
        name: customerData.name,
        companyName: customerData.companyName,
        phone: customerData.phone,
        email: customerData.email,
        city: customerData.city
      },
      this.getCustomers()
    );
    assertValid(customerValidation);

    const customerId = `cust-${Date.now()}`;
    const projectId = `proj-${Date.now()}`;
    const capacityKw = Number(customerData.capacityKw) || 10;
    const estimatedValue = Number(customerData.estimatedValue) || capacityKw * 50000;

    const newCustomer: Customer = {
      id: customerId,
      name: customerData.name,
      companyName: customerData.companyName || customerData.name,
      customerType: customerData.customerType || 'Commercial',
      phone: customerData.phone,
      email: customerData.email || '',
      password: customerData.password || '123456',
      siteAddress: customerData.siteAddress || '',
      city: customerData.city || 'Ahmedabad',
      state: 'Gujarat',
      pincode: '380001',
      status: 'ACTIVE',
      activeProjectId: projectId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const newProject: SolarProject = {
      id: projectId,
      projectCode: `SOL-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      customerId: customerId,
      customerName: newCustomer.name,
      title: `${capacityKw} kW Rooftop Solar Project`,
      capacityKw: capacityKw,
      totalValue: estimatedValue,
      status: 'SURVEY',
      currentStageKey: 'site_survey',
      completionPercentage: 0,
      progressPercentage: 0,
      location: customerData.city || 'Ahmedabad',
      assignedUsers: [],
      siteAddress: customerData.siteAddress || '',
      city: customerData.city || 'Ahmedabad',
      startDate: new Date().toISOString().split('T')[0],
      expectedCompletionDate: new Date(Date.now() + 45 * 86400000).toISOString().split('T')[0],
      stages: buildStandardWorkflowStages(projectId, capacityKw, 'NEW'),
      notes: `Created by ${createdByName} (${role}). Initialized at Stage 1: Site Survey.`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.saveCustomer(newCustomer);
    this.saveProject(newProject);

    this.addNotification({
      title: 'New Solar Project Initialized',
      message: `Project ${newProject.projectCode} (${capacityKw} kW) created for ${newCustomer.name}. Stage 1 (Site Survey) is active.`,
      type: 'SUCCESS',
      linkType: 'PROJECT',
      linkId: projectId,
      customerId: customerId,
      projectId: projectId,
      projectName: newProject.title
    });

    return { customer: newCustomer, project: newProject };
  }

  // --- Customers ---
  getCustomers(): Customer[] {
    return this.get<Customer[]>(STORAGE_KEYS.CUSTOMERS, initialCustomers);
  }

  saveCustomer(customer: Customer): void {
    const customers = this.getCustomers();
    const validation = validateCustomer(customer, customers, customer.id);
    assertValid(validation);

    const index = customers.findIndex(c => c.id === customer.id);
    if (index >= 0) {
      customers[index] = { ...customer, updatedAt: new Date().toISOString() };
    } else {
      customers.unshift({ ...customer, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    this.set(STORAGE_KEYS.CUSTOMERS, customers, customer);
  }

  deleteCustomer(id: string): void {
    const customers = this.getCustomers().filter(c => c.id !== id);
    this.set(STORAGE_KEYS.CUSTOMERS, customers);
    this.deleteSync('customers', id);
    if (typeof fetch !== 'undefined') {
      fetch(`/api/customers/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
    }
  }

  async importCustomers(customers: any[]): Promise<{
    success: boolean;
    total: number;
    imported: number;
    skipped: number;
    failed: number;
    importedRecords?: Customer[];
    skippedRecords?: { row: number; name: string; reason: string }[];
    failedRecords?: { row: number; reason: string }[];
    errors?: string[];
  }> {
    const res = await fetch('/api/customers/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customers })
    });
    let result: any = {};
    try {
      result = await res.json();
    } catch {
      throw new Error(`Server returned HTTP ${res.status} (${res.statusText}).`);
    }
    if (!res.ok || result.success === false) {
      throw new Error(result.error || result.message || `Customer import failed with status ${res.status}`);
    }

    if (result.importedRecords && result.importedRecords.length > 0) {
      const current = this.getCustomers();
      const existingIds = new Set(current.map(c => c.id));
      const newlyAdded: Customer[] = result.importedRecords.filter((r: any) => !existingIds.has(r.id));
      const updatedList = [...newlyAdded, ...current];
      this.memStore.set(STORAGE_KEYS.CUSTOMERS, updatedList);
      safeStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(updatedList));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('solarpulse_storage_updated'));
      }
    }

    return result;
  }

  updateCustomerPassword(customerId: string, newPassword: string): void {
    const customers = this.getCustomers();
    const index = customers.findIndex(c => c.id === customerId);
    if (index >= 0) {
      customers[index] = {
        ...customers[index],
        password: newPassword,
        updatedAt: new Date().toISOString()
      };
      this.set(STORAGE_KEYS.CUSTOMERS, customers);
    }
    if (typeof fetch !== 'undefined') {
      fetch(`/api/customers/${encodeURIComponent(customerId)}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword })
      }).catch(() => {});
    }
  }

  // --- Projects & Workflow Automation ---
  getProjects(): SolarProject[] {
    const rawProjects = this.get<SolarProject[]>(STORAGE_KEYS.PROJECTS, initialProjects);
    let mutated = false;

    const list = Array.isArray(rawProjects) ? rawProjects : initialProjects;

    // Self-healing integrity check:
    // A stage N cannot be COMPLETED/APPROVED unless all previous stages 0..N-1 are COMPLETED/APPROVED.
    // Ensure newly initialized projects never have stages 2..16 completed.
    const sanitized = list.map(project => {
      if (!project || typeof project !== 'object') return null;

      let hasIncompletePriorStage = false;
      let stagesChanged = false;

      // Ensure stages array exists and is hydrated
      if (!project.stages || !Array.isArray(project.stages) || project.stages.length === 0) {
        if ((project as any).stages_json) {
          try {
            const rawJson = (project as any).stages_json;
            const parsed = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
            if (Array.isArray(parsed) && parsed.length > 0) {
              project.stages = parsed;
            }
          } catch {}
        }
        if (!project.stages || !Array.isArray(project.stages) || project.stages.length === 0) {
          const progressLevel: WorkflowProgressLevel = project.status === 'COMPLETED' ? 'COMPLETED' : 'NEW';
          project.stages = buildStandardWorkflowStages(project.id, project.capacityKw || 10, progressLevel);
          mutated = true;
        }
      }

      // Self-healing migration for multi-user project assignments:
      if (!project.assignedUsers || !Array.isArray(project.assignedUsers) || project.assignedUsers.length === 0) {
        const defaultMatch = undefined;
        if (defaultMatch?.assignedUsers && defaultMatch.assignedUsers.length > 0) {
          project.assignedUsers = JSON.parse(JSON.stringify(defaultMatch.assignedUsers));
          mutated = true;
        } else if (!project.assignedUsers) {
          project.assignedUsers = [];
          mutated = true;
        }
      }

      // Ensure administrative/finance assignments are cleaned up from project specialist lists
      if (project.assignedUsers && Array.isArray(project.assignedUsers)) {
        const beforeLen = project.assignedUsers.length;
        project.assignedUsers = project.assignedUsers.filter(
          a => a && a.role !== 'Accountant' && a.department !== 'Finance'
        );
        if (project.assignedUsers.length !== beforeLen) {
          mutated = true;
        }
      }

      const stagesList = Array.isArray(project.stages) ? project.stages : [];
      const cleanedStages = stagesList.map((stage, idx) => {
        if (!stage) return stage;
        stage.checklist = Array.isArray(stage.checklist) ? stage.checklist : [];
        stage.photos = Array.isArray(stage.photos) ? stage.photos : [];
        stage.documents = Array.isArray(stage.documents) ? stage.documents : [];
        stage.activities = Array.isArray(stage.activities) ? stage.activities : [];

        if (idx === 0) {
          if (stage.status !== 'COMPLETED' && stage.status !== 'APPROVED') {
            hasIncompletePriorStage = true;
          }
          return stage;
        }

        if (hasIncompletePriorStage) {
          if (stage.status === 'COMPLETED' || stage.status === 'APPROVED') {
            stagesChanged = true;
            return {
              ...stage,
              status: 'NOT STARTED' as StageStatus,
              actualEndDate: undefined,
              completedDate: undefined,
              approvedBy: undefined,
              approvalDate: undefined,
              checklist: stage.checklist.map(c => ({
                ...c,
                completed: false,
                completedAt: undefined,
                completedBy: undefined
              }))
            };
          }
        }

        if (stage.status !== 'COMPLETED' && stage.status !== 'APPROVED') {
          hasIncompletePriorStage = true;
        }

        return stage;
      });

      if (stagesChanged) {
        mutated = true;
        const completedCount = cleanedStages.filter(s => s && (s.status === 'COMPLETED' || s.status === 'APPROVED')).length;
        const completionPercentage = cleanedStages.length > 0 ? Math.round((completedCount / cleanedStages.length) * 100) : 0;
        return {
          ...project,
          stages: cleanedStages,
          completionPercentage,
          progressPercentage: completionPercentage
        };
      }

      return {
        ...project,
        stages: cleanedStages
      };
    }).filter(Boolean) as SolarProject[];

    if (mutated) {
      this.memStore.set(STORAGE_KEYS.PROJECTS, sanitized);
    }

    return sanitized;
  }

  getProjectById(id: string): SolarProject | undefined {
    return this.getProjects().find(p => p.id === id);
  }

  saveProject(project: SolarProject): void {
    const projects = this.getProjects();
    const index = projects.findIndex(p => p.id === project.id);
    if (index >= 0) {
      projects[index] = { ...project, updatedAt: new Date().toISOString() };
    } else {
      projects.unshift({ ...project, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    this.set(STORAGE_KEYS.PROJECTS, projects, project);
  }

  deleteProject(id: string): void {
    const projects = this.getProjects().filter(p => p.id !== id);
    this.set(STORAGE_KEYS.PROJECTS, projects);
    this.deleteSync('projects', id);
    if (typeof fetch !== 'undefined') {
      fetch(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
    }
  }

  async importProjects(projects: any[]): Promise<{
    success: boolean;
    total: number;
    imported: number;
    skipped: number;
    failed: number;
    importedRecords?: SolarProject[];
    skippedRecords?: { row: number; name: string; reason: string }[];
    failedRecords?: { row: number; reason: string }[];
    errors?: string[];
  }> {
    const res = await fetch('/api/projects/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projects })
    });
    let result: any = {};
    try {
      result = await res.json();
    } catch {
      throw new Error(`Server returned HTTP ${res.status} (${res.statusText}).`);
    }
    if (!res.ok || result.success === false) {
      throw new Error(result.error || result.message || `Project import failed with status ${res.status}`);
    }

    if (result.importedRecords && result.importedRecords.length > 0) {
      const current = this.getProjects();
      const existingIds = new Set(current.map(p => p.id));
      const newlyAdded: SolarProject[] = result.importedRecords.filter((r: any) => !existingIds.has(r.id));
      const updatedList = [...newlyAdded, ...current];
      this.memStore.set(STORAGE_KEYS.PROJECTS, updatedList);
      safeStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(updatedList));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('solarpulse_storage_updated'));
      }
    }

    return result;
  }

  // --- Multi-User Project Assignments ---
  getProjectAssignments(projectId: string): ProjectUserAssignment[] {
    const project = this.getProjectById(projectId);
    return project?.assignedUsers || [];
  }

  assignUserToProject(
    projectId: string,
    assignmentData: {
      userId: string;
      userName: string;
      userEmail?: string;
      employeeCode?: string;
      role: ProjectAssignmentRole;
      department: string;
      notes?: string;
      autoSyncStages?: boolean;
    },
    assignedByName: string = 'Admin'
  ): ProjectUserAssignment {
    const projects = this.getProjects();
    const projectIndex = projects.findIndex(p => p.id === projectId);
    if (projectIndex === -1) {
      throw new Error(`Project with ID ${projectId} not found.`);
    }

    // Explicitly validate role is an eligible project specialist role
    if (
      assignmentData.role === 'Accountant' ||
      (assignmentData.role as string) === 'Admin' ||
      (assignmentData.role as string) === 'HR Manager' ||
      (assignmentData.role as string) === 'Customer'
    ) {
      throw new Error(`Role "${assignmentData.role}" is not eligible for project specialist assignment. Only field, technical, service, or sales coordination specialists may be assigned.`);
    }

    // Explicitly validate that employee is not an excluded user (Admin, Accountant, HR Manager, Customer)
    const emp = this.getEmployees().find(e => e.id === assignmentData.userId);
    if (emp) {
      const desig = (emp.designation || '').toLowerCase().trim();
      const dept = (emp.department || '').toLowerCase().trim();
      if (
        desig.includes('director') ||
        desig === 'admin' ||
        desig.includes('admin ') ||
        desig.includes(' admin') ||
        desig.includes('administrator') ||
        desig.includes('accountant') ||
        desig.includes('finance') ||
        desig.includes('tally') ||
        desig.includes('hr manager') ||
        desig.includes('human resource') ||
        desig.includes('hr & admin') ||
        desig.includes('customer') ||
        desig.includes('client') ||
        dept === 'management' ||
        dept === 'finance' ||
        dept === 'hr' ||
        dept === 'customer' ||
        dept === 'administration' ||
        (dept === 'operations' && desig.includes('manager'))
      ) {
        throw new Error(`Cannot assign administrative or finance staff (${emp.name} - ${emp.designation}) as a project specialist.`);
      }
    }

    const project = projects[projectIndex];
    project.assignedUsers = project.assignedUsers || [];

    const newAssignment: ProjectUserAssignment = {
      id: `asgn-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      projectId,
      userId: assignmentData.userId,
      userName: assignmentData.userName,
      userEmail: assignmentData.userEmail || '',
      employeeCode: assignmentData.employeeCode || '',
      role: assignmentData.role,
      department: assignmentData.department || 'Operations',
      assignedAt: new Date().toISOString(),
      assignedBy: assignedByName,
      notes: assignmentData.notes || '',
      isActive: true
    };

    project.assignedUsers.push(newAssignment);

    // Sync matching stages if autoSync is true (default true)
    if (assignmentData.autoSyncStages !== false) {
      project.stages = project.stages.map(stg => {
        const matchesRole =
          stg.assignedRole === assignmentData.role ||
          (assignmentData.role === 'Site Survey Engineer' && (stg.stageKey === 'site_survey' || stg.assignedRole === 'Site Survey Engineer')) ||
          (assignmentData.role === 'Civil Team' && (stg.stageKey === 'civil_work' || stg.assignedRole === 'Civil Team')) ||
          (assignmentData.role === 'Structure Team' && (stg.stageKey === 'structure_fabrication' || stg.assignedRole === 'Structure Team')) ||
          (assignmentData.role === 'Installation Team' && (stg.stageKey === 'solar_installation' || stg.assignedRole === 'Installation Team')) ||
          (assignmentData.role === 'Electrical Team' && (stg.stageKey === 'ac_side_electrical' || stg.assignedRole === 'Electrical Team')) ||
          (assignmentData.role === 'Technician' && (stg.stageKey === 'final_verification' || stg.assignedRole === 'Technician')) ||
          (assignmentData.role === 'Service Manager' && (stg.stageKey === 'service_amc' || stg.assignedRole === 'Service Manager'));

        if (matchesRole) {
          return {
            ...stg,
            assignedEmployeeId: assignmentData.userId,
            assignedEmployeeName: assignmentData.userName,
            assignedToName: assignmentData.userName,
            assignedToId: assignmentData.userId
          };
        }
        return stg;
      });
    }

    project.updatedAt = new Date().toISOString();
    projects[projectIndex] = project;
    this.set(STORAGE_KEYS.PROJECTS, projects);

    this.addNotification({
      title: 'Project Specialist Assigned',
      message: `${assignmentData.userName} assigned as ${assignmentData.role} to ${project.title} (${project.projectCode}).`,
      type: 'INFO',
      linkType: 'PROJECT',
      linkId: projectId,
      projectId: projectId,
      projectName: project.title
    });

    return newAssignment;
  }

  updateProjectUserAssignment(
    projectId: string,
    assignmentId: string,
    updates: Partial<ProjectUserAssignment>,
    autoSyncStages: boolean = true
  ): boolean {
    const projects = this.getProjects();
    const projectIndex = projects.findIndex(p => p.id === projectId);
    if (projectIndex === -1) return false;

    const project = projects[projectIndex];
    if (!project.assignedUsers) return false;

    const asgnIndex = project.assignedUsers.findIndex(a => a.id === assignmentId);
    if (asgnIndex === -1) return false;

    if (updates.role === 'Accountant' || (updates.role as string) === 'Admin' || (updates.role as string) === 'HR Manager' || (updates.role as string) === 'Customer') {
      throw new Error(`Role "${updates.role}" is not an eligible project specialist role.`);
    }

    const existing = project.assignedUsers[asgnIndex];
    const updated: ProjectUserAssignment = {
      ...existing,
      ...updates
    };

    project.assignedUsers[asgnIndex] = updated;

    if (autoSyncStages && updated.isActive) {
      project.stages = project.stages.map(stg => {
        if (stg.assignedRole === updated.role) {
          return {
            ...stg,
            assignedEmployeeId: updated.userId,
            assignedEmployeeName: updated.userName,
            assignedToName: updated.userName,
            assignedToId: updated.userId
          };
        }
        return stg;
      });
    }

    project.updatedAt = new Date().toISOString();
    projects[projectIndex] = project;
    this.set(STORAGE_KEYS.PROJECTS, projects);
    return true;
  }

  removeUserFromProject(projectId: string, assignmentId: string): boolean {
    const projects = this.getProjects();
    const projectIndex = projects.findIndex(p => p.id === projectId);
    if (projectIndex === -1) return false;

    const project = projects[projectIndex];
    if (!project.assignedUsers) return false;

    const removed = project.assignedUsers.find(a => a.id === assignmentId);
    project.assignedUsers = project.assignedUsers.filter(a => a.id !== assignmentId);
    project.updatedAt = new Date().toISOString();

    projects[projectIndex] = project;
    this.set(STORAGE_KEYS.PROJECTS, projects);

    if (removed) {
      this.addNotification({
        title: 'Project Specialist Removed',
        message: `${removed.userName} removed from ${removed.role} role in ${project.title}.`,
        type: 'WARNING',
        linkType: 'PROJECT',
        linkId: projectId,
        projectId: projectId,
        projectName: project.title
      });
    }

    return true;
  }

  // Update a single stage within a project with automatic advancement logic
  updateProjectStage(
    projectId: string,
    stageIdOrKey: string,
    updates: Partial<ProjectStage>,
    actorName: string,
    actorRole: string
  ): SolarProject | null {
    const project = this.getProjectById(projectId);
    if (!project) return null;

    const stageIndex = project.stages.findIndex(s => s.id === stageIdOrKey || s.stageKey === stageIdOrKey);
    if (stageIndex === -1) return null;

    const currentStage = project.stages[stageIndex];

    // STRICT SEQUENTIAL ENFORCEMENT:
    // A stage cannot be marked COMPLETED or APPROVED if any prior stage is incomplete
    if (updates.status === 'COMPLETED' || updates.status === 'APPROVED') {
      for (let i = 0; i < stageIndex; i++) {
        const priorStage = project.stages[i];
        if (priorStage.status !== 'COMPLETED' && priorStage.status !== 'APPROVED') {
          console.warn(`Cannot complete stage "${currentStage.title}": Prior stage "${priorStage.title}" is not finished.`);
          return project;
        }
      }
    }

    const updatedStage: ProjectStage = {
      ...currentStage,
      ...updates
    };

    // If an action took place, log activity
    if (updates.status && updates.status !== currentStage.status) {
      updatedStage.activities = [
        ...(updatedStage.activities || []),
        {
          id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: new Date().toLocaleString(),
          user: actorName,
          role: actorRole,
          action: `Stage status changed from ${currentStage.status} to ${updates.status}`,
          details: updates.comments
        }
      ];
    }

    project.stages[stageIndex] = updatedStage;

    // BUSINESS LOGIC: AUTOMATIC SEQUENTIAL ADVANCEMENT
    // If a stage is marked COMPLETED or APPROVED, unlock ONLY the immediate next stage!
    if (
      (updates.status === 'COMPLETED' || updates.status === 'APPROVED') &&
      stageIndex + 1 < project.stages.length
    ) {
      const nextStage = project.stages[stageIndex + 1];
      if (nextStage.status === 'NOT STARTED') {
        nextStage.status = 'IN PROGRESS';
        nextStage.startDate = new Date().toISOString().split('T')[0];
        nextStage.dueDate = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
        nextStage.activities = [
          ...(nextStage.activities || []),
          {
            id: `act-${Date.now()}-auto-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: new Date().toLocaleString(),
            user: 'System Workflow Engine',
            role: 'Automation',
            action: `Automatically unlocked next stage: "${nextStage.title}" because previous stage "${updatedStage.title}" was completed.`
          }
        ];
        project.currentStageKey = nextStage.stageKey;

        // Notification
        this.addNotification({
          title: `Next Stage Unlocked: ${nextStage.title}`,
          message: `Stage "${updatedStage.title}" completed. "${nextStage.title}" is now active for ${project.customerName}.`,
          type: 'SUCCESS',
          linkType: 'PROJECT',
          linkId: project.id
        });
      }
    }

    // IF A STAGE IS REOPENED TO 'IN PROGRESS':
    // Subsequent stages (stageIndex + 1 onwards) must be reset back to NOT STARTED
    if (updates.status === 'IN PROGRESS') {
      project.currentStageKey = currentStage.stageKey;
      for (let j = stageIndex + 1; j < project.stages.length; j++) {
        if (project.stages[j].status === 'IN PROGRESS' || project.stages[j].status === 'COMPLETED' || project.stages[j].status === 'APPROVED') {
          project.stages[j].status = 'NOT STARTED';
          project.stages[j].actualEndDate = undefined;
          project.stages[j].completedDate = undefined;
          project.stages[j].approvedBy = undefined;
          project.stages[j].approvalDate = undefined;
        }
      }
    }

    // Recalculate Project Completion Percentage dynamically based on completed stages
    const totalStages = project.stages.length;
    const completedStages = project.stages.filter(s => s.status === 'COMPLETED' || s.status === 'APPROVED').length;
    project.completionPercentage = Math.round((completedStages / totalStages) * 100);
    project.progressPercentage = project.completionPercentage;

    // Project high-level status progression
    if (completedStages === totalStages) {
      project.status = 'COMPLETED';
      project.actualCompletionDate = new Date().toISOString().split('T')[0];
    } else if (project.stages.some(s => s.status === 'OVERDUE' || s.status === 'BLOCKED')) {
      project.status = 'DELAYED';
    } else if (completedStages === 0) {
      project.status = 'SURVEY';
    } else if (completedStages < 4) {
      project.status = 'DESIGN & APPROVALS';
    } else if (completedStages < 10) {
      project.status = 'CIVIL & STRUCTURE';
    } else {
      project.status = 'INSTALLATION';
    }

    this.saveProject(project);
    return project;
  }

  // Toggle checklist item within a stage
  toggleChecklistItem(
    projectId: string,
    stageIdOrKey: string,
    checkItemId: string,
    actorName: string,
    actorRole: string
  ): SolarProject | null {
    const project = this.getProjectById(projectId);
    if (!project) return null;

    const stage = project.stages.find(s => s.id === stageIdOrKey || s.stageKey === stageIdOrKey);
    if (!stage) return null;

    const item = stage.checklist.find(c => c.id === checkItemId);
    if (!item) return null;

    item.completed = !item.completed;
    item.completedAt = item.completed ? new Date().toISOString() : undefined;
    item.completedBy = item.completed ? actorName : undefined;

    stage.activities = stage.activities || [];
    stage.activities.push({
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toLocaleString(),
      user: actorName,
      role: actorRole,
      action: `${item.completed ? 'Checked' : 'Unchecked'} task: "${item.title}"`
    });

    // Note: Stage completion is NOT triggered automatically by checklist toggles.
    // It requires explicit user approval / completion with validation.
    this.saveProject(project);
    return project;
  }

  // --- Payments & Invoices ---
  getPayments(): PaymentRecord[] {
    return this.get<PaymentRecord[]>(STORAGE_KEYS.PAYMENTS, initialPayments);
  }

  savePayment(payment: PaymentRecord): void {
    const payments = this.getPayments();
    const index = payments.findIndex(p => p.id === payment.id);
    if (index >= 0) {
      payments[index] = payment;
    } else {
      payments.unshift(payment);
    }
    this.set(STORAGE_KEYS.PAYMENTS, payments, payment);
  }

  deletePayment(id: string): void {
    const payments = this.getPayments().filter(p => p.id !== id);
    this.set(STORAGE_KEYS.PAYMENTS, payments);
    this.deleteSync('payments', id);
  }

  // --- Expenses ---
  getExpenses(): ExpenseRecord[] {
    return this.get<ExpenseRecord[]>(STORAGE_KEYS.EXPENSES, initialExpenses);
  }

  saveExpense(expense: ExpenseRecord): void {
    const expenses = this.getExpenses();
    const index = expenses.findIndex(e => e.id === expense.id);
    if (index >= 0) {
      expenses[index] = expense;
    } else {
      expenses.unshift(expense);
    }
    this.set(STORAGE_KEYS.EXPENSES, expenses, expense);
  }

  deleteExpense(id: string): void {
    const expenses = this.getExpenses().filter(e => e.id !== id);
    this.set(STORAGE_KEYS.EXPENSES, expenses);
    this.deleteSync('expenses', id);
  }

  // --- Employees & HRMS ---
  getEmployees(): Employee[] {
    const list = this.get<Employee[]>(STORAGE_KEYS.EMPLOYEES, initialEmployees);
    const safeList = Array.isArray(list) ? list : initialEmployees;
    const DEFAULT_AUTH_MAP: Record<string, string> = {
      'emp-1': 'demo-usr-1',
      'emp-2': 'demo-usr-4',
      'emp-3': 'demo-usr-5',
      'emp-4': 'demo-usr-2',
      'emp-5': 'demo-usr-3',
      'emp-6': 'demo-usr-8',
      'emp-7': 'demo-usr-9',
      'emp-8': 'demo-usr-10',
      'emp-9': 'demo-usr-11',
      'emp-10': 'demo-usr-14',
      'emp-11': 'demo-usr-12',
      'emp-12': 'demo-usr-13',
      'emp-13': 'demo-usr-6',
      'emp-14': 'demo-usr-7'
    };

    const employeeMap = new Map<string, Employee>();

    safeList.filter(Boolean).forEach(emp => {
      const defaultAuthUid = emp?.id ? DEFAULT_AUTH_MAP[emp.id] : undefined;
      const authUid = emp.authUid || defaultAuthUid;
      const salaryMonthly = Number(emp.salaryMonthly ?? (emp as any).salary_monthly ?? (emp as any).salary) || 0;
      const safeEmp: Employee = {
        ...emp,
        name: emp.name || 'Employee',
        employeeCode: emp.employeeCode || emp.id || 'EMP-001',
        department: emp.department || 'Operations',
        designation: emp.designation || 'Staff',
        salaryMonthly,
        authUid,
        loginEnabled: typeof emp.loginEnabled === 'boolean' ? emp.loginEnabled : true,
        systemRole: emp.systemRole || emp.assignedRole || 'Project Manager',
        accountStatus: (emp.status === 'TERMINATED' ? 'DISABLED' : (emp.accountStatus || 'ACTIVE')) as Employee['accountStatus']
      };
      employeeMap.set(safeEmp.id, safeEmp);
      if (safeEmp.email) employeeMap.set(safeEmp.email.toLowerCase(), safeEmp);
    });

    // Merge in users from STORAGE_KEYS.USERS who are staff members (not Customer)
    const users = this.get<any[]>(STORAGE_KEYS.USERS, []);
    (users || []).filter(Boolean).forEach(u => {
      if (u.role === 'Customer') return;
      const uEmail = (u.email || '').toLowerCase().trim();
      const existingByEmail = uEmail ? employeeMap.get(uEmail) : null;
      const existingById = employeeMap.get(u.id);
      if (!existingByEmail && !existingById) {
        const isFw = Boolean(u.isFieldWorker || [
          'Site Survey Engineer', 'Site Inspector', 'Civil Team',
          'Structure Team', 'Installation Team', 'Electrical Team', 'Technician'
        ].includes(u.role));
        const syntheticEmp: Employee = {
          id: u.id,
          employeeCode: u.employeeId || u.employeeCode || `EMP-${u.id.slice(-4).toUpperCase()}`,
          name: u.name || 'Staff Member',
          email: u.email,
          phone: u.phone || '+91 98250 11223',
          department: u.department || 'Operations',
          designation: u.designation || u.role || 'Solar Specialist',
          systemRole: u.role || 'Project Manager',
          salaryMonthly: 0,
          status: (u.status === 'INACTIVE' || u.status === 'DISABLED') ? 'INACTIVE' : 'ACTIVE',
          accountStatus: (u.status === 'INACTIVE' || u.status === 'DISABLED') ? 'DISABLED' : 'ACTIVE',
          loginEnabled: u.status !== 'DISABLED',
          isFieldWorker: isFw,
          currentSiteLocation: '',
          joiningDate: u.createdAt ? String(u.createdAt).slice(0, 10) : new Date().toISOString().slice(0, 10)
        };
        employeeMap.set(u.id, syntheticEmp);
        if (uEmail) employeeMap.set(uEmail, syntheticEmp);
      }
    });

    const result: Employee[] = [];
    const seenIds = new Set<string>();
    employeeMap.forEach(emp => {
      if (!seenIds.has(emp.id)) {
        seenIds.add(emp.id);
        result.push(emp);
      }
    });
    return result;
  }

  saveEmployee(emp: Employee): void {
    const employees = this.getEmployees();
    const validation = validateEmployee(emp, employees, emp.id);
    assertValid(validation);

    const index = employees.findIndex(e => e.id === emp.id);
    if (index >= 0) {
      employees[index] = emp;
    } else {
      employees.unshift(emp);
    }
    this.set(STORAGE_KEYS.EMPLOYEES, employees, emp);
  }

  saveEmployees(employees: Employee[]): void {
    this.set(STORAGE_KEYS.EMPLOYEES, employees);
  }

  deleteEmployee(id: string): void {
    const employees = this.getEmployees().filter(e => e.id !== id);
    this.set(STORAGE_KEYS.EMPLOYEES, employees);
    this.deleteSync('employees', id);
    if (typeof fetch !== 'undefined') {
      fetch(`/api/employees/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
      fetch(`/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
    }
  }

  // --- Users & Credentials ---
  getUsers(): any[] {
    return this.get<any[]>(STORAGE_KEYS.USERS, []);
  }

  saveUser(user: any): void {
    const users = this.getUsers();
    const index = users.findIndex(u => u.id === user.id || (user.email && u.email?.toLowerCase() === user.email?.toLowerCase()));
    if (index >= 0) {
      users[index] = { ...users[index], ...user, updatedAt: new Date().toISOString() };
    } else {
      users.unshift({ ...user, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    this.set(STORAGE_KEYS.USERS, users, user);
  }

  deleteUser(id: string): void {
    const users = this.getUsers().filter(u => u.id !== id);
    this.set(STORAGE_KEYS.USERS, users);
    this.deleteSync('users', id);
    if (typeof fetch !== 'undefined') {
      fetch(`/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
    }
  }

  // --- Attendance ---
  getAttendance(): AttendanceRecord[] {
    const list = this.get<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, initialAttendance);
    const safeList = Array.isArray(list) ? list : initialAttendance;
    return safeList.filter(Boolean).map(a => ({
      ...a,
      date: a.date || (a as any).attendanceDate || ((a as any).createdAt ? String((a as any).createdAt).slice(0, 10) : new Date().toISOString().slice(0, 10)),
      attendanceDate: (a as any).attendanceDate || a.date
    }));
  }

  saveAttendanceRecord(record: AttendanceRecord): void {
    const attendance = this.getAttendance();
    const index = attendance.findIndex(a => a.id === record.id);
    if (index >= 0) {
      attendance[index] = record;
    } else {
      attendance.unshift(record);
    }
    this.set(STORAGE_KEYS.ATTENDANCE, attendance, record);
  }

  recordAttendance(record: AttendanceRecord): void {
    this.saveAttendanceRecord(record);
  }

  deleteAttendanceRecord(id: string): void {
    const attendance = this.getAttendance().filter(a => a.id !== id);
    this.set(STORAGE_KEYS.ATTENDANCE, attendance);
    this.deleteSync('attendance', id);
  }

  // --- Payroll / Payslips ---
  getPayslips(): Payslip[] {
    const list = this.get<Payslip[]>(STORAGE_KEYS.PAYSLIPS, initialPayslips);
    const safeList = Array.isArray(list) ? list : initialPayslips;
    return safeList.filter(Boolean).map(p => {
      const baseSalary = Number((p as any).baseSalary ?? (p as any).basicSalary ?? (p as any).basic_salary) || 0;
      const overtimeAmount = Number((p as any).overtimeAmount ?? (p as any).allowances) || 0;
      const totalAdditionalExpenses = Number((p as any).totalAdditionalExpenses) || 0;
      const deductionsArr = Array.isArray(p.deductions) ? p.deductions : [];
      const totalDeductions = Number((p as any).totalDeductions ?? (typeof (p as any).deductions === 'number' ? (p as any).deductions : 0)) || 0;
      const grossEarnings = Number((p as any).grossEarnings ?? (baseSalary + overtimeAmount + totalAdditionalExpenses)) || 0;
      const netPay = Number((p as any).netPay ?? (p as any).netSalary ?? (p as any).net_salary ?? (grossEarnings - totalDeductions)) || 0;

      return {
        ...p,
        payslipNumber: p.payslipNumber || p.id || 'PS-001',
        employeeId: p.employeeId || '',
        employeeCode: p.employeeCode || '',
        employeeName: p.employeeName || 'Employee',
        department: p.department || 'Operations',
        designation: p.designation || 'Specialist',
        month: p.month || getCurrentSalaryMonth(),
        generatedDate: p.generatedDate || new Date().toISOString().slice(0, 10),
        baseSalary,
        overtimeType: p.overtimeType || 'DIRECT',
        overtimeHours: p.overtimeHours ?? 0,
        overtimeRatePerHour: p.overtimeRatePerHour ?? 0,
        overtimeAmount,
        additionalExpenses: Array.isArray(p.additionalExpenses) ? p.additionalExpenses : [],
        totalAdditionalExpenses,
        deductions: deductionsArr,
        totalDeductions,
        grossEarnings,
        netPay,
        status: (p.status as any) || ((p as any).paymentStatus === 'PAID' ? 'PAID' : 'GENERATED')
      };
    });
  }

  savePayslip(payslip: Payslip): void {
    const payslips = this.getPayslips();
    const index = payslips.findIndex(p => p.id === payslip.id);
    if (index >= 0) {
      payslips[index] = payslip;
    } else {
      payslips.unshift(payslip);
    }
    this.set(STORAGE_KEYS.PAYSLIPS, payslips, payslip);
  }

  deletePayslip(id: string): void {
    const payslips = this.getPayslips().filter(p => p.id !== id);
    this.set(STORAGE_KEYS.PAYSLIPS, payslips);
    this.deleteSync('payslips', id);
  }

  // --- Holidays ---
  getHolidays(): HolidayRecord[] {
    return this.get<HolidayRecord[]>(STORAGE_KEYS.HOLIDAYS, initialHolidays);
  }

  saveHoliday(holiday: HolidayRecord): void {
    const holidays = this.getHolidays();
    const index = holidays.findIndex(h => h.id === holiday.id);
    if (index >= 0) {
      holidays[index] = holiday;
    } else {
      holidays.push(holiday);
    }
    // Sort by date ascending
    holidays.sort((a, b) => a.date.localeCompare(b.date));
    this.set(STORAGE_KEYS.HOLIDAYS, holidays, holiday);
  }

  deleteHoliday(id: string): void {
    const holidays = this.getHolidays().filter(h => h.id !== id);
    this.set(STORAGE_KEYS.HOLIDAYS, holidays);
    this.deleteSync('holidays', id);
  }

  resetStandardHolidays(): void {
    this.set(STORAGE_KEYS.HOLIDAYS, initialHolidays);
  }

  // --- Service & AMC ---
  getServiceTickets(): ServiceTicket[] {
    return this.get<ServiceTicket[]>(STORAGE_KEYS.SERVICE_TICKETS, initialServiceTickets);
  }

  saveServiceTicket(ticket: ServiceTicket): void {
    const tickets = this.getServiceTickets();
    const index = tickets.findIndex(t => t.id === ticket.id);
    if (index >= 0) {
      tickets[index] = ticket;
    } else {
      tickets.unshift(ticket);
    }
    this.set(STORAGE_KEYS.SERVICE_TICKETS, tickets, ticket);
  }

  deleteServiceTicket(id: string): void {
    const tickets = this.getServiceTickets().filter(t => t.id !== id);
    this.set(STORAGE_KEYS.SERVICE_TICKETS, tickets);
    this.deleteSync('service_tickets', id);
  }

  resolveServiceTicket(ticketId: string, resolutionNotes?: string): void {
    const tickets = this.getServiceTickets();
    const index = tickets.findIndex(t => t.id === ticketId || t.ticketId === ticketId);
    if (index >= 0) {
      tickets[index] = {
        ...tickets[index],
        status: 'RESOLVED',
        resolvedDate: new Date().toISOString().slice(0, 10),
        notes: resolutionNotes ? `${tickets[index].notes ? tickets[index].notes + ' | ' : ''}Resolved: ${resolutionNotes}` : tickets[index].notes
      };
      this.set(STORAGE_KEYS.SERVICE_TICKETS, tickets, tickets[index]);
    }
  }

  getRecentActivities(limit: number = 8): Array<{ id: string; action: string; details: string; userName: string; timestamp: string }> {
    const activities: Array<{ id: string; action: string; details: string; userName: string; timestamp: string }> = [];
    const projects = this.getProjects();
    (projects || []).forEach(p => {
      if (!p || !p.stages) return;
      (p.stages || []).forEach(s => {
        if (!s) return;
        (s.activities || []).forEach((a, aIdx) => {
          if (!a) return;
          // Guarantee unique key across any project, stage, or activity
          const uniqueId = a.id && a.id.startsWith(p.id) ? a.id : `${p.id}-${s.stageKey}-${a.id || aIdx}`;
          activities.push({
            id: uniqueId,
            action: `${p.projectCode || p.id} • ${s.title || ''}: ${a.action || ''}`,
            details: a.details || `${s.title || 'Stage'} updated`,
            userName: a.user || 'Team Member',
            timestamp: a.timestamp || new Date().toISOString()
          });
        });
      });
    });

    return activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, limit);
  }

  getAMCContracts(): AMCContract[] {
    return this.get<AMCContract[]>(STORAGE_KEYS.AMC_CONTRACTS, initialAMCContracts);
  }

  saveAMCContract(contract: AMCContract): void {
    const contracts = this.getAMCContracts();
    const index = contracts.findIndex(c => c.id === contract.id);
    if (index >= 0) {
      contracts[index] = contract;
    } else {
      contracts.unshift(contract);
    }
    this.set(STORAGE_KEYS.AMC_CONTRACTS, contracts, contract);
  }

  deleteAMCContract(id: string): void {
    const contracts = this.getAMCContracts().filter(c => c.id !== id);
    this.set(STORAGE_KEYS.AMC_CONTRACTS, contracts);
    this.deleteSync('amc_contracts', id);
  }

  // --- Site Surveys ---
  getSurveys(): SiteSurveyData[] {
    return this.get<SiteSurveyData[]>(STORAGE_KEYS.SURVEYS, initialSurveys);
  }

  saveSurvey(survey: SiteSurveyData): void {
    const surveys = this.getSurveys();
    const index = surveys.findIndex(s => s.id === survey.id);
    if (index >= 0) {
      surveys[index] = survey;
    } else {
      surveys.unshift(survey);
    }
    this.set(STORAGE_KEYS.SURVEYS, surveys, survey);
  }

  deleteSurvey(id: string): void {
    const surveys = this.getSurveys().filter(s => s.id !== id);
    this.set(STORAGE_KEYS.SURVEYS, surveys);
    this.deleteSync('surveys', id);
  }

  // --- Quotations ---
  getQuotations(): Quotation[] {
    const list = this.get<Quotation[]>(STORAGE_KEYS.QUOTATIONS, initialQuotations);
    const safeList = Array.isArray(list) ? list : initialQuotations;
    return safeList.filter(Boolean).map(q => ({
      ...q,
      quotationDate: q.quotationDate || (q as any).quotation_date || (q.createdAt ? String(q.createdAt).slice(0, 10) : new Date().toISOString().slice(0, 10))
    }));
  }

  getQuotationById(id: string): Quotation | undefined {
    return this.getQuotations().find(q => q.id === id || q.quotationNumber === id);
  }

  saveQuotation(quote: Quotation): void {
    const quotes = this.getQuotations();
    const index = quotes.findIndex(q => q.id === quote.id);
    if (index >= 0) {
      quotes[index] = quote;
    } else {
      quotes.unshift(quote);
    }
    this.set(STORAGE_KEYS.QUOTATIONS, quotes, quote);
  }

  deleteQuotation(id: string): void {
    const quotes = this.getQuotations().filter(q => q.id !== id);
    this.set(STORAGE_KEYS.QUOTATIONS, quotes);
    this.deleteSync('quotations', id);
  }

  getNextQuotationNumber(): string {
    const quotes = this.getQuotations();
    const year = new Date().getFullYear();
    const fySuffix = (year + 1).toString().slice(-2);
    const prefix = `RSP/QTN/${year}-${fySuffix}/`;
    let maxNum = 0;
    quotes.forEach(q => {
      if (q.quotationNumber) {
        // Match numbers at the end of RSP/QTN/2026-27/0010 or QTN-2026-0010
        const match = q.quotationNumber.match(/(\d+)$/);
        if (match) {
          const n = parseInt(match[1], 10);
          if (!isNaN(n) && n > maxNum) {
            maxNum = n;
          }
        }
      }
    });
    const nextVal = (maxNum > 0 ? maxNum + 1 : 10).toString().padStart(4, '0');
    return `${prefix}${nextVal}`;
  }

  // --- Notifications ---
  getNotifications(): AppNotification[] {
    return this.get<AppNotification[]>(STORAGE_KEYS.NOTIFICATIONS, initialNotifications);
  }

  addNotification(notif: Omit<AppNotification, 'id' | 'timestamp' | 'read'>): void {
    const notifications = this.getNotifications();
    const newNotif = {
      ...notif,
      id: `notif-${Date.now()}`,
      timestamp: new Date().toLocaleString(),
      read: false
    };
    notifications.unshift(newNotif);
    this.set(STORAGE_KEYS.NOTIFICATIONS, notifications, newNotif);
  }

  markNotificationAsRead(id: string): void {
    const notifications = this.getNotifications().map(n => n.id === id ? { ...n, read: true } : n);
    this.set(STORAGE_KEYS.NOTIFICATIONS, notifications);
  }

  markAllNotificationsAsRead(): void {
    const notifications = this.getNotifications().map(n => ({ ...n, read: true }));
    this.set(STORAGE_KEYS.NOTIFICATIONS, notifications);
  }

  // --- Settings ---
  getSettings(): SystemSettings {
    const settings = this.get<SystemSettings>(STORAGE_KEYS.SETTINGS, initialSettings);
    if (!settings.logoUrl) {
      settings.logoUrl = initialSettings.logoUrl || '/logo-dark.png';
    }
    return settings;
  }

  saveSettings(settings: SystemSettings): void {
    this.set(STORAGE_KEYS.SETTINGS, settings, settings);
  }

  // ==========================================
  // Products & Inventory Management
  // ==========================================
  getProducts(): ProductItem[] {
    return this.get<ProductItem[]>(STORAGE_KEYS.PRODUCTS, initialProducts);
  }

  saveProduct(product: ProductItem): void {
    const products = this.getProducts();
    const validation = validateProduct(product, products, product.id);
    assertValid(validation);

    const idx = products.findIndex(p => p.id === product.id);
    if (idx >= 0) {
      products[idx] = { ...product, updatedAt: new Date().toISOString() };
    } else {
      products.unshift({
        ...product,
        id: product.id || `prod-${Date.now()}`,
        createdAt: product.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    this.set(STORAGE_KEYS.PRODUCTS, products, product);
  }

  deleteProduct(id: string): void {
    const products = this.getProducts().filter(p => p.id !== id);
    this.set(STORAGE_KEYS.PRODUCTS, products);
    this.deleteSync('products', id);
  }

  adjustStock(
    productId: string,
    newQty: number,
    reason: string,
    performedBy: string = 'Operations Team',
    warehouseId?: string,
    warehouseName?: string
  ): void {
    const products = this.getProducts();
    const prod = products.find(p => p.id === productId);
    if (!prod) return;

    const warehouses = this.getWarehouses();
    const wh = warehouseId ? warehouses.find(w => w.id === warehouseId) : this.getDefaultWarehouse();
    const targetWhId = warehouseId || wh?.id || 'wh-1';
    const targetWhName = warehouseName || wh?.name || 'Central Solar Logistics Hub - Pune';

    prod.warehouseStocks = prod.warehouseStocks || {};
    const previousWhQty = prod.warehouseStocks[targetWhId] ?? prod.currentStock;
    const diff = newQty - previousWhQty;

    prod.warehouseStocks[targetWhId] = Math.max(0, newQty);
    
    // Total current stock updated
    const previousTotal = prod.currentStock;
    prod.currentStock = Math.max(0, previousTotal + diff);
    prod.updatedAt = new Date().toISOString();
    this.set(STORAGE_KEYS.PRODUCTS, products, prod);

    const isAudit = reason.toLowerCase().includes('audit') || reason.toLowerCase().includes('physical');

    this.addStockMovement({
      productId: prod.id,
      productName: prod.name,
      sku: prod.sku,
      movementType: isAudit ? 'AUDIT_RECONCILIATION' : 'ADJUSTMENT',
      quantity: diff,
      balanceAfter: prod.currentStock,
      warehouseId: targetWhId,
      warehouseName: targetWhName,
      notes: reason || `Inventory count adjustment at ${targetWhName} from ${previousWhQty} to ${newQty}`,
      performedBy
    });
  }

  // ==========================================
  // Vendor Management
  // ==========================================
  getVendors(): Vendor[] {
    return this.get<Vendor[]>(STORAGE_KEYS.VENDORS, initialVendors);
  }

  saveVendor(vendor: Vendor): void {
    const vendors = this.getVendors();
    const validation = validateVendor(vendor, vendors, vendor.id);
    assertValid(validation);

    const idx = vendors.findIndex(v => v.id === vendor.id);
    if (idx >= 0) {
      vendors[idx] = { ...vendor, updatedAt: new Date().toISOString() };
    } else {
      vendors.unshift({
        ...vendor,
        id: vendor.id || `vnd-${Date.now()}`,
        createdAt: vendor.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    this.set(STORAGE_KEYS.VENDORS, vendors, vendor);
  }

  deleteVendor(id: string): void {
    const vendors = this.getVendors().filter(v => v.id !== id);
    this.set(STORAGE_KEYS.VENDORS, vendors);
    this.deleteSync('vendors', id);
  }

  // ==========================================
  // Purchase Entry & Purchase Orders
  // ==========================================
  getPurchaseOrders(): PurchaseOrder[] {
    const orders = this.get<PurchaseOrder[]>(STORAGE_KEYS.PURCHASE_ORDERS, initialPurchaseOrders);
    return orders.map(order => {
      const items: PurchaseLineItem[] = (order.items || []).map((item, idx) => {
        const orderedQty = Math.max(0, Number(item.orderedQuantity ?? item.quantity ?? 0));
        let receivedQty = Math.max(0, Number(item.receivedQuantity ?? 0));
        if (item.receivedQuantity === undefined && (order.status === 'RECEIVED' || order.stockUpdated)) {
          receivedQty = orderedQty;
        }
        const pendingQty = Math.max(0, Number(item.pendingQuantity ?? Math.max(0, orderedQty - receivedQty)));
        const rejectedQty = Math.max(0, Number(item.rejectedQuantity ?? 0));
        const unitPrice = Math.max(0, Number(item.unitPrice || 0));
        const taxPercent = Math.max(0, Number(item.taxPercent ?? item.taxRatePercent ?? 12));
        const taxAmount = Math.round((orderedQty * unitPrice * taxPercent) / 100);
        const totalAmount = (orderedQty * unitPrice) + taxAmount;

        return {
          ...item,
          id: item.id || `poi-${order.id}-${idx}`,
          orderedQuantity: orderedQty,
          receivedQuantity: receivedQty,
          pendingQuantity: pendingQty,
          rejectedQuantity: rejectedQty,
          unitPrice,
          taxPercent,
          taxAmount,
          totalAmount,
          quantity: orderedQty,
          taxRatePercent: taxPercent,
          totalPrice: totalAmount
        };
      });

      return {
        ...order,
        items,
        deliveryReceipts: order.deliveryReceipts || []
      };
    });
  }

  savePurchaseOrder(order: PurchaseOrder, _autoSyncStock: boolean = false, _performedBy: string = 'Purchase Manager'): void {
    const orders = this.getPurchaseOrders();
    const validation = validatePurchaseOrder(order, orders, order.id);
    assertValid(validation);

    const idx = orders.findIndex(o => o.id === order.id);

    // Compute accurate line-item totals and derived quantities
    const items: PurchaseLineItem[] = (order.items || []).map((item, i) => {
      const orderedQty = Math.max(0, Number(item.orderedQuantity ?? item.quantity ?? 0));
      const receivedQty = Math.max(0, Number(item.receivedQuantity ?? 0));
      const pendingQty = Math.max(0, orderedQty - receivedQty);
      const rejectedQty = Math.max(0, Number(item.rejectedQuantity ?? 0));
      const unitPrice = Math.max(0, Number(item.unitPrice || 0));
      const taxPercent = Math.max(0, Number(item.taxPercent ?? item.taxRatePercent ?? 12));
      const taxAmount = Math.round((orderedQty * unitPrice * taxPercent) / 100);
      const totalAmount = (orderedQty * unitPrice) + taxAmount;

      return {
        ...item,
        id: item.id || `poi-${Date.now()}-${i}`,
        orderedQuantity: orderedQty,
        receivedQuantity: receivedQty,
        pendingQuantity: pendingQty,
        rejectedQuantity: rejectedQty,
        unitPrice,
        taxPercent,
        taxAmount,
        totalAmount,
        quantity: orderedQty,
        taxRatePercent: taxPercent,
        totalPrice: totalAmount
      };
    });

    const subtotal = items.reduce((sum, it) => sum + (it.orderedQuantity * it.unitPrice), 0);
    const taxAmount = items.reduce((sum, it) => sum + it.taxAmount, 0);
    const totalAmount = subtotal + taxAmount;

    // Determine accurate status based on received vs ordered
    let status = order.status;
    if (status !== 'CANCELLED' && status !== 'DRAFT') {
      const allReceived = items.length > 0 && items.every(it => it.receivedQuantity >= it.orderedQuantity);
      const anyReceived = items.some(it => it.receivedQuantity > 0);
      if (allReceived) {
        status = 'RECEIVED';
      } else if (anyReceived) {
        status = 'PARTIALLY_RECEIVED';
      } else {
        status = 'ORDERED';
      }
    }

    const updatedOrder: PurchaseOrder = {
      ...order,
      items,
      subtotal,
      taxAmount,
      totalAmount,
      status,
      deliveryReceipts: order.deliveryReceipts || [],
      updatedAt: new Date().toISOString()
    };

    if (!updatedOrder.id) {
      updatedOrder.id = `po-${Date.now()}`;
      updatedOrder.createdAt = new Date().toISOString();
    }

    if (idx >= 0) {
      orders[idx] = updatedOrder;
    } else {
      orders.unshift(updatedOrder);
    }
    this.set(STORAGE_KEYS.PURCHASE_ORDERS, orders, updatedOrder);
  }

  recordPurchaseReceipt(
    orderId: string,
    receiptInput: {
      receiptDate: string;
      deliveryChallanNo?: string;
      transporterName?: string;
      receivedBy: string;
      notes?: string;
      items: {
        lineItemId: string;
        receivedQuantity: number;
        rejectedQuantity?: number;
        rejectionReason?: string;
        isExcessApproved?: boolean;
        excessApprovalReason?: string;
      }[];
    },
    performedBy: string = 'Store Incharge'
  ): PurchaseOrder | null {
    const orders = this.getPurchaseOrders();
    const order = orders.find(o => o.id === orderId);
    if (!order) return null;

    const products = this.getProducts();
    const receiptId = `grn-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const receiptNumber = `GRN-${new Date().getFullYear()}-${String((order.deliveryReceipts?.length || 0) + 1).padStart(3, '0')}`;

    const receiptItems: DeliveryReceiptItem[] = [];

    receiptInput.items.forEach(inputItem => {
      const lineItem = order.items.find(it => it.id === inputItem.lineItemId);
      if (!lineItem) return;

      const arrivingQty = Math.max(0, Number(inputItem.receivedQuantity || 0));
      const rejectedQty = Math.max(0, Number(inputItem.rejectedQuantity || 0));

      if (arrivingQty > 0 || rejectedQty > 0) {
        receiptItems.push({
          lineItemId: lineItem.id,
          productId: lineItem.productId,
          productName: lineItem.productName,
          sku: lineItem.sku,
          unit: lineItem.unit,
          receivedQuantity: arrivingQty,
          rejectedQuantity: rejectedQty,
          rejectionReason: inputItem.rejectionReason,
          isExcessApproved: inputItem.isExcessApproved,
          excessApprovalReason: inputItem.excessApprovalReason
        });
      }

      // Increase stock in warehouse ONLY for arrivingQty
      if (arrivingQty > 0) {
        const prod = products.find(p => p.id === lineItem.productId || p.sku === lineItem.sku);
        if (prod) {
          prod.currentStock += arrivingQty;
          if (order.warehouseId) {
            prod.warehouseStocks = prod.warehouseStocks || {};
            prod.warehouseStocks[order.warehouseId] = (prod.warehouseStocks[order.warehouseId] || 0) + arrivingQty;
          }
          prod.updatedAt = new Date().toISOString();
          this.addStockMovement({
            productId: prod.id,
            productName: prod.name,
            sku: prod.sku,
            movementType: 'PURCHASE_RECEIPT',
            quantity: arrivingQty,
            balanceAfter: prod.currentStock,
            warehouseId: order.warehouseId,
            warehouseName: order.warehouseName,
            referenceId: order.id,
            referenceNumber: order.purchaseNumber,
            notes: `Goods Receipt ${receiptNumber}${receiptInput.deliveryChallanNo ? ' (DC: ' + receiptInput.deliveryChallanNo + ')' : ''} from ${order.vendorName}${order.warehouseName ? ' into ' + order.warehouseName : ''}`,
            performedBy: performedBy || receiptInput.receivedBy
          });
        }
      }

      // Update line item accumulators
      lineItem.receivedQuantity = (lineItem.receivedQuantity || 0) + arrivingQty;
      lineItem.rejectedQuantity = (lineItem.rejectedQuantity || 0) + rejectedQty;
      lineItem.pendingQuantity = Math.max(0, lineItem.orderedQuantity - lineItem.receivedQuantity);
      lineItem.quantity = lineItem.orderedQuantity;
    });

    // Save updated products to storage
    this.set(STORAGE_KEYS.PRODUCTS, products);

    // Create the receipt record
    const newReceipt: PurchaseDeliveryReceipt = {
      id: receiptId,
      receiptNumber,
      receiptDate: receiptInput.receiptDate || new Date().toISOString().slice(0, 10),
      deliveryChallanNo: receiptInput.deliveryChallanNo,
      transporterName: receiptInput.transporterName,
      receivedBy: receiptInput.receivedBy || performedBy,
      notes: receiptInput.notes,
      items: receiptItems,
      createdAt: new Date().toISOString()
    };

    if (!order.deliveryReceipts) {
      order.deliveryReceipts = [];
    }
    order.deliveryReceipts.unshift(newReceipt);

    // Determine updated order status
    const allReceived = order.items.length > 0 && order.items.every(it => it.receivedQuantity >= it.orderedQuantity);
    const anyReceived = order.items.some(it => it.receivedQuantity > 0);

    if (allReceived) {
      order.status = 'RECEIVED';
      order.receivedDate = receiptInput.receiptDate || new Date().toISOString().slice(0, 10);
    } else if (anyReceived) {
      order.status = 'PARTIALLY_RECEIVED';
    }

    order.stockUpdated = anyReceived;
    order.updatedAt = new Date().toISOString();

    this.set(STORAGE_KEYS.PURCHASE_ORDERS, orders);
    return order;
  }

  receivePurchaseOrder(id: string, performedBy: string = 'Store Incharge'): void {
    const orders = this.getPurchaseOrders();
    const order = orders.find(o => o.id === id);
    if (!order) return;

    // Collect all pending items to receive
    const pendingItemsToReceive = order.items.map(it => ({
      lineItemId: it.id,
      receivedQuantity: it.pendingQuantity > 0 ? it.pendingQuantity : (it.receivedQuantity === 0 ? it.orderedQuantity : 0),
      rejectedQuantity: 0
    })).filter(it => it.receivedQuantity > 0);

    if (pendingItemsToReceive.length > 0) {
      this.recordPurchaseReceipt(
        id,
        {
          receiptDate: new Date().toISOString().slice(0, 10),
          deliveryChallanNo: order.invoiceReference || 'Direct Delivery',
          receivedBy: performedBy,
          notes: 'Full goods delivery receipt recorded',
          items: pendingItemsToReceive
        },
        performedBy
      );
    } else {
      order.status = 'RECEIVED';
      order.stockUpdated = true;
      order.updatedAt = new Date().toISOString();
      this.set(STORAGE_KEYS.PURCHASE_ORDERS, orders);
    }
  }

  deletePurchaseOrder(id: string): void {
    const orders = this.getPurchaseOrders().filter(o => o.id !== id);
    this.set(STORAGE_KEYS.PURCHASE_ORDERS, orders);
    this.deleteSync('purchase_orders', id);
  }

  // ==========================================
  // Bill of Materials (BOM)
  // ==========================================
  getBOMs(): BillOfMaterials[] {
    return this.get<BillOfMaterials[]>(STORAGE_KEYS.BOMS, initialBOMs);
  }

  saveBOM(bom: BillOfMaterials): void {
    const boms = this.getBOMs();
    const validation = validateBOM(bom, boms, bom.id);
    assertValid(validation);

    const idx = boms.findIndex(b => b.id === bom.id);
    if (idx >= 0) {
      boms[idx] = { ...bom, updatedAt: new Date().toISOString() };
    } else {
      boms.unshift({
        ...bom,
        id: bom.id || `bom-${Date.now()}`,
        createdAt: bom.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    this.set(STORAGE_KEYS.BOMS, boms, bom);
  }

  allocateBOMStock(bomId: string, performedBy: string = 'Project Engineer'): boolean {
    const boms = this.getBOMs();
    const bom = boms.find(b => b.id === bomId);
    if (!bom) return false;

    const products = this.getProducts();
    let hasUpdatedStock = false;

    bom.items.forEach(item => {
      const prod = products.find(p => p.id === item.productId || p.sku === item.sku);
      if (prod && item.requiredQty > 0) {
        const alloc = Math.min(item.requiredQty, prod.currentStock);
        prod.currentStock = Math.max(0, prod.currentStock - item.requiredQty);
        if (bom.warehouseId) {
          prod.warehouseStocks = prod.warehouseStocks || {};
          prod.warehouseStocks[bom.warehouseId] = Math.max(0, (prod.warehouseStocks[bom.warehouseId] || prod.currentStock) - item.requiredQty);
        }
        item.allocatedQty = item.requiredQty;
        item.status = 'ALLOCATED';
        hasUpdatedStock = true;

        this.addStockMovement({
          productId: prod.id,
          productName: prod.name,
          sku: prod.sku,
          movementType: 'BOM_ALLOCATION',
          quantity: -item.requiredQty,
          balanceAfter: prod.currentStock,
          warehouseId: bom.warehouseId,
          warehouseName: bom.warehouseName,
          referenceId: bom.id,
          referenceNumber: bom.bomNumber,
          notes: `BOM allocation for ${bom.projectTitle} (${bom.customerName})${bom.warehouseName ? ' from ' + bom.warehouseName : ''}`,
          performedBy
        });
      }
    });

    if (hasUpdatedStock) {
      this.set(STORAGE_KEYS.PRODUCTS, products);
      bom.stockAllocated = true;
      if (bom.status === 'DRAFT') {
        bom.status = 'APPROVED';
      }
      bom.updatedAt = new Date().toISOString();
      this.set(STORAGE_KEYS.BOMS, boms);
      return true;
    }

    return false;
  }

  deleteBOM(id: string): void {
    const boms = this.getBOMs().filter(b => b.id !== id);
    this.set(STORAGE_KEYS.BOMS, boms);
    this.deleteSync('boms', id);
  }

  // ==========================================
  // Sales Invoices
  // ==========================================
  getSalesInvoices(): SalesInvoice[] {
    return this.get<SalesInvoice[]>(STORAGE_KEYS.SALES_INVOICES, initialSalesInvoices);
  }

  saveSalesInvoice(invoice: SalesInvoice, deductStockNow: boolean = false, performedBy: string = 'Accounts Officer'): void {
    const invoices = this.getSalesInvoices();
    const idx = invoices.findIndex(i => i.id === invoice.id);

    let updated = { ...invoice, updatedAt: new Date().toISOString() };
    if (!updated.id) {
      updated.id = `inv-${Date.now()}`;
      updated.createdAt = new Date().toISOString();
    }

    const shouldDeduct = (deductStockNow || updated.deductStock) && !updated.stockDeducted;

    if (shouldDeduct) {
      const products = this.getProducts();
      let deductedAny = false;

      updated.items.forEach(item => {
        if (item.productId && item.quantity > 0) {
          const prod = products.find(p => p.id === item.productId);
          if (prod) {
            prod.currentStock = Math.max(0, prod.currentStock - item.quantity);
            prod.updatedAt = new Date().toISOString();
            deductedAny = true;

            this.addStockMovement({
              productId: prod.id,
              productName: prod.name,
              sku: prod.sku,
              movementType: 'INVOICE_SALE',
              quantity: -item.quantity,
              balanceAfter: prod.currentStock,
              referenceId: updated.id,
              referenceNumber: updated.invoiceNumber,
              notes: `Dispatched to ${updated.customerName} via Invoice ${updated.invoiceNumber}`,
              performedBy
            });
          }
        }
      });

      if (deductedAny) {
        this.set(STORAGE_KEYS.PRODUCTS, products);
        updated.stockDeducted = true;
      }
    }

    if (idx >= 0) {
      invoices[idx] = updated;
    } else {
      invoices.unshift(updated);
    }
    this.set(STORAGE_KEYS.SALES_INVOICES, invoices, updated);
  }

  deleteSalesInvoice(id: string): void {
    const invoices = this.getSalesInvoices().filter(i => i.id !== id);
    this.set(STORAGE_KEYS.SALES_INVOICES, invoices);
    this.deleteSync('sales_invoices', id);
  }

  // ==========================================
  // Stock Movements
  // ==========================================
  getStockMovements(): StockMovement[] {
    return this.get<StockMovement[]>(STORAGE_KEYS.STOCK_MOVEMENTS, initialStockMovements);
  }

  addStockMovement(movement: Omit<StockMovement, 'id' | 'timestamp'>): void {
    const movements = this.getStockMovements();
    movements.unshift({
      ...movement,
      id: `sm-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString()
    });
    this.set(STORAGE_KEYS.STOCK_MOVEMENTS, movements);
  }

  // ==========================================
  // Role-Based Access Control (ACL)
  // ==========================================
  getAclConfig(): SystemAclConfig {
    const raw = this.get<any>(STORAGE_KEYS.ACL_CONFIG, DEFAULT_SYSTEM_ACL_CONFIG);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'object' && !Array.isArray(raw[0])) {
        return { ...DEFAULT_SYSTEM_ACL_CONFIG, ...raw[0] };
      }
      return DEFAULT_SYSTEM_ACL_CONFIG;
    }
    return { ...DEFAULT_SYSTEM_ACL_CONFIG, ...raw };
  }

  saveAclConfig(config: SystemAclConfig): void {
    this.set(STORAGE_KEYS.ACL_CONFIG, config, config);
  }

  updateRolePermissions(
    role: UserRole,
    permissions: Record<string, boolean>,
    changedBy = 'System Admin',
    summary?: string
  ): void {
    const config = this.getAclConfig();
    config[role] = {
      ...(config[role] || {}),
      ...permissions
    };

    // If Admin, ensure core root permissions cannot be accidentally ungranted
    if (role === 'Admin') {
      config['Admin']['settings.acl_manage'] = true;
      config['Admin']['settings.manage'] = true;
      config['Admin']['settings.view'] = true;
    }

    this.saveAclConfig(config);

    const defaultSummary = summary || `Updated ${Object.keys(permissions).length} operational permissions for ${role}`;
    this.addAclAuditLog({
      changedBy,
      targetRole: role,
      action: 'UPDATE_PERMISSIONS',
      summary: defaultSummary
    });
  }

  resetRoleAclToDefault(role: UserRole, changedBy = 'System Admin'): SystemAclConfig {
    const config = this.getAclConfig();
    config[role] = { ...(DEFAULT_SYSTEM_ACL_CONFIG[role] || {}) };
    this.saveAclConfig(config);

    this.addAclAuditLog({
      changedBy,
      targetRole: role,
      action: 'RESET_ROLE',
      summary: `Restored standard Solar EPC default permissions for ${role}`
    });

    return config;
  }

  resetAllAclToDefault(changedBy = 'System Admin'): SystemAclConfig {
    const deepClone = JSON.parse(JSON.stringify(DEFAULT_SYSTEM_ACL_CONFIG));
    this.saveAclConfig(deepClone);

    this.addAclAuditLog({
      changedBy,
      targetRole: 'Admin',
      action: 'RESET_ROLE',
      summary: 'Restored baseline Solar EPC permissions for all 15 operational roles'
    });

    return deepClone;
  }

  hasAclPermission(role: UserRole, permissionId: string): boolean {
    if (role === 'Admin') return true;
    const config = this.getAclConfig();
    const rolePerms = config[role];
    if (!rolePerms) return false;
    return Boolean(rolePerms[permissionId]);
  }

  assertPermission(role: UserRole, permissionId: string, actionDescription?: string): void {
    if (role === 'Admin') return;
    if (!this.hasAclPermission(role, permissionId)) {
      throw new Error(`Security Exception: Access Denied. Role "${role}" is not authorized to ${actionDescription || permissionId}.`);
    }
  }

  assertAdmin(role: UserRole, actionDescription?: string): void {
    if (role !== 'Admin') {
      throw new Error(`Security Exception: Access Denied. Role "${role}" is not authorized for administrative operation: ${actionDescription || 'Admin access required'}.`);
    }
  }

  getAclAuditLogs(): AclAuditLogEntry[] {
    return this.get<AclAuditLogEntry[]>(STORAGE_KEYS.ACL_AUDIT_LOGS, initialAclAuditLogs);
  }

  addAclAuditLog(log: Omit<AclAuditLogEntry, 'id' | 'timestamp'>): void {
    const logs = this.getAclAuditLogs();
    logs.unshift({
      ...log,
      id: `acl-log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString()
    });
    // Keep max 50 recent audit records
    this.set(STORAGE_KEYS.ACL_AUDIT_LOGS, logs.slice(0, 50));
  }

  // ==========================================
  // Multi-Warehouse Management
  // ==========================================
  getWarehouses(): Warehouse[] {
    return this.get<Warehouse[]>(STORAGE_KEYS.WAREHOUSES, initialWarehouses);
  }

  saveWarehouse(warehouse: Warehouse): void {
    const list = this.getWarehouses();
    const idx = list.findIndex(w => w.id === warehouse.id);
    if (warehouse.isDefault) {
      list.forEach(w => {
        if (w.id !== warehouse.id) w.isDefault = false;
      });
    }
    if (idx >= 0) {
      list[idx] = { ...warehouse, updatedAt: new Date().toISOString() };
    } else {
      list.push({ ...warehouse, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    }
    this.set(STORAGE_KEYS.WAREHOUSES, list, warehouse);
  }

  deleteWarehouse(id: string): { success: boolean; message?: string } {
    const list = this.getWarehouses();
    const target = list.find(w => w.id === id);
    if (!target) return { success: false, message: 'Warehouse not found' };
    if (target.isDefault) {
      return { success: false, message: 'Cannot delete the default warehouse. Please mark another warehouse as default first.' };
    }
    const updated = list.filter(w => w.id !== id);
    this.set(STORAGE_KEYS.WAREHOUSES, updated);
    this.deleteSync('warehouses', id);
    return { success: true };
  }

  getDefaultWarehouse(): Warehouse {
    const list = this.getWarehouses();
    return list.find(w => w.isDefault && w.status === 'ACTIVE') || list[0] || ({} as any);
  }

  getStockAudits(): StockAuditRecord[] {
    return this.get<StockAuditRecord[]>(STORAGE_KEYS.STOCK_AUDITS, initialStockAudits);
  }

  saveStockAudit(audit: StockAuditRecord): void {
    const list = this.getStockAudits();
    const idx = list.findIndex(a => a.id === audit.id);
    if (idx >= 0) {
      list[idx] = audit;
    } else {
      list.unshift(audit);
    }
    this.set(STORAGE_KEYS.STOCK_AUDITS, list, audit);
  }

  transferStock(
    productId: string,
    fromWarehouseId: string,
    toWarehouseId: string,
    quantity: number,
    notes: string,
    performedBy: string = 'Inventory Manager'
  ): { success: boolean; message?: string } {
    const products = this.getProducts();
    const prod = products.find(p => p.id === productId);
    if (!prod) return { success: false, message: 'Product not found' };
    if (quantity <= 0) return { success: false, message: 'Transfer quantity must be greater than 0' };

    const warehouses = this.getWarehouses();
    const fromWh = warehouses.find(w => w.id === fromWarehouseId);
    const toWh = warehouses.find(w => w.id === toWarehouseId);
    if (!fromWh || !toWh) return { success: false, message: 'Source or destination warehouse invalid' };

    prod.warehouseStocks = prod.warehouseStocks || {};
    const currentFromStock = prod.warehouseStocks[fromWarehouseId] ?? prod.currentStock;
    if (currentFromStock < quantity) {
      return { success: false, message: `Insufficient stock at ${fromWh.name}. Available: ${currentFromStock} ${prod.unit}` };
    }

    prod.warehouseStocks[fromWarehouseId] = currentFromStock - quantity;
    prod.warehouseStocks[toWarehouseId] = (prod.warehouseStocks[toWarehouseId] ?? 0) + quantity;
    prod.updatedAt = new Date().toISOString();
    this.set(STORAGE_KEYS.PRODUCTS, products);

    this.addStockMovement({
      productId: prod.id,
      productName: prod.name,
      sku: prod.sku,
      movementType: 'WAREHOUSE_TRANSFER',
      quantity: -quantity,
      balanceAfter: prod.warehouseStocks[fromWarehouseId],
      warehouseId: fromWarehouseId,
      warehouseName: fromWh.name,
      targetWarehouseId: toWarehouseId,
      targetWarehouseName: toWh.name,
      notes: notes || `Transferred ${quantity} ${prod.unit} from ${fromWh.name} to ${toWh.name}`,
      performedBy
    });

    this.addStockMovement({
      productId: prod.id,
      productName: prod.name,
      sku: prod.sku,
      movementType: 'WAREHOUSE_TRANSFER',
      quantity: quantity,
      balanceAfter: prod.warehouseStocks[toWarehouseId],
      warehouseId: toWarehouseId,
      warehouseName: toWh.name,
      targetWarehouseId: fromWarehouseId,
      targetWarehouseName: fromWh.name,
      notes: notes || `Received transfer of ${quantity} ${prod.unit} from ${fromWh.name}`,
      performedBy
    });

    return { success: true };
  }

  // Reset demo data to default fresh state
  resetAllData(): void {
    this.memStore.clear();
    if (typeof window !== 'undefined') {
      fetch('/api/db/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      })
        .catch(() => {})
        .finally(() => {
          window.location.reload();
        });
    }
  }
}

export const storageService = new StorageService();
