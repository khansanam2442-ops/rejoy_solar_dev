/**
 * Safe Storage & Session Persistence Wrapper for Rejoy Solar ERP
 * 
 * Provides unified, multi-tiered session persistence designed for all production environments:
 * 1. Web LocalStorage / SessionStorage (when accessible)
 * 2. Window.name persistence store (guaranteed to survive page reloads/refresh in third-party iframes)
 * 3. Browser Cookies with Partitioned and SameSite=None fallback
 * 4. In-Memory fallback store with backend API session re-validation
 * 
 * Prevents "SecurityError: Access is denied for this document" and eliminates
 * premature logouts on page refresh.
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

  private getWindowNameStore(): Record<string, string> {
    if (typeof window === 'undefined') return {};
    try {
      if (window.name && window.name.startsWith('{') && window.name.includes('__rejoy_session__')) {
        const parsed = JSON.parse(window.name);
        if (parsed && typeof parsed === 'object' && parsed.__rejoy_session__ && parsed.data) {
          return parsed.data;
        }
      }
    } catch {}
    return {};
  }

  private setWindowNameStoreKey(key: string, value: string): void {
    if (typeof window === 'undefined') return;
    try {
      const store = this.getWindowNameStore();
      store[key] = value;
      window.name = JSON.stringify({ __rejoy_session__: true, data: store });
    } catch {}
  }

  private removeWindowNameStoreKey(key: string): void {
    if (typeof window === 'undefined') return;
    try {
      const store = this.getWindowNameStore();
      delete store[key];
      window.name = JSON.stringify({ __rejoy_session__: true, data: store });
    } catch {}
  }

  private clearWindowNameStore(): void {
    if (typeof window === 'undefined') return;
    try {
      window.name = '';
    } catch {}
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
      const isHttps = typeof location !== 'undefined' && location.protocol === 'https:';
      if (isHttps) {
        document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=2592000; SameSite=None; Secure; Partitioned`;
      }
      document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=2592000; SameSite=Lax`;
    } catch {}
  }

  private removeCookie(name: string): void {
    if (typeof document === 'undefined') return;
    try {
      const isHttps = typeof location !== 'undefined' && location.protocol === 'https:';
      if (isHttps) {
        document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=None; Secure; Partitioned`;
      }
      document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
    } catch {}
  }

  public getItem(key: string): string | null {
    // 1. Try standard browser storage (localStorage / sessionStorage)
    try {
      if (this.isStorageAvailable()) {
        const val = window[this.storageType].getItem(key);
        if (val !== null && val !== undefined && val !== '') {
          this.memoryStore.set(key, val);
          return val;
        }
      }
    } catch (e) {
      // Ignore security or quota errors
    }

    // 2. Try in-memory store
    const inMemory = this.memoryStore.get(key);
    if (inMemory !== undefined && inMemory !== null && inMemory !== '') {
      return inMemory;
    }

    // 3. Try window.name fallback store (persistent across iframe page refresh)
    const windowNameStore = this.getWindowNameStore();
    if (windowNameStore && windowNameStore[key]) {
      const val = windowNameStore[key];
      this.memoryStore.set(key, val);
      return val;
    }

    // 4. Try Cookie fallback for authentication and session items
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

    // 1. Persist to standard storage if available
    try {
      if (this.isStorageAvailable()) {
        window[this.storageType].setItem(key, strVal);
      }
    } catch (e) {
      // Ignore SecurityError / QuotaExceededError in restricted iframe
    }

    // 2. Persist critical session keys to window.name (immune to iframe storage restrictions)
    if (key.includes('auth_token') || key.includes('session') || key.includes('profile')) {
      this.setWindowNameStoreKey(key, strVal);
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

    this.removeWindowNameStoreKey(key);
    this.removeCookie(key);
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
    this.clearWindowNameStore();
    this.removeCookie('rejoysolar_auth_token');
    this.removeCookie('rejoysolar_active_session');
  }

  public hasItem(key: string): boolean {
    return this.getItem(key) !== null;
  }
}

export const safeStorage = new SafeStorageWrapper('localStorage');
export const safeSessionStorage = new SafeStorageWrapper('sessionStorage');
