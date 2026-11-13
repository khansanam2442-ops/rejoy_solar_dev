import { storageService } from './storage';
import { safeStorage, safeSessionStorage } from './safeStorage';
import { pusherService } from './pusherService';
import { apiClient } from './apiClient';
import {
  LiveEmployeeLocation,
  ELIGIBLE_FIELD_ROLES,
  LocationUpdatePayload,
  PresenceUpdatePayload,
  PRESENCE_TIMEOUT_MS
} from '../types/tracking';

const REAL_LOCATIONS_STORAGE_KEY = 'solarpulse_real_employee_locations_v1';

// Haversine formula to calculate accurate distance between coordinates (in km)
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return Math.round(distance * 10) / 10;
}

// Convert relative timestamp to human readable format ("Just now", "8 sec ago", etc.)
export function formatRelativeTime(isoDate?: string): string {
  if (!isoDate) return 'No updates';
  try {
    const diffMs = Date.now() - new Date(isoDate).getTime();
    if (isNaN(diffMs)) return 'Recently';
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 5) return 'Just now';
    if (diffSec < 60) return `${diffSec} sec ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} hr ago`;
    const diffDay = Math.floor(diffHour / 24);
    return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
  } catch {
    return 'Recently';
  }
}

class LiveLocationService {
  private employeeLocations: Map<string, LiveEmployeeLocation> = new Map();
  // Alias map to resolve by email, employeeCode, or authUid to the primary verified employee id
  private alternateIdMap: Map<string, string> = new Map();
  private serverVerifiedIds: Set<string> = new Set();
  private listeners: Set<(locations: LiveEmployeeLocation[]) => void> = new Set();
  private errorListeners: Set<(error: string | null) => void> = new Set();
  private lastFetchError: string | null = null;
  private unsubscribeLocationPusher: (() => void) | null = null;
  private unsubscribePresencePusher: (() => void) | null = null;
  private staleCheckTimer: any = null;
  private pollTimer: any = null;
  private trackingEnabled: boolean = false;
  private isLocationSharing: boolean = false;

  constructor() {
    // Purge any legacy persisted location caches from browser storage
    try {
      safeStorage.removeItem(REAL_LOCATIONS_STORAGE_KEY);
      safeSessionStorage.removeItem(REAL_LOCATIONS_STORAGE_KEY);
    } catch {}

    // 1. Listen to real-time location stream from Pusher
    this.unsubscribeLocationPusher = pusherService.onLocationUpdate((payload) => {
      this.handleIncomingLocation(payload);
    });

    // 2. Listen to real-time presence stream from Pusher
    this.unsubscribePresencePusher = pusherService.onPresenceUpdate((payload) => {
      this.handleIncomingPresence(payload);
    });
  }

  private setFetchError(error: string | null): void {
    if (this.lastFetchError === error) return;
    this.lastFetchError = error;
    this.errorListeners.forEach((listener) => {
      try {
        listener(error);
      } catch (e) {
        console.error('[Workforce] Error in error subscriber:', e);
      }
    });
  }

  public getFetchError(): string | null {
    return this.lastFetchError;
  }

  public subscribeError(callback: (error: string | null) => void): () => void {
    this.errorListeners.add(callback);
    callback(this.lastFetchError);
    return () => {
      this.errorListeners.delete(callback);
    };
  }

  /**
   * Enable or disable workforce location/presence polling based on authenticated staff session.
   * Prevents unauthenticated /login or customer sessions from polling /api/workforce/locations.
   */
  public setTrackingEnabled(enabled: boolean): void {
    if (this.trackingEnabled === enabled) {
      if (enabled && typeof window !== 'undefined') {
        this.initializeFieldWorkers();
        this.fetchServerLocations();
      }
      return;
    }

    this.trackingEnabled = enabled;

    if (!enabled) {
      this.isLocationSharing = false;
      this.serverVerifiedIds.clear();
      this.setFetchError(null);
      if (this.staleCheckTimer) {
        clearInterval(this.staleCheckTimer);
        this.staleCheckTimer = null;
      }
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
      this.employeeLocations.clear();
      this.alternateIdMap.clear();
      this.notifyListeners();
      return;
    }

    if (typeof window !== 'undefined') {
      pusherService.init();
      this.initializeFieldWorkers();

      if (!this.staleCheckTimer) {
        this.staleCheckTimer = setInterval(() => {
          this.checkStaleLocations();
        }, 15000);
      }

      // Perform initial load from server once authenticated
      this.fetchServerLocations();

      // Recurring background polling every 8s ensures admin console and map auto-sync with MySQL
      if (!this.pollTimer) {
        this.pollTimer = setInterval(() => {
          this.fetchServerLocations();
        }, 8000);
      }
    }
  }

