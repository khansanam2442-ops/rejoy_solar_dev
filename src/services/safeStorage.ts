/**
 * Safe Storage Wrapper for Rejoy Solar ERP
 * 
 * In iframe / sandboxed / cross-origin / third-party cookie restricted environments,
 * direct access to window.localStorage or window.sessionStorage throws:
 * "SecurityError: Failed to read the 'localStorage' property from 'Window': Access is denied for this document."
 * 
 * This module wraps all storage interactions in bulletproof try/catch blocks with an
 * in-memory fallback store so the application never crashes, while preserving active session
 * state and delegating authoritative persistence to the MySQL backend API.
 */

class SafeStorageWrapper {
  private memoryStore: Map<string, string> = new Map();
  private storageType: 'localStorage' | 'sessionStorage';
  private checkedAvailability = false;
  private available = false;

  constructor(type: 'localStorage' | 'sessionStorage') {
    this.storageType = type;
  }

  private isStorageAvailable(): boolean {
    if (this.checkedAvailability) {
      return this.available;
    }
    if (typeof window === 'undefined') {
      this.available = false;
      this.checkedAvailability = true;
      return false;
    }
    try {
      const storage = window[this.storageType];
      if (!storage) {
        this.available = false;
        this.checkedAvailability = true;
        return false;
      }
      const testKey = '__solarpulse_storage_probe__';
      storage.setItem(testKey, '1');
      storage.removeItem(testKey);
      this.available = true;
    } catch {
      // Access denied / SecurityError in iframe or privacy mode
      this.available = false;
    }
    this.checkedAvailability = true;
    return this.available;
  }

  private getCookie(name: string): string | null {
    if (typeof document === 'undefined') return null;
    try {
      const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
      return match ? decodeURIComponent(match[3]) : null;
    } catch {
      return null;
    }
  }

  private setCookie(name: string, value: string): void {
    if (typeof document === 'undefined') return;
    try {
      document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax; Max-Age=2592000`;
    } catch {}
  }

  private removeCookie(name: string): void {
    if (typeof document === 'undefined') return;
    try {
      document.cookie = `${name}=; Path=/; SameSite=Lax; Max-Age=0`;
    } catch {}
  }

  public getItem(key: string): string | null {
    try {
      if (this.isStorageAvailable()) {
        const val = window[this.storageType].getItem(key);
        if (val !== null) return val;
      }
    } catch (e) {
      // Ignore security or quota errors and fall back to memory/cookies
    }

    const inMemory = this.memoryStore.get(key);
    if (inMemory !== undefined) return inMemory;

    // Cookie fallback for critical authentication tokens if localStorage is blocked
    if (key.includes('auth_token') || key.includes('session')) {
      const fromCookie = this.getCookie(key);
      if (fromCookie) {
        this.memoryStore.set(key, fromCookie);
        return fromCookie;
      }
    }

    return null;
  }

  public setItem(key: string, value: string): void {
    const strVal = String(value);
    this.memoryStore.set(key, strVal);
    try {
      if (this.isStorageAvailable()) {
        window[this.storageType].setItem(key, strVal);
      }
    } catch (e) {
      // Ignore SecurityError / QuotaExceededError in restricted iframe
    }

    if (key.includes('auth_token') || key.includes('session')) {
      this.setCookie(key, strVal);
    }
  }

  public removeItem(key: string): void {
    this.memoryStore.delete(key);
    try {
      if (this.isStorageAvailable()) {
        window[this.storageType].removeItem(key);
      }
    } catch (e) {
      // Ignore SecurityError
    }

    if (key.includes('auth_token') || key.includes('session')) {
      this.removeCookie(key);
    }
  }

  public clear(): void {
    this.memoryStore.clear();
    try {
      if (this.isStorageAvailable()) {
        window[this.storageType].clear();
      }
    } catch (e) {
      // Ignore SecurityError
    }
    this.removeCookie('rejoysolar_auth_token');
    this.removeCookie('rejoysolar_active_session');
  }

  public hasItem(key: string): boolean {
    return this.getItem(key) !== null;
  }
}

export const safeStorage = new SafeStorageWrapper('localStorage');
export const safeSessionStorage = new SafeStorageWrapper('sessionStorage');
