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

export interface BatchImportResult {
  success: boolean;
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  importedRecords?: any[];
  skippedRecords?: { row: number; name: string; reason: string }[];
  failedRecords?: { row: number; reason: string }[];
  errors?: string[];
}

class ApiClient {
  private baseUrl: string = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL)
    ? String(import.meta.env.VITE_API_URL).replace(/\/$/, '')
    : '/api';
  private token: string | null = null;

  constructor() {
    this.token = null;
    // Purge any legacy browser storage tokens to guarantee MySQL as sole source of truth
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('rejoysolar_auth_token');
        localStorage.removeItem('rejoysolar_active_session');
        sessionStorage.removeItem('rejoysolar_auth_token');
        sessionStorage.removeItem('rejoysolar_active_session');
      } catch {}
    }
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public setToken(token: string | null): void {
    this.token = token;
  }

  public getToken(): string | null {
    return this.token;
  }

  public getAuthHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = { ...extraHeaders };
    const t = this.getToken();
    if (t) {
      headers['Authorization'] = t.startsWith('Bearer ') ? t : `Bearer ${t}`;
      headers['x-auth-token'] = t;
    }
    return headers;
  }

  /**
   * Unified fetch wrapper ensuring HttpOnly cookies and credentials are sent across
   * all browser environments, iframes, page reloads, and cross-site requests
   */
  public async request(url: string, init: RequestInit = {}): Promise<Response> {
    const customHeaders = (init.headers as Record<string, string>) || {};
    const headers = this.getAuthHeaders(customHeaders);
    return fetch(url, {
      ...init,
      headers,
      credentials: 'include'
    });
  }

  // --- Database Management & Migration ---

  async getDbStatus(): Promise<DbStatusResponse> {
    try {
      const res = await this.request(`${this.baseUrl}/db/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e: any) {
      return {
        success: false,
        connected: false,
        host: '127.0.0.1',
        database: 'u238683373_rejoy_solar',
        port: 3306,
        mode: 'DISCONNECTED',
        dumpAvailable: false,
        dumpPath: '/database.sql',
        message: 'Could not contact backend API: ' + e.message
      };
    }
  }

  async testDbConnection(config: { host: string; port?: number; user: string; password?: string; database: string }): Promise<{ success: boolean; message: string }> {
    try {
      const res = await this.request(`${this.baseUrl}/db/test-connection`, {
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
      const res = await this.request(`${this.baseUrl}/db/migrate`, {
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
      const res = await this.request(`${this.baseUrl}/auth/registration-status`);
      return await res.json();
    } catch {
      return { success: false, allowPublicRegistration: false, adminCount: 0 };
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
    const res = await this.request(`${this.baseUrl}/auth/register`, {
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
    const res = await this.request(`${this.baseUrl}/db/wipe`, {
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
  async getBootstrapData(): Promise<Record<string, any>> {
    const res = await this.request(`${this.baseUrl}/bootstrap`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      throw new Error(json.error || json.message || `MySQL bootstrap failed (HTTP ${res.status})`);
    }
    return json.data || {};
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
    const res = await this.request(`${this.baseUrl}/sync/push`, {
      method: 'POST',
      headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ collection, ...payload })
    });
    return this.handleResponse(res);
  }

  // --- Auth & Customer Portal ---

  async login(email: string, pass: string): Promise<any> {
    try {
      let res = await this.request(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password: pass })
      });
      if (res.status === 404 && this.baseUrl === '/api') {
        try {
          res = await this.request('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email, password: pass })
          });
        } catch {}
      }
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
      let res = await this.request(`${this.baseUrl}/auth/me`, {
        method: 'GET',
        headers,
        credentials: 'include'
      });
      if (res.status === 404 && this.baseUrl === '/api') {
        try {
          res = await this.request('/auth/me', {
            method: 'GET',
            headers,
            credentials: 'include'
          });
        } catch {}
      }
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
      const res = await this.request(`${this.baseUrl}/auth/logout`, {
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
    const res = await this.request(`${this.baseUrl}/customers/${encodeURIComponent(customerId)}/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword })
    });
    await this.handleResponse(res);
    return true;
  }

  // --- Customers ---
  async getCustomers(): Promise<any[]> {
    const res = await this.request(`${this.baseUrl}/customers`);
    return (await this.handleResponse(res)) || [];
  }

  async saveCustomer(cust: any): Promise<any> {
    const res = await this.request(`${this.baseUrl}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cust)
    });
    return await this.handleResponse(res);
  }

  async importCustomers(customers: any[]): Promise<{
    success: boolean;
    total: number;
    imported: number;
    skipped: number;
    failed: number;
    importedRecords?: any[];
    skippedRecords?: { row: number; name: string; reason: string }[];
    failedRecords?: { row: number; reason: string }[];
    errors?: string[];
  }> {
    const res = await this.request(`${this.baseUrl}/customers/import`, {
      method: 'POST',
      headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ customers })
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.message || `Customer import failed with status ${res.status}`);
    }
    return data;
  }

  async deleteCustomer(id: string): Promise<boolean> {
    const res = await this.request(`${this.baseUrl}/customers/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    await this.handleResponse(res);
    return true;
  }

  // --- Leads ---
  async getLeads(): Promise<any[]> {
    const res = await this.request(`${this.baseUrl}/leads`);
    return (await this.handleResponse(res)) || [];
  }

  async saveLead(lead: any): Promise<any> {
    const res = await this.request(`${this.baseUrl}/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead)
    });
    return await this.handleResponse(res);
  }

  async deleteLead(id: string): Promise<boolean> {
    const res = await this.request(`${this.baseUrl}/leads/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    await this.handleResponse(res);
    return true;
  }

  async importLeads(leads: any[]): Promise<BatchImportResult> {
    const res = await this.request(`${this.baseUrl}/leads/import`, {
      method: 'POST',
      headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ leads })
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.message || `Lead import failed with status ${res.status}`);
    }
    return data;
  }

  // --- Projects ---
  async getProjects(): Promise<any[]> {
    const res = await this.request(`${this.baseUrl}/projects`);
    return (await this.handleResponse(res)) || [];
  }

  async saveProject(proj: any): Promise<any> {
    const res = await this.request(`${this.baseUrl}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proj)
    });
    return await this.handleResponse(res);
  }

  async deleteProject(id: string): Promise<boolean> {
    const res = await this.request(`${this.baseUrl}/projects/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    await this.handleResponse(res);
    return true;
  }

  async importProjects(projects: any[]): Promise<{
    success: boolean;
    total: number;
    imported: number;
    skipped: number;
    failed: number;
    importedRecords?: any[];
    skippedRecords?: { row: number; name: string; reason: string }[];
    failedRecords?: { row: number; reason: string }[];
    errors?: string[];
  }> {
    const res = await this.request(`${this.baseUrl}/projects/import`, {
      method: 'POST',
      headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ projects })
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.message || `Project import failed with status ${res.status}`);
    }
    return data;
  }

  // --- Employees ---
  async getEmployees(): Promise<any[]> {
    const res = await this.request(`${this.baseUrl}/employees`);
    return (await this.handleResponse(res)) || [];
  }

  async saveEmployee(emp: any): Promise<any> {
    const res = await this.request(`${this.baseUrl}/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emp)
    });
    return await this.handleResponse(res);
  }

  async deleteEmployee(id: string): Promise<boolean> {
    const res = await this.request(`${this.baseUrl}/employees/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    await this.handleResponse(res);
    return true;
  }

  async importEmployees(employees: any[]): Promise<BatchImportResult> {
    const res = await this.request(`${this.baseUrl}/employees/import`, {
      method: 'POST',
      headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ employees })
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.message || `Employee import failed with status ${res.status}`);
    }
    return data;
  }

  async uploadEmployeeDocument(employeeId: string, docData: {
    name?: string;
    category?: string;
    fileName: string;
    mimeType?: string;
    fileData: string;
    notes?: string;
    uploadedBy?: string;
  }): Promise<any> {
    const res = await this.request(`${this.baseUrl}/employees/${encodeURIComponent(employeeId)}/documents/upload`, {
      method: 'POST',
      headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(docData)
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.message || `Upload failed with status ${res.status}`);
    }
    return data.document;
  }

  async deleteEmployeeDocument(employeeId: string, docId: string): Promise<boolean> {
    const res = await this.request(`${this.baseUrl}/employees/${encodeURIComponent(employeeId)}/documents/${encodeURIComponent(docId)}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders()
    });
    const data = await res.json();
    return Boolean(data.success);
  }

  async getEmployeeDocuments(employeeId: string): Promise<any[]> {
    try {
      const res = await this.request(`${this.baseUrl}/employees/${encodeURIComponent(employeeId)}/documents`, {
        headers: this.getAuthHeaders()
      });
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async uploadEmployeePhoto(employeeId: string, photoData: string, fileName?: string): Promise<string> {
    const res = await this.request(`${this.baseUrl}/employees/${encodeURIComponent(employeeId)}/photo/upload`, {
      method: 'POST',
      headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ photoData, fileName })
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.message || `Photo upload failed with status ${res.status}`);
    }
    return data.photoUrl;
  }

  // --- Attendance ---
  async getAttendance(): Promise<any[]> {
    const res = await this.request(`${this.baseUrl}/attendance`);
    return (await this.handleResponse(res)) || [];
  }

  async saveAttendance(item: any): Promise<any> {
    const res = await this.request(`${this.baseUrl}/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    return await this.handleResponse(res);
  }

  async deleteAttendance(id: string): Promise<boolean> {
    const res = await this.request(`${this.baseUrl}/attendance/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await this.handleResponse(res);
    return true;
  }

  async importAttendance(attendance: any[]): Promise<BatchImportResult> {
    const res = await this.request(`${this.baseUrl}/attendance/import`, {
      method: 'POST',
      headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ attendance })
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.message || `Attendance import failed with status ${res.status}`);
    }
    return data;
  }

  // --- Payroll / Payslips ---
  async getPayslips(): Promise<any[]> {
    const res = await this.request(`${this.baseUrl}/payslips`);
    return (await this.handleResponse(res)) || [];
  }

  async savePayslip(item: any): Promise<any> {
    const res = await this.request(`${this.baseUrl}/payslips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    return await this.handleResponse(res);
  }

  async deletePayslip(id: string): Promise<boolean> {
    const res = await this.request(`${this.baseUrl}/payslips/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await this.handleResponse(res);
    return true;
  }

  // --- Holidays ---
  async getHolidays(): Promise<any[]> {
    const res = await this.request(`${this.baseUrl}/holidays`);
    return (await this.handleResponse(res)) || [];
  }

  async saveHoliday(item: any): Promise<any> {
    const res = await this.request(`${this.baseUrl}/holidays`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    return await this.handleResponse(res);
  }

  async deleteHoliday(id: string): Promise<boolean> {
    const res = await this.request(`${this.baseUrl}/holidays/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await this.handleResponse(res);
    return true;
  }

  // --- Products ---
  async getProducts(): Promise<any[]> {
    const res = await this.request(`${this.baseUrl}/products`);
    return (await this.handleResponse(res)) || [];
  }

  async saveProduct(item: any): Promise<any> {
    const res = await this.request(`${this.baseUrl}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    return await this.handleResponse(res);
  }

  async deleteProduct(id: string): Promise<boolean> {
    const res = await this.request(`${this.baseUrl}/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await this.handleResponse(res);
    return true;
  }

  async importProducts(products: any[]): Promise<BatchImportResult> {
    const res = await this.request(`${this.baseUrl}/products/import`, {
      method: 'POST',
      headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ products })
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.message || `Product import failed with status ${res.status}`);
    }
    return data;
  }

  // --- Vendors ---
  async getVendors(): Promise<any[]> {
    const res = await this.request(`${this.baseUrl}/vendors`);
    return (await this.handleResponse(res)) || [];
  }

  async saveVendor(item: any): Promise<any> {
    const res = await this.request(`${this.baseUrl}/vendors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    return await this.handleResponse(res);
  }

  async deleteVendor(id: string): Promise<boolean> {
    const res = await this.request(`${this.baseUrl}/vendors/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await this.handleResponse(res);
    return true;
  }

  async importVendors(vendors: any[]): Promise<BatchImportResult> {
    const res = await this.request(`${this.baseUrl}/vendors/import`, {
      method: 'POST',
      headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ vendors })
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.message || `Vendor import failed with status ${res.status}`);
    }
    return data;
  }

  // --- Purchase Orders ---
  async getPurchaseOrders(): Promise<any[]> {
    const res = await this.request(`${this.baseUrl}/purchase-orders`);
    return (await this.handleResponse(res)) || [];
  }

  async savePurchaseOrder(item: any): Promise<any> {
    const res = await this.request(`${this.baseUrl}/purchase-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    return await this.handleResponse(res);
  }

  async deletePurchaseOrder(id: string): Promise<boolean> {
    const res = await this.request(`${this.baseUrl}/purchase-orders/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await this.handleResponse(res);
    return true;
  }

  // --- Bill of Materials (BOM) ---
  async getBOMs(): Promise<any[]> {
    const res = await this.request(`${this.baseUrl}/boms`);
    return (await this.handleResponse(res)) || [];
  }

  async saveBOM(item: any): Promise<any> {
    const res = await this.request(`${this.baseUrl}/boms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    return await this.handleResponse(res);
  }

  async deleteBOM(id: string): Promise<boolean> {
    const res = await this.request(`${this.baseUrl}/boms/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await this.handleResponse(res);
    return true;
  }

  // --- Sales Invoices ---
  async getSalesInvoices(): Promise<any[]> {
    const res = await this.request(`${this.baseUrl}/sales-invoices`);
    return (await this.handleResponse(res)) || [];
  }

  async saveSalesInvoice(item: any): Promise<any> {
    const res = await this.request(`${this.baseUrl}/sales-invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    return await this.handleResponse(res);
  }

  async deleteSalesInvoice(id: string): Promise<boolean> {
    const res = await this.request(`${this.baseUrl}/sales-invoices/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await this.handleResponse(res);
    return true;
  }

  // --- Warehouses ---
  async getWarehouses(): Promise<any[]> {
    const res = await this.request(`${this.baseUrl}/warehouses`);
    return (await this.handleResponse(res)) || [];
  }

  async saveWarehouse(item: any): Promise<any> {
    const res = await this.request(`${this.baseUrl}/warehouses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    return await this.handleResponse(res);
  }

  async deleteWarehouse(id: string): Promise<boolean> {
    const res = await this.request(`${this.baseUrl}/warehouses/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await this.handleResponse(res);
    return true;
  }

  // --- Stock Movements ---
  async getStockMovements(): Promise<any[]> {
    const res = await this.request(`${this.baseUrl}/stock-movements`);
    return (await this.handleResponse(res)) || [];
  }

  async saveStockMovement(item: any): Promise<any> {
    const res = await this.request(`${this.baseUrl}/stock-movements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    return await this.handleResponse(res);
  }

  // --- Stock Audits ---
  async getStockAudits(): Promise<any[]> {
    const res = await this.request(`${this.baseUrl}/stock-audits`);
    return (await this.handleResponse(res)) || [];
  }

  async saveStockAudit(item: any): Promise<any> {
    const res = await this.request(`${this.baseUrl}/stock-audits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    return await this.handleResponse(res);
  }

  async deleteStockAudit(id: string): Promise<boolean> {
    const res = await this.request(`${this.baseUrl}/stock-audits/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await this.handleResponse(res);
    return true;
  }

  // --- Quotations ---
  async getQuotations(): Promise<any[]> {
    const res = await this.request(`${this.baseUrl}/quotations`);
    return (await this.handleResponse(res)) || [];
  }

  async saveQuotation(item: any): Promise<any> {
    const res = await this.request(`${this.baseUrl}/quotations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    return await this.handleResponse(res);
  }

  async deleteQuotation(id: string): Promise<boolean> {
    const res = await this.request(`${this.baseUrl}/quotations/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await this.handleResponse(res);
    return true;
  }

  // --- Site Surveys ---
  async getSurveys(): Promise<any[]> {
    const res = await this.request(`${this.baseUrl}/surveys`);
    return (await this.handleResponse(res)) || [];
  }

  async saveSurvey(item: any): Promise<any> {
    const res = await this.request(`${this.baseUrl}/surveys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    return await this.handleResponse(res);
  }

  async deleteSurvey(id: string): Promise<boolean> {
    const res = await this.request(`${this.baseUrl}/surveys/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await this.handleResponse(res);
    return true;
  }

  // --- Payments ---
  async getPayments(): Promise<any[]> {
    const res = await this.request(`${this.baseUrl}/payments`);
    return (await this.handleResponse(res)) || [];
  }

  async savePayment(item: any): Promise<any> {
    const res = await this.request(`${this.baseUrl}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    return await this.handleResponse(res);
  }

  async deletePayment(id: string): Promise<boolean> {
    const res = await this.request(`${this.baseUrl}/payments/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await this.handleResponse(res);
    return true;
  }

  async importPayments(payments: any[]): Promise<BatchImportResult> {
    const res = await this.request(`${this.baseUrl}/payments/import`, {
      method: 'POST',
      headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ payments })
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.message || `Payment import failed with status ${res.status}`);
    }
    return data;
  }

  // --- Expenses ---
  async getExpenses(): Promise<any[]> {
    const res = await this.request(`${this.baseUrl}/expenses`);
    return (await this.handleResponse(res)) || [];
  }

  async saveExpense(item: any): Promise<any> {
    const res = await this.request(`${this.baseUrl}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    return await this.handleResponse(res);
  }

  async deleteExpense(id: string): Promise<boolean> {
    const res = await this.request(`${this.baseUrl}/expenses/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await this.handleResponse(res);
    return true;
  }

  async importExpenses(expenses: any[]): Promise<BatchImportResult> {
    const res = await this.request(`${this.baseUrl}/expenses/import`, {
      method: 'POST',
      headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ expenses })
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.message || `Expense import failed with status ${res.status}`);
    }
    return data;
  }

  // --- Service Tickets ---
  async getServiceTickets(): Promise<any[]> {
    const res = await this.request(`${this.baseUrl}/service-tickets`);
    return (await this.handleResponse(res)) || [];
  }

  async saveServiceTicket(item: any): Promise<any> {
    const res = await this.request(`${this.baseUrl}/service-tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    return await this.handleResponse(res);
  }

  async deleteServiceTicket(id: string): Promise<boolean> {
    const res = await this.request(`${this.baseUrl}/service-tickets/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await this.handleResponse(res);
    return true;
  }

  async importServiceTickets(tickets: any[]): Promise<BatchImportResult> {
    const res = await this.request(`${this.baseUrl}/service-tickets/import`, {
      method: 'POST',
      headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ tickets })
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.message || `Service tickets import failed with status ${res.status}`);
    }
    return data;
  }

  // --- AMC Contracts ---
  async getAMCContracts(): Promise<any[]> {
    const res = await this.request(`${this.baseUrl}/amc-contracts`);
    return (await this.handleResponse(res)) || [];
  }

  async saveAMCContract(item: any): Promise<any> {
    const res = await this.request(`${this.baseUrl}/amc-contracts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    return await this.handleResponse(res);
  }

  async deleteAMCContract(id: string): Promise<boolean> {
    const res = await this.request(`${this.baseUrl}/amc-contracts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await this.handleResponse(res);
    return true;
  }

  // --- Notifications ---
  async getNotifications(): Promise<any[]> {
    const res = await this.request(`${this.baseUrl}/notifications`);
    return (await this.handleResponse(res)) || [];
  }

  async saveNotification(item: any): Promise<any> {
    const res = await this.request(`${this.baseUrl}/notifications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    });
    return await this.handleResponse(res);
  }

  async markNotificationRead(id: string): Promise<boolean> {
    const res = await this.request(`${this.baseUrl}/notifications/${encodeURIComponent(id)}/read`, { method: 'PUT' });
    await this.handleResponse(res);
    return true;
  }

  async markAllNotificationsRead(): Promise<boolean> {
    const res = await this.request(`${this.baseUrl}/notifications/mark-all-read`, { method: 'PUT' });
    await this.handleResponse(res);
    return true;
  }

  // --- Settings ---
  async getSettings(): Promise<any> {
    const res = await this.request(`${this.baseUrl}/settings`);
    return await this.handleResponse(res);
  }

  async saveSettings(settings: any): Promise<any> {
    const res = await this.request(`${this.baseUrl}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    return await this.handleResponse(res);
  }

  // --- Users & Passwords ---
  async getUsers(): Promise<any[]> {
    const res = await this.request(`${this.baseUrl}/users`, {
      headers: this.getAuthHeaders()
    });
    return (await this.handleResponse(res)) || [];
  }

  async saveUser(user: any): Promise<any> {
    try {
      const res = await this.request(`${this.baseUrl}/users`, {
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
      const res = await this.request(`${this.baseUrl}/users/${encodeURIComponent(id)}`, {
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
      const res = await this.request(`${this.baseUrl}/users/${encodeURIComponent(id)}/password`, {
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
      const res = await this.request(`${this.baseUrl}/auth/change-password`, {
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
      const res = await this.request(`${this.baseUrl}/auth/reset-password`, {
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
    const res = await this.request(`${this.baseUrl}/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders()
    });
    await this.handleResponse(res);
    return true;
  }
}

export const apiClient = new ApiClient();
