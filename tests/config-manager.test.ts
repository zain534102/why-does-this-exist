import { describe, expect, it, beforeEach, afterEach } from 'bun:test';

describe('config-manager', () => {
  describe('UserConfig interface', () => {
    it('should have correct structure', async () => {
      const { loadUserConfig } = await import('../src/config-manager');
      const config = await loadUserConfig();

      expect(config).toHaveProperty('ai');
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
      delete require.cache[require.resolve('../src/config-manager')];
      const { isConfigured } = await import('../src/config-manager');
      const result = await isConfigured();
      expect(result).toBe(true);
    });

    it('should return function for isConfigured', async () => {
      const { isConfigured } = await import('../src/config-manager');
      expect(typeof isConfigured).toBe('function');
    });
  });

  describe('credential functions', () => {
    it('should have storeApiKey function', async () => {
      const { storeApiKey } = await import('../src/config-manager');
      expect(typeof storeApiKey).toBe('function');
    });

    it('should have getApiKey function', async () => {
      const { getApiKey } = await import('../src/config-manager');
      expect(typeof getApiKey).toBe('function');
    });

    it('should have storeGitHubToken function', async () => {
      const { storeGitHubToken } = await import('../src/config-manager');
      expect(typeof storeGitHubToken).toBe('function');
    });

    it('should have getGitHubToken function', async () => {
      const { getGitHubToken } = await import('../src/config-manager');
      expect(typeof getGitHubToken).toBe('function');
    });
  });

  describe('getCredentialStatus', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('should return status object', async () => {
      const { getCredentialStatus } = await import('../src/config-manager');
      const status = await getCredentialStatus();

      expect(status).toHaveProperty('anthropic');
      expect(status).toHaveProperty('openai');
      expect(status).toHaveProperty('github');
      expect(status).toHaveProperty('secureStorage');
    });

    it('should detect env var for anthropic', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      delete require.cache[require.resolve('../src/config-manager')];
      const { getCredentialStatus } = await import('../src/config-manager');
      const status = await getCredentialStatus();
      expect(status.anthropic).toBe(true);
    });

    it('should detect env var for github', async () => {
      process.env.GITHUB_TOKEN = 'ghp_test';
      delete require.cache[require.resolve('../src/config-manager')];
      const { getCredentialStatus } = await import('../src/config-manager');
      const status = await getCredentialStatus();
      expect(status.github).toBe(true);
    });
  });

  describe('getApiKey with env override', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('should return env var for anthropic', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-from-env';
      delete require.cache[require.resolve('../src/config-manager')];
      const { getApiKey } = await import('../src/config-manager');
      const key = await getApiKey('anthropic');
      expect(key).toBe('sk-ant-from-env');
    });

    it('should return env var for openai', async () => {
      process.env.OPENAI_API_KEY = 'sk-from-env';
      delete require.cache[require.resolve('../src/config-manager')];
      const { getApiKey } = await import('../src/config-manager');
      const key = await getApiKey('openai');
      expect(key).toBe('sk-from-env');
    });
  });

  describe('getGitHubToken with env override', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('should return env var', async () => {
      process.env.GITHUB_TOKEN = 'ghp_from_env';
      delete require.cache[require.resolve('../src/config-manager')];
      const { getGitHubToken } = await import('../src/config-manager');
      const token = await getGitHubToken();
      expect(token).toBe('ghp_from_env');
    });
  });
});