  // Check whether an employee role is eligible for field tracking
  isEligibleFieldWorker(role: string, department?: string, isFieldWorkerFlag?: boolean): boolean {
    const normalizedRole = (role || '').toLowerCase().trim();
    if (!normalizedRole && !isFieldWorkerFlag) return false;
    if (normalizedRole === 'customer' || normalizedRole.includes('customer')) {
      return false;
    }

    if (isFieldWorkerFlag === true) {
      return true;
    }

    const normalizedDept = (department || '').toLowerCase().trim();

    // Disqualify customer, admin, and office-only roles unless explicitly marked isFieldWorker
    if (
      normalizedRole === 'admin' ||
      normalizedRole === 'super admin' ||
      normalizedRole.includes('accountant') ||
      normalizedRole.includes('finance') ||
      normalizedRole.includes('hr') ||
      normalizedRole.includes('director') ||
      normalizedRole.includes('executive assistant') ||
      normalizedDept.includes('hr') ||
      normalizedDept.includes('finance') ||
      normalizedDept.includes('accounting')
    ) {
      return false;
    }

    // Match against eligible field worker titles or field departments
    return (
      ELIGIBLE_FIELD_ROLES.some((r) =>
        normalizedRole.includes(r.toLowerCase())
      ) ||
      normalizedDept.includes('engineering') ||
      normalizedDept.includes('installation') ||
      normalizedDept.includes('electrical') ||
      normalizedDept.includes('civil') ||
      normalizedDept.includes('structure') ||
      normalizedDept.includes('service')
    );
  }

  public setLocationSharingActive(active: boolean) {
    this.isLocationSharing = active;
  }

  public isLocationSharingActive(): boolean {
    return this.isLocationSharing;
  }

