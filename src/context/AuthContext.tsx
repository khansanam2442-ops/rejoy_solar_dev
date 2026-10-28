import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, UserRole } from '../types/solar';
import { storageService } from '../services/storage';
import { liveLocationService } from '../services/liveLocationService';
import { apiClient } from '../services/apiClient';
import { safeStorage, safeSessionStorage } from '../services/safeStorage';

export interface RoleDefinition {
  role: UserRole;
  department: string;
  description: string;
  badgeColor: string;
  isFieldWorkerDefault?: boolean;
}

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    role: 'Admin',
    department: 'Administration',
    description: 'Master system authority, user management, financial approvals & administrative control',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    isFieldWorkerDefault: false
  },
  {
    role: 'Sales Manager',
    department: 'Sales',
    description: 'Pipeline analytics, commercial quoting, revenue targets & lead assignments',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    isFieldWorkerDefault: false
  },
  {
    role: 'Sales Executive',
    department: 'Sales',
    description: 'Lead generation, customer site visits, proposal follow-ups & CRM conversion',
    badgeColor: 'bg-teal-100 text-teal-800 border-teal-300',
    isFieldWorkerDefault: false
  },
  {
    role: 'Project Manager',
    department: 'Operations',
    description: '14-stage EPC milestones, stage approvals, resource scheduling & contractor oversight',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
    isFieldWorkerDefault: false
  },
  {
    role: 'Site Survey Engineer',
    department: 'Engineering',
    description: 'Site feasibility audits, roof structure load, solar radiance, azimuth & shadow analysis',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
    isFieldWorkerDefault: true
  },
  {
    role: 'Site Inspector',
    department: 'Engineering',
    description: 'Installation quality audits, safety compliance checks, punchlists & milestone sign-offs',
    badgeColor: 'bg-orange-100 text-orange-800 border-orange-300',
    isFieldWorkerDefault: true
  },
  {
    role: 'Civil Team',
    department: 'Civil',
    description: 'RCC pedestal casting, chemical anchoring, roof penetrations & civil structural safety',
    badgeColor: 'bg-stone-100 text-stone-800 border-stone-300',
    isFieldWorkerDefault: true
  },
  {
    role: 'Structure Team',
    department: 'Structure',
    description: 'Module mounting structures (MMS), column fabrication, tilt torque & wind shear alignment',
    badgeColor: 'bg-orange-100 text-orange-800 border-orange-300',
    isFieldWorkerDefault: true
  },
  {
    role: 'Installation Team',
    department: 'Installation',
    description: 'Solar PV module clamping, string cabling, inter-module jumpering & array leveling',
    badgeColor: 'bg-cyan-100 text-cyan-800 border-cyan-300',
    isFieldWorkerDefault: true
  },
  {
    role: 'Electrical Team',
    department: 'Electrical',
    description: 'On-grid inverters, HT/LT ACDB-DCDB panels, chemical earthing pits & lightning arresters',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    isFieldWorkerDefault: true
  },
  {
    role: 'Accountant',
    department: 'Finance',
    description: 'Milestone billing, GST sales invoices, expense vouchers & Tally Prime ODBC integration',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
    isFieldWorkerDefault: false
  },
  {
    role: 'Service Manager',
    department: 'Service',
    description: 'Preventive maintenance, AMC lifecycle renewals, fault SLA telemetry & ticket routing',
    badgeColor: 'bg-rose-100 text-rose-800 border-rose-300',
    isFieldWorkerDefault: false
  },
  {
    role: 'Technician',
    department: 'Service',
    description: 'Field ticket remediation, string inverter replacement, thermal hotspot drone scans',
    badgeColor: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    isFieldWorkerDefault: true
  },
  {
    role: 'HR Manager',
    department: 'HR',
    description: 'Staff directory, field wage payroll, geofence attendance stamps & performance appraisals',
    badgeColor: 'bg-pink-100 text-pink-800 border-pink-300',
    isFieldWorkerDefault: false
  },
  {
    role: 'Customer',
    department: 'Customer',
    description: 'Real-time project milestone tracking, quotation downloads, net-metering status & warranty portal',
    badgeColor: 'bg-slate-100 text-slate-800 border-slate-300',
    isFieldWorkerDefault: false
  }
];

