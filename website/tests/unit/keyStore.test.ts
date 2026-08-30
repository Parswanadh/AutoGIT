import { describe, it, expect, beforeEach, vi } from 'vitest';
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
} from '@/lib/storage/keyStore';

describe('WebCrypto AES-GCM Encryption / Decryption', () => {
  const sampleSecret = 'sk-or-v1-0123456789abcdef0123456789abcdef';
  const passphrase = 'SuperSecureMasterPin123!';

  it('should derive a CryptoKey from passphrase and salt', async () => {
    const salt = new Uint8Array(16);
    const key = await deriveKey(passphrase, salt);
    expect(key).toBeDefined();
    expect(key.algorithm.name).toBe('AES-GCM');
  });

  it('should encrypt plaintext data into AES-GCM ciphertext payload with salt and IV', async () => {
    const payload = await encryptData(sampleSecret, passphrase);
    expect(payload).toBeDefined();
    expect(payload.cipherText).toBeTruthy();
    expect(payload.salt).toBeTruthy();
    expect(payload.iv).toBeTruthy();
    expect(payload.version).toBe(1);
    expect(payload.cipherText).not.toBe(sampleSecret);
  });

  it('should successfully decrypt the ciphertext with the correct passphrase', async () => {
    const payload = await encryptData(sampleSecret, passphrase);
    const decrypted = await decryptData(payload, passphrase);
    expect(decrypted).toBe(sampleSecret);
  });

  it('should fail decryption when given an incorrect passphrase', async () => {
    const payload = await encryptData(sampleSecret, passphrase);
    await expect(decryptData(payload, 'WrongPassword123')).rejects.toThrow();
  });
});

describe('Key Masking and Validation Helpers', () => {
  it('should correctly mask API keys and tokens', () => {
    expect(maskKey('')).toBe('');
    expect(maskKey('short')).toBe('••••••••');
    const masked = maskKey('sk-or-v1-abcdef0123456789xyz99');
    expect(masked.startsWith('sk-or-v1')).toBe(true);
    expect(masked.endsWith('z99')).toBe(true);
    expect(masked.includes('••••')).toBe(true);
  });

  it('should identify valid format for OpenRouter keys', () => {
    expect(isValidOpenRouterKeyFormat('sk-or-v1-12345678901234567890')).toBe(true);
    expect(isValidOpenRouterKeyFormat('short')).toBe(false);
    expect(isValidOpenRouterKeyFormat('')).toBe(false);
  });

  it('should identify valid format for GitHub PATs', () => {
    expect(isValidGitHubPatFormat('ghp_123456789012345678901234567890123456')).toBe(true);
    expect(isValidGitHubPatFormat('github_pat_123456789012345678901234567890')).toBe(true);
    expect(isValidGitHubPatFormat('invalid_pat')).toBe(false);
  });
});