  private getVerifiedActiveFieldEmployees(): any[] {
    try {
      const rawEmployees = [...storageService.getEmployees()];
      const rawUsers = storageService.getUsers();

      // Build quick map of users to cross-check disabled status & isFieldWorker flag
      const userByIdOrEmail = new Map<string, any>();
      rawUsers.forEach((u: any) => {
        if (u.id) userByIdOrEmail.set(String(u.id).toLowerCase(), u);
        if (u.email) userByIdOrEmail.set(String(u.email).trim().toLowerCase(), u);
      });

      const merged: any[] = [];
      const seenIds = new Set<string>();
      const seenEmails = new Set<string>();

      rawEmployees.forEach((emp: any) => {
        if (!emp || !emp.id) return;
        const emailKey = (emp.email || '').trim().toLowerCase();
        const linkedUser =
          userByIdOrEmail.get(String(emp.id).toLowerCase()) ||
          (emailKey ? userByIdOrEmail.get(emailKey) : undefined);

        const empStatus = String(emp.status || 'ACTIVE').toUpperCase();
        const acctStatus = String(emp.accountStatus || 'ACTIVE').toUpperCase();
        const userStatus = linkedUser ? String(linkedUser.status || 'ACTIVE').toUpperCase() : 'ACTIVE';
        const isActive =
          empStatus !== 'DISABLED' &&
          empStatus !== 'INACTIVE' &&
          empStatus !== 'TERMINATED' &&
          acctStatus !== 'DISABLED' &&
          userStatus !== 'DISABLED' &&
          userStatus !== 'INACTIVE' &&
          emp.loginEnabled !== false &&
          (linkedUser ? linkedUser.active !== false : true);

        if (!isActive) return;

        const role = emp.systemRole || emp.designation || linkedUser?.role || '';
        const dept = emp.department || linkedUser?.department || '';
        const isFieldFlag = Boolean(emp.isFieldWorker ?? linkedUser?.isFieldWorker);

        if (!this.isEligibleFieldWorker(role, dept, isFieldFlag)) return;

        seenIds.add(String(emp.id).toLowerCase());
        if (emailKey) seenEmails.add(emailKey);
        merged.push({
          ...emp,
          role,
          department: dept || 'Operations',
          isFieldWorker: isFieldFlag
        });
      });

      // Include any active eligible field users in solar_users not already covered in solar_employees
      rawUsers.forEach((u: any) => {
        if (!u || !u.id) return;
        const idKey = String(u.id).toLowerCase();
        const emailKey = (u.email || '').trim().toLowerCase();
        if (seenIds.has(idKey) || (emailKey && seenEmails.has(emailKey))) return;

        const uStatus = String(u.status || 'ACTIVE').toUpperCase();
        const isActive =
          uStatus !== 'DISABLED' &&
          uStatus !== 'INACTIVE' &&
          u.active !== false &&
          u.role !== 'Customer';
        if (!isActive) return;

        const role = u.role || u.designation || '';
        const dept = u.department || '';
        const isFieldFlag = Boolean(u.isFieldWorker);
        if (!this.isEligibleFieldWorker(role, dept, isFieldFlag)) return;

        seenIds.add(idKey);
        if (emailKey) seenEmails.add(emailKey);
        merged.push({
          id: u.id,
          employeeCode: u.employeeId || u.id,
          name: u.name,
          email: u.email,
          phone: u.phone || '',
          department: dept || 'Operations',
          designation: u.designation || u.role,
          systemRole: u.role,
          role,
          status: 'ACTIVE',
          isFieldWorker: isFieldFlag
        });
      });

      return merged;
    } catch {
      return [];
    }
  }

  /**
   * Resolves any user identifier (emp-id, email, code, auth uid) to canonical verified employee ID
   */
  public resolveCanonicalId(rawId: string, email?: string, employeeCode?: string, alternateUserId?: string): string {
    const cleanId = rawId ? rawId.trim().toLowerCase() : '';
    const cleanAlt = alternateUserId ? alternateUserId.trim().toLowerCase() : '';
    const cleanEmail = email ? email.trim().toLowerCase() : '';
    const cleanCode = employeeCode ? employeeCode.trim().toLowerCase() : '';

    if (!cleanId && !cleanEmail && !cleanCode && !cleanAlt) return rawId || '';

    // Direct match in active verified locations
    if (rawId && this.employeeLocations.has(rawId)) return rawId;
    if (alternateUserId && this.employeeLocations.has(alternateUserId)) return alternateUserId;

    // Check alias maps
    if (cleanId && this.alternateIdMap.has(cleanId)) return this.alternateIdMap.get(cleanId)!;
    if (cleanAlt && this.alternateIdMap.has(cleanAlt)) return this.alternateIdMap.get(cleanAlt)!;
    if (cleanEmail && this.alternateIdMap.has(cleanEmail)) return this.alternateIdMap.get(cleanEmail)!;
    if (cleanCode && this.alternateIdMap.has(cleanCode)) return this.alternateIdMap.get(cleanCode)!;

    // Search active locations in memory by email or employeeCode
    for (const [id, emp] of this.employeeLocations.entries()) {
      if (cleanEmail && emp.email && emp.email.trim().toLowerCase() === cleanEmail) {
        if (cleanId) this.alternateIdMap.set(cleanId, id);
        if (cleanAlt) this.alternateIdMap.set(cleanAlt, id);
        return id;
      }
      if (cleanCode && emp.employeeCode && emp.employeeCode.trim().toLowerCase() === cleanCode) {
        if (cleanId) this.alternateIdMap.set(cleanId, id);
        if (cleanAlt) this.alternateIdMap.set(cleanAlt, id);
        return id;
      }
    }

    // Search verified active field staff from MySQL bootstrap
    const verifiedFieldStaff = this.getVerifiedActiveFieldEmployees();
    for (const emp of verifiedFieldStaff) {
      const empId = emp.id;
      const matchEmail = cleanEmail && emp.email && emp.email.trim().toLowerCase() === cleanEmail;
      const matchCode = cleanCode && emp.employeeCode && emp.employeeCode.trim().toLowerCase() === cleanCode;
      const matchAuth = (cleanId && emp.authUid && emp.authUid.trim().toLowerCase() === cleanId) ||
                        (cleanAlt && emp.authUid && emp.authUid.trim().toLowerCase() === cleanAlt);
      const matchId = (cleanId && emp.id && emp.id.trim().toLowerCase() === cleanId) ||
                      (cleanAlt && emp.id && emp.id.trim().toLowerCase() === cleanAlt);

      if (matchEmail || matchCode || matchAuth || matchId) {
        if (cleanId) this.alternateIdMap.set(cleanId, empId);
        if (cleanAlt) this.alternateIdMap.set(cleanAlt, empId);
        if (cleanEmail) this.alternateIdMap.set(cleanEmail, empId);
        if (cleanCode) this.alternateIdMap.set(cleanCode, empId);
        return empId;
      }
    }

    return rawId;
  }