export interface DemoAccount {
  name: string;
  email: string;
  role: UserRole;
  password: string;
  department: string;
  isFieldWorker?: boolean;
  profile: UserProfile;
  description: string;
  badgeColor: string;
}

export const DEMO_DEFAULT_PASSWORD = '123456';

export const SYSTEM_ADMIN_ACCOUNTS: DemoAccount[] = [
  {
    name: 'System Administrator',
    email: 'admin@rejoysolar.com',
    role: 'Admin',
    password: DEMO_DEFAULT_PASSWORD,
    department: 'Administration',
    isFieldWorker: false,
    profile: {
      id: 'usr-admin-1',
      employeeId: 'EMP-ADMIN-1',
      name: 'System Administrator',
      email: 'admin@rejoysolar.com',
      role: 'Admin',
      phone: '+91 98250 11223',
      department: 'Administration',
      designation: 'Principal Admin',
      isFieldWorker: false
    },
    description: 'Master system authority & administrative control',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300'
  },
  {
    name: 'Kunal Das',
    email: 'kunaldas2442@gmail.com',
    role: 'Admin',
    password: DEMO_DEFAULT_PASSWORD,
    department: 'Administration',
    isFieldWorker: false,
    profile: {
      id: 'usr-kunal-2',
      employeeId: 'EMP-KUNAL-2',
      name: 'Kunal Das',
      email: 'kunaldas2442@gmail.com',
      role: 'Admin',
      phone: '+91 98250 11223',
      department: 'Administration',
      designation: 'Managing Director & Lead Administrator',
      isFieldWorker: false
    },
    description: 'Managing Director & Lead Administrator',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300'
  },
  {
    name: 'Dasest Admin',
    email: 'dasest404@gmail.com',
    role: 'Admin',
    password: DEMO_DEFAULT_PASSWORD,
    department: 'Administration',
    isFieldWorker: false,
    profile: {
      id: 'usr-dasest-3',
      employeeId: 'EMP-DASEST-3',
      name: 'Dasest Admin',
      email: 'dasest404@gmail.com',
      role: 'Admin',
      phone: '+91 98250 11223',
      department: 'Administration',
      designation: 'System Administrator',
      isFieldWorker: false
    },
    description: 'System Administrator',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300'
  }
];

export const DEMO_ACCOUNTS: DemoAccount[] = SYSTEM_ADMIN_ACCOUNTS;

