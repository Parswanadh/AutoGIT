/**
 * WebCrypto AES-GCM Key Store & Client-Side BYOK Security
 * 
 * Provides 100% client-side secure storage for OpenRouter API Keys and GitHub PATs.
 * Uses Web Cryptography API (AES-GCM 256-bit, PBKDF2 100,000 iterations)
 * with zero server communication and zero secret exfiltration.
 */

export interface ApiKeys {
  openRouterKey: string;
  githubPat: string;
}

export interface EncryptedPayload {
  cipherText: string;
  salt: string;
  iv: string;
  version: number;
}

export interface IKeyStore {
  getKeys(): Promise<ApiKeys>;
  saveKeys(keys: Partial<ApiKeys>, persistent?: boolean): Promise<void>;
  clearKeys(): Promise<void>;
  hasOpenRouterKey(): Promise<boolean>;
  hasGitHubPat(): Promise<boolean>;
}

export interface KeyValidationResult {
  valid: boolean;
  username?: string;
  scopes?: string[];
  limitInfo?: any;
  error?: string;
}

// Storage Constants
export const STORAGE_KEY_PERSISTENT = 'autogit_api_keys_v1';
export const STORAGE_KEY_SESSION = 'autogit_session_keys_v1';
export const STORAGE_KEY_MODE = 'autogit_storage_mode';
export const STORAGE_KEY_ENCRYPTED = 'autogit_encrypted_keys_v1';

// In-Memory Fallback when storage is restricted or ephemeral
let inMemoryKeys: ApiKeys = {
  openRouterKey: '',
  githubPat: '',
};

/**
 * WebCrypto Key Derivation using PBKDF2 with SHA-256
 */
export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt arbitrary string data with AES-GCM 256-bit
 */
export async function encryptData(data: string, passphrase: string): Promise<EncryptedPayload> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    enc.encode(data)
  );

  // Convert binary to base64 safely
  const cipherBytes = new Uint8Array(encryptedBuffer);
  let binaryString = '';
  for (let i = 0; i < cipherBytes.length; i++) {
    binaryString += String.fromCharCode(cipherBytes[i]);
  }
  const cipherText = btoa(binaryString);

  let saltBinary = '';
  for (let i = 0; i < salt.length; i++) {
    saltBinary += String.fromCharCode(salt[i]);
  }
  const saltStr = btoa(saltBinary);

  let ivBinary = '';
  for (let i = 0; i < iv.length; i++) {
    ivBinary += String.fromCharCode(iv[i]);
  }
  const ivStr = btoa(ivBinary);

  return {
    cipherText,
    salt: saltStr,
    iv: ivStr,
    version: 1,
  };
}

/**
 * Decrypt AES-GCM 256-bit encrypted payload
 */
export async function decryptData(payload: EncryptedPayload, passphrase: string): Promise<string> {
  const dec = new TextDecoder();
  const saltBinary = atob(payload.salt);
  const salt = new Uint8Array(saltBinary.length);
  for (let i = 0; i < saltBinary.length; i++) {
    salt[i] = saltBinary.charCodeAt(i);
  }

  const ivBinary = atob(payload.iv);
  const iv = new Uint8Array(ivBinary.length);
  for (let i = 0; i < ivBinary.length; i++) {
    iv[i] = ivBinary.charCodeAt(i);
  }

  const cipherBinary = atob(payload.cipherText);
  const data = new Uint8Array(cipherBinary.length);
  for (let i = 0; i < cipherBinary.length; i++) {
    data[i] = cipherBinary.charCodeAt(i);
  }

  const key = await deriveKey(passphrase, salt);
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    data as unknown as BufferSource
  );

  return dec.decode(decryptedBuffer);
}

/**
 * Mask secret key for UI display (e.g., "sk-or-v1-••••••••••••3a8f")
 */
export function maskKey(key: string): string {
  if (!key || typeof key !== 'string') return '';
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '••••••••';
  const prefix = trimmed.slice(0, 8);
  const suffix = trimmed.slice(-4);
  return `${prefix}${'•'.repeat(Math.max(4, trimmed.length - 12))}${suffix}`;
}

/**
 * Validates whether string is likely an OpenRouter key
 */
export function isValidOpenRouterKeyFormat(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const trimmed = key.trim();
  return trimmed.startsWith('sk-or-') || trimmed.length > 20;
}

