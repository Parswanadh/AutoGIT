import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import {
  ClientKeyStore,
  deriveKey,
  encryptData,
  decryptData,
  maskKey,
  isValidOpenRouterKeyFormat,
  isValidGitHubPatFormat,
  validateOpenRouterKey,
  validateGitHubPat,
  STORAGE_KEY_PERSISTENT,
  STORAGE_KEY_SESSION,
  STORAGE_KEY_ENCRYPTED,
  STORAGE_KEY_MODE,
  EncryptedPayload,
} from '@/lib/storage/keyStore';
import ApiKeyModal from '@/components/studio/ApiKeyModal';
import StudioHeader from '@/components/studio/StudioHeader';

// Mock framer-motion animations
vi.mock('framer-motion', () => {
  const filterProps = (props: any) => {
    const {
      whileHover,
      whileTap,
      layoutId,
      initial,
      animate,
      exit,
      transition,
      ...cleanProps
    } = props;
    return cleanProps;
  };

  return {
    motion: {
      div: ({ children, ...props }: any) => <div {...filterProps(props)}>{children}</div>,
      nav: ({ children, ...props }: any) => <nav {...filterProps(props)}>{children}</nav>,
      a: ({ children, ...props }: any) => <a {...filterProps(props)}>{children}</a>,
      button: ({ children, ...props }: any) => <button {...filterProps(props)}>{children}</button>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
  };
});

describe('Adversarial Stress Test: WebCrypto AES-GCM & KeyStore Edge Cases', () => {
  let store: ClientKeyStore;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    store = new ClientKeyStore(true);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Wrong Passphrase & Master PIN Edge Cases', () => {
    const plaintext = 'sk-or-v1-secret-data-payload-12345';
    const originalPass = 'CorrectMasterPass123!';

    it('rejects decryption when passphrase is 1 character different', async () => {
      const payload = await encryptData(plaintext, originalPass);
      await expect(decryptData(payload, 'CorrectMasterPass123?')).rejects.toThrow();
    });

    it('rejects decryption when passphrase is empty or whitespace', async () => {
      const payload = await encryptData(plaintext, originalPass);
      await expect(decryptData(payload, '')).rejects.toThrow();
      await expect(decryptData(payload, '   ')).rejects.toThrow();
    });

    it('handles unicode, emojis, and multilingual passphrases accurately', async () => {
      const emojiPass = '🔒Master-🔑-パスワード-安全-2026!🚀';
      const payload = await encryptData(plaintext, emojiPass);
      const decrypted = await decryptData(payload, emojiPass);
      expect(decrypted).toBe(plaintext);

      // Wrong emoji fails
      await expect(decryptData(payload, '🔓Master-🔑-パスワード-安全-2026!🚀')).rejects.toThrow();
    });

    it('handles extremely long passphrases (64KB) without buffer overflow', async () => {
      const longPass = 'A'.repeat(65536);
      const payload = await encryptData(plaintext, longPass);
      const decrypted = await decryptData(payload, longPass);
      expect(decrypted).toBe(plaintext);

      await expect(decryptData(payload, longPass + 'B')).rejects.toThrow();
    });
  });

  describe('2. Corrupted Ciphertext & Malformed Payloads', () => {
    const originalPass = 'Pass123!';
    const originalPlain = 'sk-or-v1-super-secret-key';

    it('fails decryption when ciphertext is bit-flipped or tampered (GCM auth tag mismatch)', async () => {
      const payload = await encryptData(originalPlain, originalPass);
      
      // Tamper ciphertext
      const decodedBytes = Uint8Array.from(atob(payload.cipherText), c => c.charCodeAt(0));
      decodedBytes[0] ^= 0xFF; // Flip bits
      let tamperedBinary = '';
      for (let i = 0; i < decodedBytes.length; i++) {
        tamperedBinary += String.fromCharCode(decodedBytes[i]);
      }
      const tamperedPayload: EncryptedPayload = {
        ...payload,
        cipherText: btoa(tamperedBinary),
      };

      await expect(decryptData(tamperedPayload, originalPass)).rejects.toThrow();
    });

    it('fails decryption on truncated ciphertext', async () => {
      const payload = await encryptData(originalPlain, originalPass);
      const truncatedPayload: EncryptedPayload = {
        ...payload,
        cipherText: payload.cipherText.slice(0, 10),
      };
      await expect(decryptData(truncatedPayload, originalPass)).rejects.toThrow();
    });

    it('fails decryption on non-base64 corrupted salt or IV strings', async () => {
      const payload = await encryptData(originalPlain, originalPass);
      const corruptedSalt: EncryptedPayload = {
        ...payload,
        salt: '!!!NOT_BASE_64$$$',
      };
      await expect(decryptData(corruptedSalt, originalPass)).rejects.toThrow();

      const corruptedIV: EncryptedPayload = {
        ...payload,
        iv: '???NOT_VALID_BASE64###',
      };
      await expect(decryptData(corruptedIV, originalPass)).rejects.toThrow();
    });

    it('handles corrupted JSON in localStorage when calling loadEncryptedKeys', async () => {
      localStorage.setItem(STORAGE_KEY_ENCRYPTED, '{"corrupted": "bad json without fields');
      await expect(store.loadEncryptedKeys('pin123')).rejects.toThrow();
    });

    it('handles loadEncryptedKeys when STORAGE_KEY_ENCRYPTED is missing', async () => {
      localStorage.removeItem(STORAGE_KEY_ENCRYPTED);
      await expect(store.loadEncryptedKeys('pin123')).rejects.toThrow(/No encrypted keys found/i);
    });

    it('gracefully recovers when localStorage has corrupted non-JSON plain text', async () => {
      localStorage.setItem(STORAGE_KEY_PERSISTENT, 'CORRUPTED_NON_JSON_STRING{{{');
      const keys = await store.getKeys();
      expect(keys.openRouterKey).toBe('');
      expect(keys.githubPat).toBe('');
    });

    it('gracefully recovers when sessionStorage has non-object JSON (primitive types)', async () => {
      sessionStorage.setItem(STORAGE_KEY_SESSION, '12345');
      const keys = await store.getKeys();
      expect(keys.openRouterKey).toBe('');
      expect(keys.githubPat).toBe('');
    });
  });

  describe('3. Extreme Token Sizes & Special Character Encodings', () => {
    it('encrypts and decrypts large token payloads (128 KB+)', async () => {
      const largeKey = 'sk-or-v1-' + 'X'.repeat(131072);
      const largePat = 'ghp_' + 'Y'.repeat(131072);
      const pass = 'MasterKeyLargePayload';

      const payload = await store.saveEncryptedKeys({
        openRouterKey: largeKey,
        githubPat: largePat,
      }, pass);

      expect(payload.cipherText.length).toBeGreaterThan(100000);

      const freshStore = new ClientKeyStore();
      const retrieved = await freshStore.loadEncryptedKeys(pass);
      expect(retrieved.openRouterKey).toBe(largeKey);
      expect(retrieved.githubPat).toBe(largePat);
    });

    it('handles tokens with special characters, null bytes, newlines, and unicode', async () => {
      const specialOR = 'sk-or-v1-🔥-test\n\r\t-with-special-$#%^&*()-chars-äöü-中文';
      const specialPAT = 'ghp_🚀_token_with_\u0000_null_byte_and_symbols!';
      
      await store.saveKeys({ openRouterKey: specialOR, githubPat: specialPAT }, true);
      const retrieved = await store.getKeys();
      expect(retrieved.openRouterKey).toBe(specialOR);
      expect(retrieved.githubPat).toBe(specialPAT);
    });

    it('handles empty strings and whitespace-only values safely', async () => {
      await store.saveKeys({ openRouterKey: '   ', githubPat: '\t\n ' });
      const retrieved = await store.getKeys();
      expect(retrieved.openRouterKey).toBe('');
      expect(retrieved.githubPat).toBe('');
      expect(await store.hasOpenRouterKey()).toBe(false);
      expect(await store.hasGitHubPat()).toBe(false);
    });
  });

  describe('4. Storage Exceptions, Quota Exhaustion & Fallback Mode', () => {
    it('falls back to in-memory store when localStorage.setItem throws QuotaExceededError', async () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        const err = new DOMException('The quota has been exceeded', 'QuotaExceededError');
        throw err;
      });

      await store.saveKeys({
        openRouterKey: 'sk-or-v1-in-memory-fallback-key',
        githubPat: 'ghp_in_memory_fallback_pat',
      }, true);

      // In-memory keys should still be available
      const retrieved = await store.getKeys();
      expect(retrieved.openRouterKey).toBe('sk-or-v1-in-memory-fallback-key');
      expect(retrieved.githubPat).toBe('ghp_in_memory_fallback_pat');

      spy.mockRestore();
    });

    it('clears previous storage mode keys when switching to encrypted mode', async () => {
      // First save persistent
      await store.saveKeys({ openRouterKey: 'sk-or-v1-old-plain', githubPat: 'ghp_old_plain' }, true);
      expect(localStorage.getItem(STORAGE_KEY_PERSISTENT)).toBeTruthy();

      // Now save encrypted
      await store.saveEncryptedKeys({ openRouterKey: 'sk-or-v1-encrypted', githubPat: 'ghp_encrypted' }, 'PIN777');
      expect(localStorage.getItem(STORAGE_KEY_PERSISTENT)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY_ENCRYPTED)).toBeTruthy();
      expect(localStorage.getItem(STORAGE_KEY_MODE)).toBe('encrypted');
    });

    it('clears previous storage mode keys when switching from persistent to session', async () => {
      await store.saveKeys({ openRouterKey: 'sk-or-v1-persistent' }, true);
      expect(localStorage.getItem(STORAGE_KEY_PERSISTENT)).toBeTruthy();

      await store.saveKeys({ openRouterKey: 'sk-or-v1-session' }, false);
      expect(sessionStorage.getItem(STORAGE_KEY_SESSION)).toBeTruthy();
      expect(localStorage.getItem(STORAGE_KEY_PERSISTENT)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY_MODE)).toBe('session');
    });
  });

  describe('5. Concurrency & Rapid Multi-Access Stress', () => {
    it('handles 50 concurrent asynchronous writes without data corruption', async () => {
      const promises = Array.from({ length: 50 }, (_, i) =>
        store.saveKeys({
          openRouterKey: `sk-or-v1-concurrent-key-${i}`,
          githubPat: `ghp_concurrent_pat_${i}`,
        }, true)
      );

      await Promise.all(promises);
      const keys = await store.getKeys();
      expect(keys.openRouterKey).toMatch(/^sk-or-v1-concurrent-key-\d+$/);
      expect(keys.githubPat).toMatch(/^ghp_concurrent_pat_\d+$/);
    });

    it('handles rapid interleaved reads, writes, and clears', async () => {
      const operations = [
        store.saveKeys({ openRouterKey: 'sk-1' }),
        store.getKeys(),
        store.saveKeys({ githubPat: 'ghp-1' }),
        store.hasOpenRouterKey(),
        store.clearKeys(),
        store.saveKeys({ openRouterKey: 'sk-final', githubPat: 'ghp-final' }),
      ];

      await Promise.all(operations);
      const finalKeys = await store.getKeys();
      expect(finalKeys.openRouterKey).toBe('sk-final');
      expect(finalKeys.githubPat).toBe('ghp-final');
    });
  });

  describe('6. Privacy & Leakage Verification (Console, DOM, Network)', () => {
    const rawOpenRouterKey = 'sk-or-v1-top-secret-super-sensitive-openrouter-key-9999';
    const rawGitHubPat = 'ghp_top_secret_super_sensitive_github_pat_9999';

    it('does NOT leak plaintext keys to console.log / warn / error / info / debug', async () => {
      const logSpy = vi.spyOn(console, 'log');
      const warnSpy = vi.spyOn(console, 'warn');
      const errorSpy = vi.spyOn(console, 'error');
      const infoSpy = vi.spyOn(console, 'info');
      const debugSpy = vi.spyOn(console, 'debug');

      // Execute all store operations
      await store.saveKeys({ openRouterKey: rawOpenRouterKey, githubPat: rawGitHubPat }, true);
      await store.getKeys();
      await store.hasOpenRouterKey();
      await store.hasGitHubPat();
      await store.saveEncryptedKeys({ openRouterKey: rawOpenRouterKey, githubPat: rawGitHubPat }, 'PIN123');
      await store.loadEncryptedKeys('PIN123');
      maskKey(rawOpenRouterKey);
      maskKey(rawGitHubPat);
      await store.clearKeys();

      const allCalls = [
        ...logSpy.mock.calls,
        ...warnSpy.mock.calls,
        ...errorSpy.mock.calls,
        ...infoSpy.mock.calls,
        ...debugSpy.mock.calls,
      ];

      for (const call of allCalls) {
        const text = JSON.stringify(call);
        expect(text).not.toContain(rawOpenRouterKey);
        expect(text).not.toContain(rawGitHubPat);
      }
    });

    it('maskKey properly obscures sensitive keys of any arbitrary length', () => {
      const maskedOR = maskKey(rawOpenRouterKey);
      expect(maskedOR).not.toBe(rawOpenRouterKey);
      expect(maskedOR.startsWith('sk-or-v1')).toBe(true);
      expect(maskedOR.endsWith('9999')).toBe(true);
      expect(maskedOR).toContain('••••');
      expect(maskedOR).not.toContain('top-secret');

      const maskedPAT = maskKey(rawGitHubPat);
      expect(maskedPAT).not.toBe(rawGitHubPat);
      expect(maskedPAT).toContain('••••');
      expect(maskedPAT).not.toContain('top_secret');

      // Edge cases for maskKey
      expect(maskKey(null as any)).toBe('');
      expect(maskKey(undefined as any)).toBe('');
      expect(maskKey('1234')).toBe('••••••••');
    });

    it('validates that validateOpenRouterKey strictly calls openrouter.ai and sends key in Authorization header only', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, options: any) => {
        expect(typeof url === 'string' ? url : url.toString()).toBe('https://openrouter.ai/api/v1/auth/key');
        // Ensure key is NOT present in query parameters
        expect(url.toString()).not.toContain('?');
        expect(options.method).toBe('GET');
        expect(options.headers['Authorization']).toBe(`Bearer ${rawOpenRouterKey}`);
        return {
          status: 200,
          json: async () => ({ data: { label: 'TestKey' } }),
        } as any;
      });

      const res = await validateOpenRouterKey(rawOpenRouterKey);
      expect(res.valid).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('validates that validateGitHubPat strictly calls api.github.com and sends PAT in Authorization header only', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any, options: any) => {
        expect(typeof url === 'string' ? url : url.toString()).toBe('https://api.github.com/user');
        // Ensure PAT is NOT present in query parameters
        expect(url.toString()).not.toContain('?');
        expect(options.method).toBe('GET');
        expect(options.headers['Authorization']).toBe(`Bearer ${rawGitHubPat}`);
        expect(options.headers['Accept']).toBe('application/vnd.github+json');
        return {
          status: 200,
          headers: {
            get: (h: string) => (h === 'x-oauth-scopes' ? 'repo' : null),
          },
          json: async () => ({ login: 'octocat' }),
        } as any;
      });

      const res = await validateGitHubPat(rawGitHubPat);
      expect(res.valid).toBe(true);
      expect(res.username).toBe('octocat');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('verifies ApiKeyModal uses password input types and does not expose keys in DOM element attributes', async () => {
      await store.saveKeys({ openRouterKey: rawOpenRouterKey, githubPat: rawGitHubPat }, true);

      let container: HTMLElement;
      await act(async () => {
        const renderResult = render(<ApiKeyModal isOpen={true} onClose={() => {}} />);
        container = renderResult.container;
      });

      const inputs = container!.querySelectorAll('input');
      expect(inputs.length).toBeGreaterThanOrEqual(2);

      // By default, inputs must have type="password"
      inputs.forEach(input => {
        expect(input.getAttribute('type')).toBe('password');
      });

      // Ensure raw keys are not embedded into any data-* attributes or classes
      const htmlString = container!.innerHTML;
      expect(htmlString).not.toContain(`data-key="${rawOpenRouterKey}"`);
      expect(htmlString).not.toContain(`data-pat="${rawGitHubPat}"`);
    });

    it('verifies StudioHeader only shows connection status badges without leaking key content into DOM', async () => {
      await store.saveKeys({ openRouterKey: rawOpenRouterKey, githubPat: rawGitHubPat }, true);

      let container: HTMLElement;
      await act(async () => {
        const renderResult = render(
          <StudioHeader
            currentMode="studio"
            onModeChange={() => {}}
            onOpenKeyModal={() => {}}
          />
        );
        container = renderResult.container;
      });

      await waitFor(() => {
        expect(screen.getByText('OpenRouter :free')).toBeDefined();
        expect(screen.getByText('GitHub Connected')).toBeDefined();
      });

      const headerHtml = container!.innerHTML;
      expect(headerHtml).not.toContain(rawOpenRouterKey);
      expect(headerHtml).not.toContain(rawGitHubPat);
    });
  });
});