  private initializeFieldWorkers() {
    if (!this.trackingEnabled) return;

    const allFieldEmployees = this.getVerifiedActiveFieldEmployees();
    const allProjects = storageService.getProjects();
    const verifiedIds = new Set<string>();

    this.alternateIdMap.clear();
    allFieldEmployees.forEach((emp) => {
      verifiedIds.add(emp.id);
      if (emp.id) this.alternateIdMap.set(String(emp.id).toLowerCase(), emp.id);
      if (emp.employeeCode) this.alternateIdMap.set(String(emp.employeeCode).toLowerCase(), emp.id);
      if (emp.email) this.alternateIdMap.set(String(emp.email).trim().toLowerCase(), emp.id);
      if (emp.authUid) this.alternateIdMap.set(String(emp.authUid).toLowerCase(), emp.id);
    });

    // Prune any unverified / deleted / non-field workers from memory
    for (const key of Array.from(this.employeeLocations.keys())) {
      if (!verifiedIds.has(key) && !this.serverVerifiedIds.has(key)) {
        this.employeeLocations.delete(key);
      }
    }

    // Initialize verified active field staff from MySQL bootstrap metadata
    allFieldEmployees.forEach((emp) => {
      const assignedProject = allProjects.find(
        (p) =>
          p.projectManagerId === emp.id ||
          (p.assignedUsers && p.assignedUsers.some((u) => u.userId === emp.id))
      );

      const cached = this.employeeLocations.get(emp.id);
      const hasRealCoordinates = Boolean(cached?.latitude && cached?.longitude && !isNaN(cached.latitude) && !isNaN(cached.longitude));
      const isOnline = cached?.isOnline ?? false;

      const record: LiveEmployeeLocation = {
        userId: emp.id,
        employeeCode: emp.employeeCode || emp.id,
        name: emp.name,
        email: emp.email,
        role: emp.role || emp.systemRole || emp.designation || 'Field Engineer',
        avatar: emp.photoUrl,
        phone: emp.phone || '',
        department: emp.department || 'Operations',
        designation: emp.designation,

        isOnline,
        isSharingLocation: cached?.isSharingLocation ?? false,
        lastSeenAt: cached?.lastSeenAt,

        latitude: hasRealCoordinates ? cached.latitude : undefined,
        longitude: hasRealCoordinates ? cached.longitude : undefined,
        hasLocation: Boolean(hasRealCoordinates),

        accuracy: hasRealCoordinates ? cached.accuracy : undefined,
        heading: hasRealCoordinates ? cached.heading : undefined,
        speed: hasRealCoordinates ? cached.speed : undefined,
        updatedAt: cached?.updatedAt || new Date().toISOString(),

        status: !isOnline
          ? 'offline'
          : hasRealCoordinates
          ? ((cached?.speed || 0) > 3 ? 'moving' : 'idle')
          : 'online',

        batteryLevel: cached?.batteryLevel,
        currentActivity: !hasRealCoordinates
          ? (isOnline ? 'Online • Location Standby' : 'Location unavailable')
          : cached?.currentActivity || 'Field Operations',
        lastLocationAddress: cached?.lastLocationAddress
      };

      if (assignedProject) {
        record.assignedProjectId = assignedProject.id;
        record.assignedProjectCode = assignedProject.projectCode;
        record.assignedProjectTitle = `${assignedProject.capacityKw} kW ${assignedProject.systemType || 'Solar EPC'} - ${assignedProject.customerName}`;
        record.assignedCustomerName = assignedProject.customerName;
        record.assignedSiteAddress = assignedProject.siteAddress || assignedProject.city;

        if (assignedProject.latitude && assignedProject.longitude) {
          record.assignedSiteCoordinates = {
            latitude: assignedProject.latitude,
            longitude: assignedProject.longitude
          };
          if (record.hasLocation && record.latitude !== undefined && record.longitude !== undefined) {
            record.distanceToSiteKm = calculateDistanceKm(
              record.latitude,
              record.longitude,
              assignedProject.latitude,
              assignedProject.longitude
            );
          }
        }
      }

      this.employeeLocations.set(emp.id, record);
    });

    this.notifyListeners();
  }

