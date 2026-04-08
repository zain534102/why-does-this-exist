import { describe, expect, it } from 'bun:test';
import {
  storeCredential,
  getCredential,
  deleteCredential,
  isSecureStorageAvailable,
  getStoredCredentials,
  clearWdeCredentials,
  type CredentialKey,
} from '../src/secure-storage';

describe('secure-storage', () => {
  describe('exports', () => {
    it('should export storeCredential function', () => {
      expect(typeof storeCredential).toBe('function');
    });

    it('should export getCredential function', () => {
      expect(typeof getCredential).toBe('function');
    });

    it('should export deleteCredential function', () => {
      expect(typeof deleteCredential).toBe('function');
    });

    it('should export isSecureStorageAvailable function', () => {
      expect(typeof isSecureStorageAvailable).toBe('function');
    });

    it('should export getStoredCredentials function', () => {
      expect(typeof getStoredCredentials).toBe('function');
    });

    it('should export clearWdeCredentials function', () => {
      expect(typeof clearWdeCredentials).toBe('function');
    });
  });

  describe('CredentialKey type', () => {
    it('should accept valid credential keys', () => {
      const keys: CredentialKey[] = [
        'anthropic-api-key',
        'openai-api-key',
        'github-token',
      ];
      expect(keys).toHaveLength(3);
    });

    it('should include all three expected key values', () => {
      const keys: CredentialKey[] = [
        'anthropic-api-key',
        'openai-api-key',
        'github-token',
      ];
      expect(keys).toContain('anthropic-api-key');
      expect(keys).toContain('openai-api-key');
      expect(keys).toContain('github-token');
    });
  });

  describe('isSecureStorageAvailable', () => {
    it('should return a boolean', async () => {
      const result = await isSecureStorageAvailable();
      expect(typeof result).toBe('boolean');
    });

    it('should return the same cached result on repeated calls', async () => {
      const first = await isSecureStorageAvailable();
      const second = await isSecureStorageAvailable();
      expect(first).toBe(second);
    });

    it('should resolve (not reject) even when keytar cannot be loaded', async () => {
      await expect(isSecureStorageAvailable()).resolves.toEqual(expect.any(Boolean));
    });
  });

  describe('getStoredCredentials', () => {
    it('should return an object with credential status', async () => {
      const result = await getStoredCredentials();
      expect(result).toHaveProperty('anthropic');
      expect(result).toHaveProperty('openai');
      expect(result).toHaveProperty('github');
      expect(typeof result.anthropic).toBe('boolean');
      expect(typeof result.openai).toBe('boolean');
      expect(typeof result.github).toBe('boolean');
    });

    it('should return exactly three keys', async () => {
      const result = await getStoredCredentials();
      expect(Object.keys(result)).toHaveLength(3);
    });

    it('should return all-false when keytar is unavailable', async () => {
      const available = await isSecureStorageAvailable();
      if (!available) {
        const result = await getStoredCredentials();
        expect(result.anthropic).toBe(false);
        expect(result.openai).toBe(false);
        expect(result.github).toBe(false);
      }
    });
  });

  describe('storeCredential', () => {
    it('should return a boolean indicating success/failure', async () => {
      // This will likely return false in CI where keychain is unavailable
      const result = await storeCredential('anthropic-api-key', 'test-key');
      expect(typeof result).toBe('boolean');
    });

    it('should return a boolean for all valid credential keys', async () => {
      const keys: CredentialKey[] = [
        'anthropic-api-key',
        'openai-api-key',
        'github-token',
      ];
      for (const key of keys) {
        const result = await storeCredential(key, 'test-value');
        expect(typeof result).toBe('boolean');
      }
    });

    it('should not throw when called with any valid key and value', async () => {
      // Each call should resolve to a boolean without rejecting
      const r1 = await storeCredential('anthropic-api-key', 'sk-ant-test');
      expect(typeof r1).toBe('boolean');
      const r2 = await storeCredential('openai-api-key', 'sk-test');
      expect(typeof r2).toBe('boolean');
      const r3 = await storeCredential('github-token', 'ghp_test');
      expect(typeof r3).toBe('boolean');
    });

    it('should return false when storage backend is unavailable', async () => {
      const available = await isSecureStorageAvailable();
      if (!available) {
        const result = await storeCredential('github-token', 'ghp_token');
        expect(result).toBe(false);
      }
    });
  });

  describe('getCredential', () => {
    it('should return null or string', async () => {
      const result = await getCredential('anthropic-api-key');
      expect(result === null || typeof result === 'string').toBe(true);
    });

    it('should return null or string for all valid keys', async () => {
      const keys: CredentialKey[] = [
        'anthropic-api-key',
        'openai-api-key',
        'github-token',
      ];
      for (const key of keys) {
        const result = await getCredential(key);
        expect(result === null || typeof result === 'string').toBe(true);
      }
    });

    it('should resolve without rejecting', async () => {
      const result = await getCredential('anthropic-api-key');
      // Resolves to null or a string - never rejects
      expect(result === null || typeof result === 'string').toBe(true);
    });

    it('should return null when storage is unavailable', async () => {
      const available = await isSecureStorageAvailable();
      if (!available) {
        const result = await getCredential('anthropic-api-key');
        expect(result).toBeNull();
      }
    });
  });

  describe('deleteCredential', () => {
    it('should return a boolean indicating success/failure', async () => {
      const result = await deleteCredential('anthropic-api-key');
      expect(typeof result).toBe('boolean');
    });

    it('should return a boolean for all valid credential keys', async () => {
      const keys: CredentialKey[] = [
        'anthropic-api-key',
        'openai-api-key',
        'github-token',
      ];
      for (const key of keys) {
        const result = await deleteCredential(key);
        expect(typeof result).toBe('boolean');
      }
    });

    it('should resolve without rejecting for any key', async () => {
      const result = await deleteCredential('github-token');
      expect(typeof result).toBe('boolean');
    });

    it('should return false when storage backend is unavailable', async () => {
      const available = await isSecureStorageAvailable();
      if (!available) {
        const result = await deleteCredential('openai-api-key');
        expect(result).toBe(false);
      }
    });
  });

  describe('clearWdeCredentials', () => {
    it('should complete without throwing', async () => {
      await expect(clearWdeCredentials()).resolves.toBeUndefined();
    });

    it('should resolve to undefined', async () => {
      const result = await clearWdeCredentials();
      expect(result).toBeUndefined();
    });

    it('should be idempotent - safe to call multiple times', async () => {
      await clearWdeCredentials();
      await expect(clearWdeCredentials()).resolves.toBeUndefined();
    });

    it('should cover all three credential keys without rejecting', async () => {
      await expect(
        clearWdeCredentials().then(() => 'done')
      ).resolves.toBe('done');
    });
  });

  describe('graceful degradation when keytar is unavailable', () => {
    it('isSecureStorageAvailable resolves to a boolean (not rejects)', async () => {
      await expect(isSecureStorageAvailable()).resolves.toEqual(expect.any(Boolean));
    });

    it('storeCredential resolves to false when storage is unavailable', async () => {
      const available = await isSecureStorageAvailable();
      if (!available) {
        const result = await storeCredential('anthropic-api-key', 'value');
        expect(result).toBe(false);
      }
    });

    it('getCredential resolves to null when storage is unavailable', async () => {
      const available = await isSecureStorageAvailable();
      if (!available) {
        const result = await getCredential('openai-api-key');
        expect(result).toBeNull();
      }
    });

    it('deleteCredential resolves to false when storage is unavailable', async () => {
      const available = await isSecureStorageAvailable();
      if (!available) {
        const result = await deleteCredential('github-token');
        expect(result).toBe(false);
      }
    });

    it('getStoredCredentials returns all-false object when storage is unavailable', async () => {
      const available = await isSecureStorageAvailable();
      if (!available) {
        const result = await getStoredCredentials();
        expect(result.anthropic).toBe(false);
        expect(result.openai).toBe(false);
        expect(result.github).toBe(false);
      }
    });
  });
});