describe('ClientKeyStore Persistence and Retrieval', () => {
  let store: ClientKeyStore;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    store = new ClientKeyStore(true);
  });

  it('should start with empty keys and return false for hasKey checks', async () => {
    await store.clearKeys();
    const keys = await store.getKeys();
    expect(keys.openRouterKey).toBe('');
    expect(keys.githubPat).toBe('');
    expect(await store.hasOpenRouterKey()).toBe(false);
    expect(await store.hasGitHubPat()).toBe(false);
  });

  it('should save and retrieve keys persistently in localStorage', async () => {
    await store.saveKeys({
      openRouterKey: 'sk-or-v1-test-openrouter-key',
      githubPat: 'ghp_testgithubpat123456789012345678',
    }, true);

    expect(await store.hasOpenRouterKey()).toBe(true);
    expect(await store.hasGitHubPat()).toBe(true);

    const keys = await store.getKeys();
    expect(keys.openRouterKey).toBe('sk-or-v1-test-openrouter-key');
    expect(keys.githubPat).toBe('ghp_testgithubpat123456789012345678');

    const storedRaw = localStorage.getItem(STORAGE_KEY_PERSISTENT);
    expect(storedRaw).toBeTruthy();
    expect(JSON.parse(storedRaw!).openRouterKey).toBe('sk-or-v1-test-openrouter-key');
  });

  it('should save keys ephemerally in sessionStorage when persistent=false', async () => {
    await store.saveKeys({
      openRouterKey: 'sk-or-v1-session-only-key',
      githubPat: 'ghp_session_only_pat',
    }, false);

    const sessionRaw = sessionStorage.getItem(STORAGE_KEY_SESSION);
    expect(sessionRaw).toBeTruthy();
    expect(JSON.parse(sessionRaw!).openRouterKey).toBe('sk-or-v1-session-only-key');
    expect(localStorage.getItem(STORAGE_KEY_PERSISTENT)).toBeNull();
  });

  it('should update partial keys without wiping other keys', async () => {
    await store.saveKeys({ openRouterKey: 'sk-or-v1-first-key' });
    await store.saveKeys({ githubPat: 'ghp_second_pat' });

    const keys = await store.getKeys();
    expect(keys.openRouterKey).toBe('sk-or-v1-first-key');
    expect(keys.githubPat).toBe('ghp_second_pat');
  });

  it('should clear all keys from memory, localStorage, and sessionStorage', async () => {
    await store.saveKeys({
      openRouterKey: 'sk-or-v1-key-to-clear',
      githubPat: 'ghp_pat_to_clear',
    });

    await store.clearKeys();
    const keys = await store.getKeys();
    expect(keys.openRouterKey).toBe('');
    expect(keys.githubPat).toBe('');
    expect(localStorage.getItem(STORAGE_KEY_PERSISTENT)).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY_SESSION)).toBeNull();
  });

  it('should support encrypted storage with passphrase PIN', async () => {
    const pin = 'SecretVaultPIN999';
    await store.saveEncryptedKeys({
      openRouterKey: 'sk-or-v1-secret-vault-openrouter',
      githubPat: 'ghp_vault_pat_123456789',
    }, pin);

    expect(localStorage.getItem(STORAGE_KEY_ENCRYPTED)).toBeTruthy();
    expect(localStorage.getItem(STORAGE_KEY_PERSISTENT)).toBeNull();

    // Create fresh instance
    const freshStore = new ClientKeyStore();
    const unlocked = await freshStore.loadEncryptedKeys(pin);
    expect(unlocked.openRouterKey).toBe('sk-or-v1-secret-vault-openrouter');
    expect(unlocked.githubPat).toBe('ghp_vault_pat_123456789');
  });
});

describe('Direct Client Key Health Check Probes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should validate active OpenRouter key successfully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      status: 200,
      json: async () => ({ data: { label: 'MyKey', limit: 100, usage: 0 } }),
    } as any);

    const result = await validateOpenRouterKey('sk-or-v1-valid-openrouter-key');
    expect(result.valid).toBe(true);
    expect(result.limitInfo).toBeDefined();
  });

  it('should return invalid when OpenRouter key is rejected with 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Invalid API key provided',
    } as any);

    const result = await validateOpenRouterKey('sk-or-v1-invalid-key');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('401');
  });

  it('should validate GitHub PAT and extract username and scopes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      status: 200,
      headers: {
        get: (h: string) => (h === 'x-oauth-scopes' ? 'repo, user, workflow' : null),
      },
      json: async () => ({ login: 'octocat' }),
    } as any);

    const result = await validateGitHubPat('ghp_valid_octocat_pat_123456');
    expect(result.valid).toBe(true);
    expect(result.username).toBe('octocat');
    expect(result.scopes).toContain('repo');
  });

  it('should return invalid for failed GitHub PAT', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      status: 401,
      statusText: 'Bad credentials',
      text: async () => 'Bad credentials',
    } as any);

    const result = await validateGitHubPat('ghp_invalid_pat');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('401');
  });
});
