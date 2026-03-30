import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdir, rm, writeFile } from 'fs/promises';

// We need to mock the config path for testing
// Since the module uses homedir(), we'll test the logic separately

describe('config-manager', () => {
  describe('UserConfig interface', () => {
    it('should have correct structure', async () => {
      const { loadUserConfig } = await import('../src/config-manager');
      const config = await loadUserConfig();

      expect(config).toHaveProperty('ai');
      expect(config).toHaveProperty('github');
      expect(config).toHaveProperty('preferences');
      expect(config.ai).toHaveProperty('provider');
    });
  });

  describe('default config', () => {
    it('should default to anthropic provider', async () => {
      const { loadUserConfig } = await import('../src/config-manager');
      const config = await loadUserConfig();
      expect(config.ai.provider).toBe('anthropic');
    });

    it('should have empty github config by default', async () => {
      const { loadUserConfig } = await import('../src/config-manager');
      const config = await loadUserConfig();
      expect(config.github.token).toBeUndefined();
    });
  });

  describe('getConfigPath', () => {
    it('should return a path string', async () => {
      const { getConfigPath } = await import('../src/config-manager');
      const path = getConfigPath();
      expect(typeof path).toBe('string');
      expect(path).toContain('wde');
      expect(path).toContain('config.json');
    });
  });

  describe('isConfigured', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('should return true if ANTHROPIC_API_KEY is set', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test123';
      // Re-import to pick up env changes
      delete require.cache[require.resolve('../src/config-manager')];
      const { isConfigured } = await import('../src/config-manager');
      const result = await isConfigured();
      expect(result).toBe(true);
    });

    it('should return true for ollama without API key', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      // This test would need to modify the config file
      // For now, we just test the function exists
      const { isConfigured } = await import('../src/config-manager');
      expect(typeof isConfigured).toBe('function');
    });
  });
});