  /**
   * Admin Initial Load: Fetch latest known locations & presence from central server (MySQL joined)
   */
  async fetchServerLocations(): Promise<void> {
    if (!this.trackingEnabled) return;
    try {
      const url = `${apiClient.getBaseUrl()}/workforce/locations`;
      const res = await apiClient.request(url);
      if (!res.ok) {
        let message = `Unable to load field workforce telemetry (HTTP ${res.status})`;
        try {
          const errJson = await res.json();
          if (errJson?.message || errJson?.error) {
            message = errJson.message || errJson.error;
          }
        } catch {}
        this.setFetchError(message);
        return;
      }

      const data = await res.json();
      if (!data.success || !Array.isArray(data.locations)) {
        this.setFetchError(data?.message || data?.error || 'Unexpected response from workforce tracking API');
        return;
      }

      this.setFetchError(null);
      const now = Date.now();
      const verifiedFieldEmployees = this.getVerifiedActiveFieldEmployees();
      const verifiedLocalIds = new Set(verifiedFieldEmployees.map((e) => e.id));
      const nextServerVerifiedIds = new Set<string>();

      // Re-index aliases against verified active staff before reconciling server response
      this.initializeFieldWorkers();

      data.locations.forEach((srv: any) => {
        if (!srv || !srv.userId || srv.verified === false) return;
        const role = srv.role || '';
        const dept = srv.department || '';
        const isFieldFlag = Boolean(srv.isFieldWorker);
        if (!this.isEligibleFieldWorker(role, dept, isFieldFlag)) {
          return;
        }

        const targetId = this.resolveCanonicalId(srv.userId, srv.email, srv.employeeCode);
        nextServerVerifiedIds.add(targetId);

        const existing = this.employeeLocations.get(targetId);
        const hasCoords = typeof srv.latitude === 'number' && typeof srv.longitude === 'number';
        const lastSeenMs = srv.lastSeenAt ? new Date(srv.lastSeenAt).getTime() : 0;
        const existingLastSeenMs = existing?.lastSeenAt ? new Date(existing.lastSeenAt).getTime() : 0;

        // Guard against older server snapshot clobbering newer local presence fix
        if (existing && existing.isOnline && srv.lastSeenAt && lastSeenMs < existingLastSeenMs && !srv.isOnline) {
          return;
        }

        const isOnline = Boolean(srv.isOnline) || (lastSeenMs > 0 && Math.abs(now - lastSeenMs) < PRESENCE_TIMEOUT_MS);
        const effectiveLastSeen = srv.lastSeenAt || existing?.lastSeenAt || new Date().toISOString();

        if (existing) {
          existing.isOnline = isOnline;
          existing.lastSeenAt = effectiveLastSeen;
          if (typeof srv.isSharingLocation === 'boolean') {
            existing.isSharingLocation = srv.isSharingLocation;
          }
          // Authoritative MySQL staff fields always win
          if (srv.name) existing.name = srv.name;
          if (srv.role) existing.role = srv.role;
          if (srv.employeeCode) existing.employeeCode = srv.employeeCode;
          if (srv.email) existing.email = srv.email;
          if (srv.department) existing.department = srv.department;
          if (srv.phone) existing.phone = srv.phone;

          if (hasCoords) {
            existing.latitude = srv.latitude;
            existing.longitude = srv.longitude;
            existing.hasLocation = true;
            existing.accuracy = srv.accuracy;
            existing.heading = srv.heading;
            existing.speed = srv.speed;
            existing.batteryLevel = srv.batteryLevel ?? existing.batteryLevel;
            existing.currentActivity = srv.activity || existing.currentActivity;
            existing.updatedAt = srv.updatedAt || effectiveLastSeen;

            if (existing.assignedSiteCoordinates) {
              existing.distanceToSiteKm = calculateDistanceKm(
                srv.latitude,
                srv.longitude,
                existing.assignedSiteCoordinates.latitude,
                existing.assignedSiteCoordinates.longitude
              );
            }
          }

          existing.status = !isOnline
            ? 'offline'
            : existing.hasLocation && typeof existing.latitude === 'number'
            ? ((existing.speed || 0) > 3 ? 'moving' : 'idle')
            : 'online';

          if (!existing.hasLocation && isOnline) {
            existing.currentActivity = existing.isSharingLocation
              ? 'Online • Awaiting GPS fix'
              : 'Online • Standby';
          }

          this.employeeLocations.set(targetId, { ...existing });
        } else {
          // Verified by backend SQL JOIN against solar_users / solar_employees
          const newRecord: LiveEmployeeLocation = {
            userId: targetId,
            employeeCode: srv.employeeCode || targetId,
            name: srv.name,
            email: srv.email,
            role: srv.role,
            phone: srv.phone || '',
            department: srv.department || 'Operations',
            isOnline,
            isSharingLocation: srv.isSharingLocation ?? true,
            lastSeenAt: effectiveLastSeen,
            latitude: hasCoords ? srv.latitude : undefined,
            longitude: hasCoords ? srv.longitude : undefined,
            hasLocation: hasCoords,
            accuracy: srv.accuracy,
            heading: srv.heading,
            speed: srv.speed,
            batteryLevel: srv.batteryLevel,
            currentActivity: !isOnline
              ? 'Offline'
              : hasCoords
              ? (srv.speed && srv.speed > 3 ? 'In Transit / Moving' : 'On Site / Active')
              : (srv.isSharingLocation ? 'Online • Awaiting GPS fix' : 'Online • Standby'),
            updatedAt: srv.updatedAt || effectiveLastSeen,
            status: !isOnline ? 'offline' : hasCoords ? ((srv.speed || 0) > 3 ? 'moving' : 'idle') : 'online'
          };
          this.employeeLocations.set(targetId, newRecord);
          this.alternateIdMap.set(targetId.toLowerCase(), targetId);
          if (srv.userId && srv.userId !== targetId) {
            this.alternateIdMap.set(String(srv.userId).toLowerCase(), targetId);
          }
          if (srv.email) this.alternateIdMap.set(String(srv.email).trim().toLowerCase(), targetId);
          if (srv.employeeCode) this.alternateIdMap.set(String(srv.employeeCode).toLowerCase(), targetId);
        }
      });

      this.serverVerifiedIds = nextServerVerifiedIds;

      // Remove any stale/deleted entries no longer verified in MySQL
      for (const key of Array.from(this.employeeLocations.keys())) {
        if (!nextServerVerifiedIds.has(key) && !verifiedLocalIds.has(key)) {
          this.employeeLocations.delete(key);
        }
      }

      this.notifyListeners();
    } catch (err: any) {
      const msg = err?.message || 'Network error reaching workforce tracking endpoint';
      console.warn('[Workforce] Could not fetch server locations:', err);
      this.setFetchError(msg);
    }
  }

