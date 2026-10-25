/**
 * SolarPulse EPC ERP & CRM - MySQL Backend API Client
 * Provides unified async communication with /api/* endpoints
 */

export interface DbStatusResponse {
  success: boolean;
  connected: boolean;
  host: string;
  database: string;
  port: number;
  mode: string;
  dumpAvailable: boolean;
  dumpPath: string;
  message: string;
  tables?: string[];
}

import { safeStorage } from './safeStorage';

class ApiClient {
  private baseUrl: string = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL)
    ? String(import.meta.env.VITE_API_URL).replace(/\/$/, '')
    : '/api';
  private token: string | null = null;

  constructor() {
    this.token = safeStorage.getItem('rejoysolar_auth_token');
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public setToken(token: string | null): void {
    this.token = token;
    if (token) {
      safeStorage.setItem('rejoysolar_auth_token', token);
    } else {
      safeStorage.removeItem('rejoysolar_auth_token');
    }
  }

  public getToken(): string | null {
    if (!this.token) {
      this.token = safeStorage.getItem('rejoysolar_auth_token');
    }
    return this.token;
  }

  public getAuthHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = { ...extraHeaders };
    const t = this.getToken();
    if (t) {
      headers['Authorization'] = t.startsWith('Bearer ') ? t : `Bearer ${t}`;
      headers['x-auth-token'] = t;
    }
    try {
      const raw = safeStorage.getItem('rejoysolar_active_session');
      if (raw) {
        const u = JSON.parse(raw);
        if (u?.id) headers['x-user-id'] = u.id;
        if (u?.role) headers['x-user-role'] = u.role;
      }
    } catch {}
    return headers;
  }

  // --- Database Management & Migration ---

  async getDbStatus(): Promise<DbStatusResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/db/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e: any) {
      return {
        success: false,
        connected: false,
        host: '127.0.0.1',
        database: 'u238683373_rejoy_solar',
        port: 3306,
        mode: 'STANDBY_PERSISTENCE_MODE',
        dumpAvailable: true,
        dumpPath: '/database.sql',
        message: 'Could not contact backend API: ' + e.message
      };
    }
  }

  async testDbConnection(config: { host: string; port?: number; user: string; password?: string; database: string }): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/db/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, message: e.message || 'Connection test failed.' };
    }
  }

  async runMigration(config?: any): Promise<{ success: boolean; message: string; tablesCount?: number }> {
    try {
      const res = await fetch(`${this.baseUrl}/db/migrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config || {})
      });
      return await res.json();
    } catch (e: any) {
      return { success: false, message: e.message || 'Migration request failed.' };
    }
  }

  getSqlDumpDownloadUrl(): string {
    return `${this.baseUrl}/db/dump.sql`;
  }

  async getRegistrationStatus(): Promise<{ success: boolean; allowPublicRegistration: boolean; adminCount: number }> {
    try {
      const res = await fetch(`${this.baseUrl}/auth/registration-status`);
      return await res.json();
    } catch {
      return { success: false, allowPublicRegistration: true, adminCount: 0 };
    }
  }

  async registerAdmin(
    data: {
      name: string;
      email: string;
      password: string;
      confirmPassword?: string;
      phone?: string;
      department?: string;
      designation?: string;
    },
    adminAuthToken?: string
  ): Promise<any> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (adminAuthToken) {
      headers['Authorization'] = adminAuthToken.startsWith('Bearer ') ? adminAuthToken : `Bearer ${adminAuthToken}`;
    }
    const res = await fetch(`${this.baseUrl}/auth/register`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });
    let json: any = {};
    try {
      json = await res.json();
    } catch {
      throw new Error(`Server returned HTTP ${res.status} (${res.statusText || 'Non-JSON response'}). Please ensure the API backend is running.`);
    }
    if (!res.ok || !json.success) {
      throw new Error(json.message || json.error || `Registration failed (HTTP ${res.status})`);
    }
    return json;
  }

  async wipeDatabase(confirmation: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/db/wipe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation })
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.message || json.error || 'Database wipe failed');
    }
    return json;
  }

  // --- Master Bootstrap Data ---
  async getBootstrapData(): Promise<Record<string, any> | null> {
    try {
      const res = await fetch(`${this.baseUrl}/bootstrap`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.data || null;
    } catch {
      return null;
    }
  }

  private async handleResponse<T = any>(res: Response): Promise<T> {
    let data: any = {};
    try {
      data = await res.json();
    } catch {
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.message || `Request failed with HTTP ${res.status}`);
    }
    return data.data !== undefined ? data.data : data;
  }

  async syncPush(collection: string, payload: { item?: any; items?: any[]; action?: string }): Promise<any> {
    const res = await fetch(`${this.baseUrl}/sync/push`, {
      method: 'POST',
      headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ collection, ...payload })
    });
    return this.handleResponse(res);
  }

  // --- Auth & Customer Portal ---

  async login(email: string, pass: string): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password: pass })
      });
      const data = await res.json();
      if (res.ok && data.success && data.token) {
        this.setToken(data.token);
      }
      return data;
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }

  async verifySession(customToken?: string): Promise<{ success: boolean; user?: any; token?: string; message?: string }> {
    const t = customToken || this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (t) {
      headers['Authorization'] = t.startsWith('Bearer ') ? t : `Bearer ${t}`;
      headers['x-auth-token'] = t;
    }

    try {
      const res = await fetch(`${this.baseUrl}/auth/me`, {
        method: 'GET',
        headers,
        credentials: 'include'
      });
      let data: any = {};
      try {
        data = await res.json();
      } catch {
        return { success: false, message: `HTTP ${res.status}: Non-JSON response` };
      }

      if (res.ok && data.success && data.user) {
        if (data.token) {
          this.setToken(data.token);
        }
        return { success: true, user: data.user, token: data.token || t || '' };
      }
      return { success: false, message: data.message || `HTTP ${res.status}` };
    } catch (e: any) {
      return { success: false, message: e.message || 'Session verification network error' };
    }
  }

  async logout(): Promise<{ success: boolean; message?: string }> {
    try {
      const t = this.getToken();
      this.setToken(null);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (t) headers['Authorization'] = t.startsWith('Bearer ') ? t : `Bearer ${t}`;
      const res = await fetch(`${this.baseUrl}/auth/logout`, {
        method: 'POST',
        headers,
        credentials: 'include'
      });
      return await res.json();
    } catch {
      return { success: true };
    }
  }

  async updateCustomerPassword(customerId: string, newPassword: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/customers/${encodeURIComponent(customerId)}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword })
      });
      const data = await res.json();
      return Boolean(data.success);
    } catch {
      return false;
    }
  }

  // --- Customers ---
  async getCustomers(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/customers`);
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async saveCustomer(cust: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cust)
      });
      const data = await res.json();
      return data.data || cust;
    } catch {
      return cust;
    }
  }

  async deleteCustomer(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/customers/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Leads ---
  async getLeads(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/leads`);
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async saveLead(lead: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lead)
      });
      const data = await res.json();
      return data.data || lead;
    } catch {
      return lead;
    }
  }

  async deleteLead(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/leads/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Projects ---
  async getProjects(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/projects`);
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async saveProject(proj: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(proj)
      });
      const data = await res.json();
      return data.data || proj;
    } catch {
      return proj;
    }
  }

  async deleteProject(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/projects/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Employees ---
  async getEmployees(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/employees`);
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async saveEmployee(emp: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emp)
      });
      const data = await res.json();
      return data.data || emp;
    } catch {
      return emp;
    }
  }

  async deleteEmployee(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/employees/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Attendance ---
  async getAttendance(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/attendance`);
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async saveAttendance(item: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      const data = await res.json();
      return data.data || item;
    } catch {
      return item;
    }
  }

  async deleteAttendance(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/attendance/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Payroll / Payslips ---
  async getPayslips(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/payslips`);
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async savePayslip(item: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/payslips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      const data = await res.json();
      return data.data || item;
    } catch {
      return item;
    }
  }

  async deletePayslip(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/payslips/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Holidays ---
  async getHolidays(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/holidays`);
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async saveHoliday(item: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/holidays`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      const data = await res.json();
      return data.data || item;
    } catch {
      return item;
    }
  }

  async deleteHoliday(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/holidays/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Products ---
  async getProducts(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/products`);
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async saveProduct(item: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      const data = await res.json();
      return data.data || item;
    } catch {
      return item;
    }
  }

  async deleteProduct(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Vendors ---
  async getVendors(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/vendors`);
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async saveVendor(item: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/vendors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      const data = await res.json();
      return data.data || item;
    } catch {
      return item;
    }
  }

  async deleteVendor(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/vendors/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Purchase Orders ---
  async getPurchaseOrders(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/purchase-orders`);
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async savePurchaseOrder(item: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/purchase-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      const data = await res.json();
      return data.data || item;
    } catch {
      return item;
    }
  }

  async deletePurchaseOrder(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/purchase-orders/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Bill of Materials (BOM) ---
  async getBOMs(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/boms`);
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async saveBOM(item: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/boms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      const data = await res.json();
      return data.data || item;
    } catch {
      return item;
    }
  }

  async deleteBOM(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/boms/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Sales Invoices ---
  async getSalesInvoices(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/sales-invoices`);
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async saveSalesInvoice(item: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/sales-invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      const data = await res.json();
      return data.data || item;
    } catch {
      return item;
    }
  }

  async deleteSalesInvoice(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/sales-invoices/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Warehouses ---
  async getWarehouses(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/warehouses`);
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async saveWarehouse(item: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/warehouses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      const data = await res.json();
      return data.data || item;
    } catch {
      return item;
    }
  }

  async deleteWarehouse(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/warehouses/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Stock Movements ---
  async getStockMovements(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/stock-movements`);
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async saveStockMovement(item: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/stock-movements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      const data = await res.json();
      return data.data || item;
    } catch {
      return item;
    }
  }

  // --- Stock Audits ---
  async getStockAudits(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/stock-audits`);
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async saveStockAudit(item: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/stock-audits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      const data = await res.json();
      return data.data || item;
    } catch {
      return item;
    }
  }

  async deleteStockAudit(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/stock-audits/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Quotations ---
  async getQuotations(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/quotations`);
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async saveQuotation(item: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/quotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      const data = await res.json();
      return data.data || item;
    } catch {
      return item;
    }
  }

  async deleteQuotation(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/quotations/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Site Surveys ---
  async getSurveys(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/surveys`);
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async saveSurvey(item: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/surveys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      const data = await res.json();
      return data.data || item;
    } catch {
      return item;
    }
  }

  async deleteSurvey(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/surveys/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Payments ---
  async getPayments(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/payments`);
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async savePayment(item: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      const data = await res.json();
      return data.data || item;
    } catch {
      return item;
    }
  }

  async deletePayment(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/payments/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Expenses ---
  async getExpenses(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/expenses`);
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async saveExpense(item: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      const data = await res.json();
      return data.data || item;
    } catch {
      return item;
    }
  }

  async deleteExpense(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/expenses/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Service Tickets ---
  async getServiceTickets(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/service-tickets`);
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async saveServiceTicket(item: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/service-tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      const data = await res.json();
      return data.data || item;
    } catch {
      return item;
    }
  }

  async deleteServiceTicket(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/service-tickets/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- AMC Contracts ---
  async getAMCContracts(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/amc-contracts`);
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async saveAMCContract(item: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/amc-contracts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      const data = await res.json();
      return data.data || item;
    } catch {
      return item;
    }
  }

  async deleteAMCContract(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/amc-contracts/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Notifications ---
  async getNotifications(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/notifications`);
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async saveNotification(item: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      const data = await res.json();
      return data.data || item;
    } catch {
      return item;
    }
  }

  async markNotificationRead(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/notifications/${encodeURIComponent(id)}/read`, { method: 'PUT' });
      return res.ok;
    } catch {
      return false;
    }
  }

  async markAllNotificationsRead(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/notifications/read-all`, { method: 'PUT' });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Settings ---
  async getSettings(): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/settings`);
      const data = await res.json();
      return data.data || null;
    } catch {
      return null;
    }
  }

  async saveSettings(settings: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      return data.data || settings;
    } catch {
      return settings;
    }
  }

  // --- Users & Passwords ---
  async getUsers(): Promise<any[]> {
    try {
      const res = await fetch(`${this.baseUrl}/users`, {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async saveUser(user: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/users`, {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(user)
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.message || data.error || 'Failed to save user');
      }
      return data.data || user;
    } catch (e: any) {
      console.error('[apiClient] saveUser error:', e);
      throw e;
    }
  }

  async updateUser(id: string, updates: any): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/users/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.message || data.error || 'Failed to update user');
      }
      return data.data || updates;
    } catch (e: any) {
      console.error('[apiClient] updateUser error:', e);
      throw e;
    }
  }

  async updateUserPassword(id: string, password: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/users/${encodeURIComponent(id)}/password`, {
        method: 'PUT',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.message || data.error || 'Failed to update password');
      }
      return data;
    } catch (e: any) {
      console.error('[apiClient] updateUserPassword error:', e);
      throw e;
    }
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/auth/change-password`, {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ userId, oldPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.message || data.error || 'Failed to change password');
      }
      return data;
    } catch (e: any) {
      console.error('[apiClient] changePassword error:', e);
      throw e;
    }
  }

  async resetPassword(email: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/auth/reset-password`, {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ email, newPassword })
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.message || data.error || 'Failed to reset password');
      }
      return data;
    } catch (e: any) {
      console.error('[apiClient] resetPassword error:', e);
      throw e;
    }
  }

  async deleteUser(id: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/users/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: this.getAuthHeaders()
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export const apiClient = new ApiClient();