export interface AuthContextType {
  currentUser: UserProfile | null;
  currentRole: UserRole;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, pass: string) => Promise<void>;
  register: (
    email: string,
    pass: string,
    name: string,
    role?: UserRole,
    department?: string,
    designation?: string,
    phone?: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updateRole: (newRole: UserRole) => void;
  switchPersona: (profile: UserProfile) => void;
  canAccessModule: (moduleName: string) => boolean;
  hasPermission: (permissionId: string) => boolean;
  canApproveStage: () => boolean;
  canEditFinancials: () => boolean;
  canAccessHR: () => boolean;
  canManageProjectAssignments: () => boolean;
  isAdmin: boolean;
  isCustomer: boolean;
  isFieldStaff: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_PROFILE_STORAGE_KEY = 'rejoysolar_profile_';
const ACTIVE_SESSION_STORAGE_KEY = 'rejoysolar_active_session';
const AUTH_TOKEN_KEY = 'rejoysolar_auth_token';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Synchronously initialize user from safe storage to prevent unwanted redirect or flash on refresh
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const savedSession = safeStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
      if (savedSession) {
        const parsed = JSON.parse(savedSession);
        if (parsed && parsed.email && parsed.role) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[Auth] Failed to parse initial session:', e);
    }
    return null;
  });

  const [loading, setLoading] = useState<boolean>(true);

  // Persist active user profile changes and session token
  const saveUserProfile = (profile: UserProfile, token?: string) => {
    setCurrentUser(profile);
    try {
      if (profile.id) {
        safeStorage.setItem(USER_PROFILE_STORAGE_KEY + profile.id, JSON.stringify(profile));
      }
      safeStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(profile));
      if (token) {
        safeStorage.setItem(AUTH_TOKEN_KEY, token);
        apiClient.setToken(token);
      }
    } catch (e) {
      console.warn('[Auth] Error saving user profile to storage:', e);
    }
  };

  // Initialize and verify session against MySQL backend on mount
  useEffect(() => {
    let isMounted = true;

    const restoreAndVerifySession = async () => {
      try {
        const savedToken = safeStorage.getItem(AUTH_TOKEN_KEY);
        const savedSession = safeStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);

        // Pre-populate currentUser from savedSession if present to prevent UI flicker
        if (savedSession && !currentUser) {
          try {
            const parsed = JSON.parse(savedSession);
            if (parsed && parsed.email && parsed.role) {
              setCurrentUser(parsed);
            }
          } catch {}
        }

        if (savedToken) {
          apiClient.setToken(savedToken);
        }

        // Authoritatively verify session with MySQL backend API
        const verifyRes = await apiClient.verifySession(savedToken || undefined);

        if (verifyRes.success && verifyRes.user) {
          const u = verifyRes.user;
          const isFw = Boolean(
            u.isFieldWorker ??
            [
              'Site Survey Engineer',
              'Site Inspector',
              'Civil Team',
              'Structure Team',
              'Installation Team',
              'Electrical Team',
              'Technician'
            ].includes(u.role)
          );

          const verifiedProfile: UserProfile = {
            id: u.id,
            employeeId: u.employeeId || (u.customerId ? `CUST-${u.customerId}` : `EMP-${u.id}`),
            name: u.name || 'Solar Team Member',
            email: u.email,
            role: u.role as UserRole,
            phone: u.phone || '+91 98250 11223',
            department: u.department || (u.role === 'Customer' ? 'Client Portal' : 'Administration'),
            designation: u.designation || u.role,
            isFieldWorker: isFw,
            assignedProjects: []
          };

          if (isMounted) {
            saveUserProfile(verifiedProfile, verifyRes.token || savedToken || undefined);
            storageService.hydrateFromBackend().catch(() => {});
          }
        } else if (
          verifyRes.message &&
          (verifyRes.message.includes('expired') ||
            verifyRes.message.includes('Invalid') ||
            verifyRes.message.includes('not found') ||
            verifyRes.message.includes('disabled') ||
            verifyRes.message.includes('Malformed'))
        ) {
          // Token genuinely expired or invalidated by MySQL backend
          console.warn('[Auth] Session invalidated by MySQL backend:', verifyRes.message);
          safeStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
          safeStorage.removeItem(AUTH_TOKEN_KEY);
          apiClient.setToken(null);
          if (isMounted) {
            setCurrentUser(null);
          }
        } else if (!savedToken && !savedSession) {
          // No credentials found anywhere
          if (isMounted) {
            setCurrentUser(null);
          }
        } else if (savedSession) {
          // Backend temporarily unreachable (e.g. offline standby), keep cached session
          console.log('[Auth] Preserving cached session state during backend notice:', verifyRes.message);
        }
      } catch (err) {
        console.warn('[Auth] Error verifying session with backend, keeping cached state:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    restoreAndVerifySession();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (email: string, pass: string): Promise<void> => {
    setLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanPass = pass.trim();

      // Authenticate directly with the authoritative MySQL backend
      const res = await fetch(`${apiClient.getBaseUrl()}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password: cleanPass })
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch {
        throw new Error(
          res.status === 404
            ? `Authentication API endpoint not found (HTTP 404). Please ensure the backend server or reverse proxy is configured for ${apiClient.getBaseUrl()}/auth/login.`
            : `Authentication server returned HTTP ${res.status} (${res.statusText || 'Non-JSON response'}).`
        );
      }

      if (!res.ok || !data.success || !data.user) {
        throw new Error(data.message || 'Invalid email or password. Please verify your credentials in MySQL.');
      }

      const u = data.user;
      const isFw = Boolean(
        u.isFieldWorker ??
        [
          'Site Survey Engineer',
          'Site Inspector',
          'Civil Team',
          'Structure Team',
          'Installation Team',
          'Electrical Team',
          'Technician'
        ].includes(u.role)
      );

      const authenticatedProfile: UserProfile = {
        id: u.id,
        employeeId: u.employeeId || (u.customerId ? `CUST-${u.customerId}` : `EMP-${u.id}`),
        name: u.name || 'Solar Team Member',
        email: u.email,
        role: u.role as UserRole,
        phone: u.phone || '+91 98250 11223',
        department: u.department || (u.role === 'Customer' ? 'Client Portal' : 'Administration'),
        designation: u.designation || u.role,
        isFieldWorker: isFw,
        assignedProjects: []
      };

      saveUserProfile(authenticatedProfile, data.token);
      await storageService.hydrateFromBackend().catch(() => {});
    } catch (err: any) {
      throw new Error(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const register = async (
    email: string,
    pass: string,
    name: string,
    role: UserRole = 'Admin',
    department?: string,
    designation?: string,
    phone: string = '+91 98250 11223'
  ): Promise<void> => {
    setLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanPass = pass.trim();
      const cleanName = name.trim();

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      // If an existing administrator is already authenticated, send credentials for privilege escalation authorization
      const existingToken = apiClient.getToken() || safeStorage.getItem(AUTH_TOKEN_KEY);
      if (existingToken) {
        headers['Authorization'] = existingToken.startsWith('Bearer ') ? existingToken : `Bearer ${existingToken}`;
        headers['x-admin-token'] = existingToken;
      }

      // Register directly via backend MySQL API
      const res = await fetch(`${apiClient.getBaseUrl()}/auth/register`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: cleanName,
          email: cleanEmail,
          password: cleanPass,
          confirmPassword: cleanPass,
          phone,
          department,
          designation
        })
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch {
        throw new Error(
          res.status === 404
            ? `Admin Registration API endpoint not found (HTTP 404). Please verify that the backend /api routes or reverse-proxy are active.`
            : `Registration server returned HTTP ${res.status} (${res.statusText || 'Non-JSON response'}).`
        );
      }

      if (!res.ok || !data.success || !data.user) {
        throw new Error(data.message || `Registration failed (HTTP ${res.status}).`);
      }

      const u = data.user;
      const newProfile: UserProfile = {
        id: u.id,
        employeeId: u.employeeId || `EMP-ADM-${Date.now().toString().slice(-4)}`,
        name: u.name,
        email: u.email,
        role: (u.role || role) as UserRole,
        phone: u.phone || phone,
        department: u.department || department || 'Administration',
        designation: u.designation || designation || 'Lead Administrator',
        isFieldWorker: false,
        assignedProjects: []
      };

      saveUserProfile(newProfile, data.token);
      await storageService.hydrateFromBackend().catch(() => {});
    } catch (err: any) {
      throw new Error(err?.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setLoading(true);
    try {
      if (currentUser?.id) {
        liveLocationService.sendOffline(currentUser.id, currentUser.email, currentUser.employeeId).catch(() => {});
      }
      try {
        await apiClient.logout();
      } catch (e) {
        console.warn('[Auth] Server logout notification error:', e);
      }

      // Synchronously clear all persistent tokens and auth cache
      safeStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
      safeStorage.removeItem(AUTH_TOKEN_KEY);
      if (currentUser?.id) {
        safeStorage.removeItem(USER_PROFILE_STORAGE_KEY + currentUser.id);
      }
      safeSessionStorage.clear();
      apiClient.setToken(null);
      setCurrentUser(null);

      // Explicitly redirect to login route
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', '/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (email: string): Promise<void> => {
    const clean = email.trim().toLowerCase();
    const employees = storageService.getEmployees();
    const linkedEmp = employees.find(e => e.email && e.email.trim().toLowerCase() === clean);
    const demo = DEMO_ACCOUNTS.find(d => d.email.toLowerCase() === clean);

    if (!linkedEmp && !demo && !clean.includes('rejoy')) {
      throw new Error('No user account found with that email address.');
    }
  };

  const updateRole = (newRole: UserRole) => {
    if (!currentUser) return;
    const def = ROLE_DEFINITIONS.find(r => r.role === newRole);
    const updated: UserProfile = {
      ...currentUser,
      role: newRole,
      department: def?.department || currentUser.department,
      designation: def?.role || currentUser.designation,
      isFieldWorker: Boolean(def?.isFieldWorkerDefault)
    };
    saveUserProfile(updated);
  };

  const switchPersona = (profile: UserProfile) => {
    if (!currentUser) return;
    const def = ROLE_DEFINITIONS.find(r => r.role === profile.role);
    const updated: UserProfile = {
      ...currentUser,
      role: profile.role,
      department: profile.department || def?.department || currentUser.department,
      designation: profile.designation || def?.role || currentUser.designation,
      isFieldWorker: Boolean(profile.isFieldWorker ?? def?.isFieldWorkerDefault)
    };
    saveUserProfile(updated);
  };

  const currentRole: UserRole = currentUser?.role || 'Admin';
  const isCustomer = currentRole === 'Customer';
  const isAdmin = currentRole === 'Admin';
  const isProjectManager = currentRole === 'Project Manager';
  const isFieldStaff = Boolean(
    currentUser?.isFieldWorker ||
    [
      'Site Survey Engineer',
      'Site Inspector',
      'Civil Team',
      'Structure Team',
      'Installation Team',
      'Electrical Team',
      'Technician'
    ].includes(currentRole)
  );

  const hasPermission = (permissionId: string): boolean => {
    if (isAdmin) return true;
    return storageService.hasAclPermission(currentRole, permissionId);
  };

  const canApproveStage = (): boolean => {
    return isAdmin || isProjectManager || hasPermission('projects.stage_approve');
  };

  const canEditFinancials = (): boolean => {
    return isAdmin || currentRole === 'Accountant' || hasPermission('finance.invoices') || hasPermission('finance.receipts');
  };

  const canAccessHR = (): boolean => {
    return isAdmin || currentRole === 'HR Manager' || hasPermission('hrms.manage');
  };

  const canManageProjectAssignments = (): boolean => {
    return isAdmin || hasPermission('projects.assign_team');
  };

  const canAccessModule = (moduleName: string): boolean => {
    if (isAdmin) return true;

    if (isCustomer) {
      return ['customer_portal', 'my_project', 'my_documents', 'my_payments', 'service_request'].includes(moduleName);
    }

    // Role module mapping
    switch (moduleName) {
      case 'dashboard':
        return true;
      case 'live_tracking':
      case 'field_tracking':
        return isAdmin;
      case 'crm':
      case 'crm_leads':
      case 'leads':
      case 'crm_customers':
      case 'customers':
      case 'crm_quotations':
      case 'quotations':
        return (
          hasPermission('crm.leads.view') ||
          hasPermission('crm.quotations.create') ||
          hasPermission('crm.quotations.approve') ||
          ['Sales Manager', 'Sales Executive', 'Project Manager'].includes(currentRole)
        );
      case 'sales_purchase':
      case 'sales':
      case 'purchase':
      case 'inventory':
      case 'bom':
      case 'vendors':
        return hasPermission('inventory.view') || ['Admin', 'Sales Manager', 'Project Manager', 'Accountant'].includes(currentRole);
      case 'projects':
      case 'workflow':
        return hasPermission('projects.view') || !isCustomer;
      case 'site_survey':
        return hasPermission('survey.view') || isAdmin || isProjectManager || currentRole === 'Site Survey Engineer' || currentRole.includes('Sales');
      case 'finance':
      case 'invoices':
      case 'accounting':
      case 'tally':
        return hasPermission('finance.view') || isAdmin || currentRole === 'Accountant';
      case 'hrms':
      case 'employees':
      case 'attendance':
      case 'payroll':
        return hasPermission('hrms.view') || isAdmin || currentRole === 'HR Manager';
      case 'service':
      case 'amc':
        return hasPermission('service.tickets_view') || isAdmin || isProjectManager || currentRole === 'Service Manager' || currentRole === 'Technician';
      case 'reports':
        return hasPermission('reports.view') || isAdmin || isProjectManager || currentRole === 'Sales Manager' || currentRole === 'Accountant';
      case 'users':
      case 'settings':
      case 'roles':
        return isAdmin;
      default:
        return true;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentRole,
        loading,
        isAuthenticated: Boolean(currentUser),
        login,
        register,
        logout,
        resetPassword,
        updateRole,
        switchPersona,
        canAccessModule,
        hasPermission,
        canApproveStage,
        canEditFinancials,
        canAccessHR,
        canManageProjectAssignments,
        isAdmin,
        isCustomer,
        isFieldStaff
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export function getRoleDefaultPath(role?: UserRole): string {
  if (role === 'Customer') return '/customer-portal';
  return '/dashboard';
}