  /**
   * Process Real-Time GPS Location updates from Pusher / SSE.
   * Rejects any event whose userId does not resolve to an existing verified active MySQL field worker.
   */
  private handleIncomingLocation(payload: LocationUpdatePayload) {
    if (!this.trackingEnabled) return;
    if (!payload || !payload.userId || typeof payload.latitude !== 'number' || typeof payload.longitude !== 'number') {
      return;
    }

    const canonicalId = this.resolveCanonicalId(payload.userId, undefined, payload.employeeCode);
    const existing = this.employeeLocations.get(canonicalId);
    if (!existing) {
      // Never dynamically create ghost workforce entries from Pusher/SSE broadcasts
      return;
    }

    const speed = payload.speed !== undefined ? payload.speed : 0;
    const isMoving = speed > 3;
    const timestamp = payload.timestamp || new Date().toISOString();

    const updated: LiveEmployeeLocation = {
      ...existing,
      latitude: payload.latitude,
      longitude: payload.longitude,
      hasLocation: true,
      isOnline: true,
      isSharingLocation: true,
      accuracy: payload.accuracy,
      heading: payload.heading,
      speed: payload.speed,
      batteryLevel: payload.batteryLevel ?? existing.batteryLevel,
      currentActivity: payload.activity || (isMoving ? 'In Transit / Moving' : 'On Site / Active'),
      updatedAt: timestamp,
      lastSeenAt: timestamp,
      status: isMoving ? 'moving' : 'idle'
    };

    if (updated.assignedSiteCoordinates) {
      updated.distanceToSiteKm = calculateDistanceKm(
        payload.latitude,
        payload.longitude,
        updated.assignedSiteCoordinates.latitude,
        updated.assignedSiteCoordinates.longitude
      );
    }

    this.employeeLocations.set(canonicalId, updated);
    this.notifyListeners();
  }

