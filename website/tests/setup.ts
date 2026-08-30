/**
 * Setup file for Vitest tests
 * Configures mock browser APIs (WebCrypto, Storage, fetch, streams)
 */
import { vi } from 'vitest';

// Polyfill WebCrypto if missing or partial in JSDOM
if (!globalThis.crypto || !globalThis.crypto.subtle) {
  const nodeCrypto = require('crypto');
  if (nodeCrypto.webcrypto) {
    Object.defineProperty(globalThis, 'crypto', {
      value: nodeCrypto.webcrypto,
      writable: true,
      configurable: true,
    });
  }
}

// In-memory Storage mock
class StorageMock implements Storage {
  private store: Map<string, string> = new Map();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

if (typeof window !== 'undefined') {
  if (!window.localStorage || typeof window.localStorage.setItem !== 'function') {
    Object.defineProperty(window, 'localStorage', {
      value: new StorageMock(),
      writable: true,
    });
  }
  if (!window.sessionStorage || typeof window.sessionStorage.setItem !== 'function') {
    Object.defineProperty(window, 'sessionStorage', {
      value: new StorageMock(),
      writable: true,
    });
  }

  // URL.createObjectURL and revokeObjectURL
  if (!window.URL.createObjectURL) {
    window.URL.createObjectURL = vi.fn((blob: Blob) => `blob:mock-url-${Math.random().toString(36).slice(2, 9)}`);
  }
  if (!window.URL.revokeObjectURL) {
    window.URL.revokeObjectURL = vi.fn();
  }
}