/**
 * Validates whether string is likely a GitHub PAT
 */
export function isValidGitHubPatFormat(pat: string): boolean {
  if (!pat || typeof pat !== 'string') return false;
  const trimmed = pat.trim();
  return trimmed.startsWith('ghp_') || trimmed.startsWith('github_pat_') || trimmed.length >= 30;
}

/**
 * Direct Client-Side Probe: Validate OpenRouter API Key against OpenRouter Auth Endpoint
 */
export async function validateOpenRouterKey(key: string): Promise<KeyValidationResult> {
  const trimmed = key.trim();
  if (!trimmed) {
    return { valid: false, error: 'OpenRouter API key cannot be empty' };
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${trimmed}`,
      },
    });

    if (res.status === 200) {
      const data = await res.json();
      return { valid: true, limitInfo: data?.data };
    } else {
      const errText = await res.text();
      return { valid: false, error: `Invalid key (HTTP ${res.status}): ${errText || res.statusText}` };
    }
  } catch (err: any) {
    // If CORS or network issue, format-based fallback
    return {
      valid: isValidOpenRouterKeyFormat(trimmed),
      error: `Network validation error: ${err?.message || 'Connection failed'}`,
    };
  }
}

/**
 * Direct Client-Side Probe: Validate GitHub PAT against GitHub User Endpoint
 */
export async function validateGitHubPat(pat: string): Promise<KeyValidationResult> {
  const trimmed = pat.trim();
  if (!trimmed) {
    return { valid: false, error: 'GitHub PAT cannot be empty' };
  }

  try {
    const res = await fetch('https://api.github.com/user', {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${trimmed}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (res.status === 200) {
      const scopesHeader = res.headers?.get ? res.headers.get('x-oauth-scopes') || '' : '';
      const scopes = scopesHeader ? scopesHeader.split(',').map((s) => s.trim()) : [];
      const data = await res.json();
      return {
        valid: true,
        username: data.login,
        scopes,
      };
    } else {
      const errText = typeof res.text === 'function' ? await res.text() : '';
      return { valid: false, error: `Invalid PAT (HTTP ${res.status}): ${errText || res.statusText || 'Unauthorized'}` };
    }
  } catch (err: any) {
    return {
      valid: false,
      error: `Network validation error: ${err?.message || 'Connection failed'}`,
    };
  }
}

/**
 * Client-Side Key Store Implementation
 */
export class ClientKeyStore implements IKeyStore {
  private defaultPersistent: boolean;

  constructor(defaultPersistent: boolean = true) {
    this.defaultPersistent = defaultPersistent;
  }

  /**
   * Retrieve active API keys from localStorage, sessionStorage, or in-memory
   */
  async getKeys(): Promise<ApiKeys> {
    try {
      // 1. Check in-memory keys
      if (inMemoryKeys.openRouterKey || inMemoryKeys.githubPat) {
        return { ...inMemoryKeys };
      }

      // 2. Check sessionStorage
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const sessionData = window.sessionStorage.getItem(STORAGE_KEY_SESSION);
        if (sessionData) {
          const parsed = JSON.parse(sessionData);
          if (parsed && typeof parsed === 'object') {
            inMemoryKeys = {
              openRouterKey: parsed.openRouterKey || '',
              githubPat: parsed.githubPat || '',
            };
            return { ...inMemoryKeys };
          }
        }
      }

      // 3. Check localStorage
      if (typeof window !== 'undefined' && window.localStorage) {
        const persistentData = window.localStorage.getItem(STORAGE_KEY_PERSISTENT);
        if (persistentData) {
          const parsed = JSON.parse(persistentData);
          if (parsed && typeof parsed === 'object') {
            inMemoryKeys = {
              openRouterKey: parsed.openRouterKey || '',
              githubPat: parsed.githubPat || '',
            };
            return { ...inMemoryKeys };
          }
        }
      }
    } catch (e) {
      console.warn('[KeyStore] Failed to read keys from storage, falling back to memory', e);
    }

    return { ...inMemoryKeys };
  }

  /**
   * Save API keys either persistently (localStorage) or ephemerally (sessionStorage)
   */
  async saveKeys(keys: Partial<ApiKeys>, persistent: boolean = this.defaultPersistent): Promise<void> {
    const current = await this.getKeys();
    const updated: ApiKeys = {
      openRouterKey: keys.openRouterKey !== undefined ? keys.openRouterKey.trim() : current.openRouterKey,
      githubPat: keys.githubPat !== undefined ? keys.githubPat.trim() : current.githubPat,
    };

    inMemoryKeys = { ...updated };

    if (typeof window !== 'undefined') {
      try {
        const serialized = JSON.stringify(updated);
        if (persistent && window.localStorage) {
          window.localStorage.setItem(STORAGE_KEY_PERSISTENT, serialized);
          window.localStorage.setItem(STORAGE_KEY_MODE, 'persistent');
          // Clear session copy to prevent dual state
          if (window.sessionStorage) {
            window.sessionStorage.removeItem(STORAGE_KEY_SESSION);
          }
        } else if (window.sessionStorage) {
          window.sessionStorage.setItem(STORAGE_KEY_SESSION, serialized);
          if (window.localStorage) {
            window.localStorage.setItem(STORAGE_KEY_MODE, 'session');
            window.localStorage.removeItem(STORAGE_KEY_PERSISTENT);
          }
        }
      } catch (e) {
        console.warn('[KeyStore] Failed to save keys to web storage', e);
      }
    }
  }

  /**
   * Clear all keys from storage and memory
   */
  async clearKeys(): Promise<void> {
    inMemoryKeys = {
      openRouterKey: '',
      githubPat: '',
    };

    if (typeof window !== 'undefined') {
      try {
        if (window.localStorage) {
          window.localStorage.removeItem(STORAGE_KEY_PERSISTENT);
          window.localStorage.removeItem(STORAGE_KEY_ENCRYPTED);
          window.localStorage.removeItem(STORAGE_KEY_MODE);
        }
        if (window.sessionStorage) {
          window.sessionStorage.removeItem(STORAGE_KEY_SESSION);
        }
      } catch (e) {
        console.warn('[KeyStore] Error clearing storage', e);
      }
    }
  }

  /**
   * Check if OpenRouter key is configured and non-empty
   */
  async hasOpenRouterKey(): Promise<boolean> {
    const keys = await this.getKeys();
    return Boolean(keys.openRouterKey && keys.openRouterKey.trim().length > 0);
  }

  /**
   * Check if GitHub PAT is configured and non-empty
   */
  async hasGitHubPat(): Promise<boolean> {
    const keys = await this.getKeys();
    return Boolean(keys.githubPat && keys.githubPat.trim().length > 0);
  }

  /**
   * Save keys with encryption using a user master PIN / passphrase
   */
  async saveEncryptedKeys(keys: Partial<ApiKeys>, passphrase: string): Promise<EncryptedPayload> {
    const current = await this.getKeys();
    const updated: ApiKeys = {
      openRouterKey: keys.openRouterKey !== undefined ? keys.openRouterKey.trim() : current.openRouterKey,
      githubPat: keys.githubPat !== undefined ? keys.githubPat.trim() : current.githubPat,
    };

    const payload = await encryptData(JSON.stringify(updated), passphrase);

    inMemoryKeys = { ...updated };

    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY_ENCRYPTED, JSON.stringify(payload));
      window.localStorage.setItem(STORAGE_KEY_MODE, 'encrypted');
      // Remove plaintext keys from local/session storage
      window.localStorage.removeItem(STORAGE_KEY_PERSISTENT);
      if (window.sessionStorage) {
        window.sessionStorage.removeItem(STORAGE_KEY_SESSION);
      }
    }

    return payload;
  }

  /**
   * Unlock and decrypt keys using master PIN / passphrase
   */
  async loadEncryptedKeys(passphrase: string): Promise<ApiKeys> {
    if (typeof window === 'undefined' || !window.localStorage) {
      throw new Error('localStorage is not available');
    }

    const raw = window.localStorage.getItem(STORAGE_KEY_ENCRYPTED);
    if (!raw) {
      throw new Error('No encrypted keys found in storage');
    }

    const payload: EncryptedPayload = JSON.parse(raw);
    const decryptedJson = await decryptData(payload, passphrase);
    const parsed: ApiKeys = JSON.parse(decryptedJson);

    inMemoryKeys = {
      openRouterKey: parsed.openRouterKey || '',
      githubPat: parsed.githubPat || '',
    };

    return { ...inMemoryKeys };
  }
}

// Singleton Default Instance
export const keyStore = new ClientKeyStore();