  /**
   * Process Real-Time Presence updates from Pusher / SSE.
   * Rejects any event whose userId does not resolve to an existing verified active MySQL field worker.
   */
  private handleIncomingPresence(payload: PresenceUpdatePayload) {
    if (!this.trackingEnabled) return;
    if (!payload || !payload.userId) return;

    const canonicalId = this.resolveCanonicalId(
      payload.userId,
      payload.email,
      payload.employeeCode,
      payload.alternateUserId
    );
    const existing = this.employeeLocations.get(canonicalId);
    if (!existing) {
      // Never dynamically create ghost workforce entries from Pusher/SSE presence events
      return;
    }

    const isOnline = Boolean(payload.isOnline);
    const timestamp = payload.lastSeenAt || new Date().toISOString();
    const payloadTime = new Date(timestamp).getTime();
    const existingTime = existing.lastSeenAt ? new Date(existing.lastSeenAt).getTime() : 0;

    // Guard against out-of-order older Pusher events marking a newer online user offline
    if (existing.isOnline && payloadTime < existingTime && !isOnline) {
      return;
    }

    const hasPayloadCoords = typeof payload.latitude === 'number' && typeof payload.longitude === 'number';

    existing.isOnline = isOnline;
    existing.lastSeenAt = timestamp;
    existing.updatedAt = timestamp;
    if (typeof payload.isSharingLocation === 'boolean') {
      existing.isSharingLocation = payload.isSharingLocation;
    }

    if (hasPayloadCoords) {
      existing.latitude = payload.latitude;
      existing.longitude = payload.longitude;
      existing.hasLocation = true;
      if (payload.accuracy !== undefined) existing.accuracy = payload.accuracy;
      if (payload.speed !== undefined) existing.speed = payload.speed;
    }

    const hasCoords = Boolean(existing.hasLocation && typeof existing.latitude === 'number' && typeof existing.longitude === 'number');

    // Determine status independently from GPS
    if (!isOnline) {
      existing.status = 'offline';
      existing.currentActivity = 'Offline';
    } else if (hasCoords) {
      existing.status = (existing.speed && existing.speed > 3) ? 'moving' : 'idle';
      existing.currentActivity = (existing.speed && existing.speed > 3) ? 'In Transit / Moving' : 'On Site / Active';
    } else {
      existing.status = 'online';
      existing.currentActivity = existing.isSharingLocation
        ? 'Online • Awaiting GPS fix'
        : 'Online • Standby';
    }

    this.employeeLocations.set(canonicalId, { ...existing });
    this.notifyListeners();
  }

  /**
   * Periodic stale presence check (strictly checks presence timeout, NOT location loss)
   */
  private checkStaleLocations() {
    let hasChanges = false;
    const now = Date.now();

    this.employeeLocations.forEach((emp) => {
      if (emp.isOnline) {
        const lastSeenMs = emp.lastSeenAt ? new Date(emp.lastSeenAt).getTime() : 0;
        if (lastSeenMs > 0 && now - lastSeenMs > PRESENCE_TIMEOUT_MS) {
          emp.isOnline = false;
          emp.isSharingLocation = false;
          emp.status = 'offline';
          emp.currentActivity = 'Signal stale (offline)';
          hasChanges = true;
        }
      }
    });

    if (hasChanges) {
      this.notifyListeners();
    }
  }

  /**
   * Called by Field Worker device to broadcast real GPS coordinates
   */
  async updateEmployeeLocation(
    userId: string,
    coords: {
      latitude: number;
      longitude: number;
      accuracy?: number;
      speed?: number;
      heading?: number;
      batteryLevel?: number;
      activity?: string;
      employeeCode?: string;
      name?: string;
      role?: string;
    }
  ): Promise<boolean> {
    const payload: LocationUpdatePayload = {
      userId,
      employeeCode: coords.employeeCode,
      name: coords.name,
      role: coords.role,
      latitude: coords.latitude,
      longitude: coords.longitude,
      accuracy: coords.accuracy,
      speed: coords.speed,
      heading: coords.heading,
      batteryLevel: coords.batteryLevel,
      activity: coords.activity,
      timestamp: new Date().toISOString()
    };

    return pusherService.broadcastLocation(payload);
  }

  /**
   * Called to send heartbeat to backend
   */
  async sendHeartbeat(data: {
    userId: string;
    employeeCode?: string;
    name?: string;
    email?: string;
    role?: string;
    isSharingLocation: boolean;
  }): Promise<boolean> {
    return pusherService.sendHeartbeat(data);
  }

  /**
   * Called when stopping location sharing or logging out
   */
  async sendOffline(userId: string, email?: string, employeeCode?: string): Promise<boolean> {
    return pusherService.sendOffline(userId, email, employeeCode);
  }

  getLocations(): LiveEmployeeLocation[] {
    return Array.from(this.employeeLocations.values());
  }

  getEmployeeLocation(userId: string): LiveEmployeeLocation | undefined {
    const canonical = this.resolveCanonicalId(userId);
    return this.employeeLocations.get(canonical);
  }

  subscribe(callback: (locations: LiveEmployeeLocation[]) => void): () => void {
    this.listeners.add(callback);
    callback(this.getLocations());
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners() {
    const list = this.getLocations();
    this.listeners.forEach((listener) => {
      try {
        listener(list);
      } catch (e) {
        console.error('Error in location subscriber:', e);
      }
    });
  }

  destroy() {
    if (this.unsubscribeLocationPusher) {
      this.unsubscribeLocationPusher();
      this.unsubscribeLocationPusher = null;
    }
    if (this.unsubscribePresencePusher) {
      this.unsubscribePresencePusher();
      this.unsubscribePresencePusher = null;
    }
    if (this.staleCheckTimer) {
      clearInterval(this.staleCheckTimer);
      this.staleCheckTimer = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.trackingEnabled = false;
    this.listeners.clear();
    this.errorListeners.clear();
  }
}

export const liveLocationService = new LiveLocationService();
