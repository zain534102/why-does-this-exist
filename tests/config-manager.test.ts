import { describe, expect, it, afterEach, mock, spyOn } from 'bun:test';

// Helper to create a fake Bun.file return value
function fakeBunFile(exists: boolean, jsonData: unknown = {}) {
  return {
    exists: async () => exists,
    json: async () => jsonData,
  };
}

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
    it('should default to anthropic provider when no config file is present', async () => {
      const fileSpy = spyOn(Bun, 'file').mockReturnValue(
        fakeBunFile(false) as ReturnType<typeof Bun.file>
      );
      delete require.cache[require.resolve('../src/config-manager')];
      const { loadUserConfig } = await import('../src/config-manager');
      const config = await loadUserConfig();
      fileSpy.mockRestore();
      expect(config.ai.provider).toBe('anthropic');
    });

    it('should include a preferences object by default', async () => {
      const fileSpy = spyOn(Bun, 'file').mockReturnValue(
        fakeBunFile(false) as ReturnType<typeof Bun.file>
      );
      delete require.cache[require.resolve('../src/config-manager')];
      const { loadUserConfig } = await import('../src/config-manager');
      const config = await loadUserConfig();
      fileSpy.mockRestore();
      expect(config.preferences).toBeDefined();
      expect(typeof config.preferences).toBe('object');
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

    it('should include the .config directory segment', async () => {
      const { getConfigPath } = await import('../src/config-manager');
      const path = getConfigPath();
      expect(path).toContain('.config');
    });

    it('should be an absolute path', async () => {
      const { getConfigPath } = await import('../src/config-manager');
      const path = getConfigPath();
      expect(path.startsWith('/')).toBe(true);
    });
  });

  describe('isConfigured', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('should return true if ANTHROPIC_API_KEY is set', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test123';
      // Ensure the config file appears absent so provider defaults to anthropic
      const fileSpy = spyOn(Bun, 'file').mockReturnValue(
        fakeBunFile(false) as ReturnType<typeof Bun.file>
      );
      delete require.cache[require.resolve('../src/config-manager')];
      const { isConfigured } = await import('../src/config-manager');
      const result = await isConfigured();
      fileSpy.mockRestore();
      expect(result).toBe(true);
    });

    it('should return function for isConfigured', async () => {
      const { isConfigured } = await import('../src/config-manager');
      expect(typeof isConfigured).toBe('function');
    });

    it('should return true for openai when OPENAI_API_KEY is set and provider is openai', async () => {
      process.env.OPENAI_API_KEY = 'sk-openai-test';
      const fileSpy = spyOn(Bun, 'file').mockReturnValue(
        fakeBunFile(true, {
          ai: { provider: 'openai' },
          preferences: {},
        }) as ReturnType<typeof Bun.file>
      );
      delete require.cache[require.resolve('../src/config-manager')];
      const { isConfigured } = await import('../src/config-manager');
      const result = await isConfigured();
      fileSpy.mockRestore();
      expect(result).toBe(true);
    });

    it('should return true for ollama regardless of missing API keys', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      const fileSpy = spyOn(Bun, 'file').mockReturnValue(
        fakeBunFile(true, {
          ai: { provider: 'ollama' },
          preferences: {},
        }) as ReturnType<typeof Bun.file>
      );
      delete require.cache[require.resolve('../src/config-manager')];
      const { isConfigured } = await import('../src/config-manager');
      const result = await isConfigured();
      fileSpy.mockRestore();
      expect(result).toBe(true);
    });

    it('should return false when no env var and keychain returns null', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      await mock.module('../src/secure-storage', () => ({
        storeCredential: async () => false,
        getCredential: async () => null,
        deleteCredential: async () => false,
        isSecureStorageAvailable: async () => false,
        getStoredCredentials: async () => ({
          anthropic: false,
          openai: false,
          github: false,
        }),
        clearWdeCredentials: async () => {},
      }));

      const fileSpy = spyOn(Bun, 'file').mockReturnValue(
        fakeBunFile(false) as ReturnType<typeof Bun.file>
      );
      delete require.cache[require.resolve('../src/config-manager')];
      const { isConfigured } = await import('../src/config-manager');
      const result = await isConfigured();
      fileSpy.mockRestore();
      expect(result).toBe(false);
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

    it('should detect env var for openai', async () => {
      process.env.OPENAI_API_KEY = 'sk-openai-test';
      delete require.cache[require.resolve('../src/config-manager')];
      const { getCredentialStatus } = await import('../src/config-manager');
      const status = await getCredentialStatus();
      expect(status.openai).toBe(true);
    });

    it('should return boolean values for all status fields', async () => {
      const { getCredentialStatus } = await import('../src/config-manager');
      const status = await getCredentialStatus();
      expect(typeof status.anthropic).toBe('boolean');
      expect(typeof status.openai).toBe('boolean');
      expect(typeof status.github).toBe('boolean');
      expect(typeof status.secureStorage).toBe('boolean');
    });

    it('should report false for all providers when env vars unset and keychain unavailable', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.GITHUB_TOKEN;

      await mock.module('../src/secure-storage', () => ({
        storeCredential: async () => false,
        getCredential: async () => null,
        deleteCredential: async () => false,
        isSecureStorageAvailable: async () => false,
        getStoredCredentials: async () => ({
          anthropic: false,
          openai: false,
          github: false,
        }),
        clearWdeCredentials: async () => {},
      }));

      delete require.cache[require.resolve('../src/config-manager')];
      const { getCredentialStatus } = await import('../src/config-manager');
      const status = await getCredentialStatus();
      expect(status.anthropic).toBe(false);
      expect(status.openai).toBe(false);
      expect(status.github).toBe(false);
    });

    it('should report secureStorage as false when keychain unavailable', async () => {
      await mock.module('../src/secure-storage', () => ({
        storeCredential: async () => false,
        getCredential: async () => null,
        deleteCredential: async () => false,
        isSecureStorageAvailable: async () => false,
        getStoredCredentials: async () => ({
          anthropic: false,
          openai: false,
          github: false,
        }),
        clearWdeCredentials: async () => {},
      }));

      delete require.cache[require.resolve('../src/config-manager')];
      const { getCredentialStatus } = await import('../src/config-manager');
      const status = await getCredentialStatus();
      expect(status.secureStorage).toBe(false);
    });

    it('should report anthropic true when keychain holds the key', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      await mock.module('../src/secure-storage', () => ({
        storeCredential: async () => true,
        getCredential: async () => 'sk-ant-from-keychain',
        deleteCredential: async () => true,
        isSecureStorageAvailable: async () => true,
        getStoredCredentials: async () => ({
          anthropic: true,
          openai: false,
          github: false,
        }),
        clearWdeCredentials: async () => {},
      }));

      delete require.cache[require.resolve('../src/config-manager')];
      const { getCredentialStatus } = await import('../src/config-manager');
      const status = await getCredentialStatus();
      expect(status.anthropic).toBe(true);
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

    it('should return null when no env var and keychain unavailable for anthropic', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      await mock.module('../src/secure-storage', () => ({
        storeCredential: async () => false,
        getCredential: async () => null,
        deleteCredential: async () => false,
        isSecureStorageAvailable: async () => false,
        getStoredCredentials: async () => ({
          anthropic: false,
          openai: false,
          github: false,
        }),
        clearWdeCredentials: async () => {},
      }));

      delete require.cache[require.resolve('../src/config-manager')];
      const { getApiKey } = await import('../src/config-manager');
      const key = await getApiKey('anthropic');
      expect(key).toBeNull();
    });

    it('should return null when no env var and keychain unavailable for openai', async () => {
      delete process.env.OPENAI_API_KEY;

      await mock.module('../src/secure-storage', () => ({
        storeCredential: async () => false,
        getCredential: async () => null,
        deleteCredential: async () => false,
        isSecureStorageAvailable: async () => false,
        getStoredCredentials: async () => ({
          anthropic: false,
          openai: false,
          github: false,
        }),
        clearWdeCredentials: async () => {},
      }));

      delete require.cache[require.resolve('../src/config-manager')];
      const { getApiKey } = await import('../src/config-manager');
      const key = await getApiKey('openai');
      expect(key).toBeNull();
    });

    it('should return keychain value when anthropic env var is absent', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      await mock.module('../src/secure-storage', () => ({
        storeCredential: async () => true,
        getCredential: async (key: string) => {
          if (key === 'anthropic-api-key') return 'sk-ant-from-keychain';
          return null;
        },
        deleteCredential: async () => true,
        isSecureStorageAvailable: async () => true,
        getStoredCredentials: async () => ({
          anthropic: true,
          openai: false,
          github: false,
        }),
        clearWdeCredentials: async () => {},
      }));

      delete require.cache[require.resolve('../src/config-manager')];
      const { getApiKey } = await import('../src/config-manager');
      const key = await getApiKey('anthropic');
      expect(key).toBe('sk-ant-from-keychain');
    });

    it('should prefer env var over keychain value for anthropic', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-env-wins';

      await mock.module('../src/secure-storage', () => ({
        storeCredential: async () => true,
        getCredential: async () => 'sk-ant-from-keychain',
        deleteCredential: async () => true,
        isSecureStorageAvailable: async () => true,
        getStoredCredentials: async () => ({
          anthropic: true,
          openai: false,
          github: false,
        }),
        clearWdeCredentials: async () => {},
      }));

      delete require.cache[require.resolve('../src/config-manager')];
      const { getApiKey } = await import('../src/config-manager');
      const key = await getApiKey('anthropic');
      expect(key).toBe('sk-ant-env-wins');
    });
  });

  describe('storeApiKey', () => {
    it('should delegate to storeCredential with anthropic-api-key', async () => {
      let capturedKey: string | null = null;
      let capturedValue: string | null = null;

      await mock.module('../src/secure-storage', () => ({
        storeCredential: async (key: string, value: string) => {
          capturedKey = key;
          capturedValue = value;
          return true;
        },
        getCredential: async () => null,
        deleteCredential: async () => false,
        isSecureStorageAvailable: async () => true,
        getStoredCredentials: async () => ({
          anthropic: false,
          openai: false,
          github: false,
        }),
        clearWdeCredentials: async () => {},
      }));

      delete require.cache[require.resolve('../src/config-manager')];
      const { storeApiKey } = await import('../src/config-manager');
      await storeApiKey('anthropic', 'sk-ant-test-key');

      expect(capturedKey).toBe('anthropic-api-key');
      expect(capturedValue).toBe('sk-ant-test-key');
    });

    it('should delegate to storeCredential with openai-api-key', async () => {
      let capturedKey: string | null = null;
      let capturedValue: string | null = null;

      await mock.module('../src/secure-storage', () => ({
        storeCredential: async (key: string, value: string) => {
          capturedKey = key;
          capturedValue = value;
          return true;
        },
        getCredential: async () => null,
        deleteCredential: async () => false,
        isSecureStorageAvailable: async () => true,
        getStoredCredentials: async () => ({
          anthropic: false,
          openai: false,
          github: false,
        }),
        clearWdeCredentials: async () => {},
      }));

      delete require.cache[require.resolve('../src/config-manager')];
      const { storeApiKey } = await import('../src/config-manager');
      await storeApiKey('openai', 'sk-openai-test-key');

      expect(capturedKey).toBe('openai-api-key');
      expect(capturedValue).toBe('sk-openai-test-key');
    });

    it('should return false when secure storage is unavailable', async () => {
      await mock.module('../src/secure-storage', () => ({
        storeCredential: async () => false,
        getCredential: async () => null,
        deleteCredential: async () => false,
        isSecureStorageAvailable: async () => false,
        getStoredCredentials: async () => ({
          anthropic: false,
          openai: false,
          github: false,
        }),
        clearWdeCredentials: async () => {},
      }));

      delete require.cache[require.resolve('../src/config-manager')];
      const { storeApiKey } = await import('../src/config-manager');
      const result = await storeApiKey('anthropic', 'sk-ant-test');
      expect(result).toBe(false);
    });

    it('should return true when secure storage succeeds', async () => {
      await mock.module('../src/secure-storage', () => ({
        storeCredential: async () => true,
        getCredential: async () => null,
        deleteCredential: async () => false,
        isSecureStorageAvailable: async () => true,
        getStoredCredentials: async () => ({
          anthropic: false,
          openai: false,
          github: false,
        }),
        clearWdeCredentials: async () => {},
      }));

      delete require.cache[require.resolve('../src/config-manager')];
      const { storeApiKey } = await import('../src/config-manager');
      const result = await storeApiKey('openai', 'sk-test');
      expect(result).toBe(true);
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

    it('should return keychain value when env var is absent', async () => {
      delete process.env.GITHUB_TOKEN;

      await mock.module('../src/secure-storage', () => ({
        storeCredential: async () => true,
        getCredential: async (key: string) => {
          if (key === 'github-token') return 'ghp_from_keychain';
          return null;
        },
        deleteCredential: async () => true,
        isSecureStorageAvailable: async () => true,
        getStoredCredentials: async () => ({
          anthropic: false,
          openai: false,
          github: true,
        }),
        clearWdeCredentials: async () => {},
      }));

      delete require.cache[require.resolve('../src/config-manager')];
      const { getGitHubToken } = await import('../src/config-manager');
      const token = await getGitHubToken();
      expect(token).toBe('ghp_from_keychain');
    });

    it('should return null when env var is absent and keychain unavailable', async () => {
      delete process.env.GITHUB_TOKEN;

      await mock.module('../src/secure-storage', () => ({
        storeCredential: async () => false,
        getCredential: async () => null,
        deleteCredential: async () => false,
        isSecureStorageAvailable: async () => false,
        getStoredCredentials: async () => ({
          anthropic: false,
          openai: false,
          github: false,
        }),
        clearWdeCredentials: async () => {},
      }));

      delete require.cache[require.resolve('../src/config-manager')];
      const { getGitHubToken } = await import('../src/config-manager');
      const token = await getGitHubToken();
      expect(token).toBeNull();
    });

    it('should prefer env var over keychain value', async () => {
      process.env.GITHUB_TOKEN = 'ghp_env_wins';

      await mock.module('../src/secure-storage', () => ({
        storeCredential: async () => true,
        getCredential: async () => 'ghp_from_keychain',
        deleteCredential: async () => true,
        isSecureStorageAvailable: async () => true,
        getStoredCredentials: async () => ({
          anthropic: false,
          openai: false,
          github: true,
        }),
        clearWdeCredentials: async () => {},
      }));

      delete require.cache[require.resolve('../src/config-manager')];
      const { getGitHubToken } = await import('../src/config-manager');
      const token = await getGitHubToken();
      expect(token).toBe('ghp_env_wins');
    });
  });

  describe('storeGitHubToken', () => {
    it('should delegate to storeCredential with github-token key', async () => {
      let capturedKey: string | null = null;
      let capturedValue: string | null = null;

      await mock.module('../src/secure-storage', () => ({
        storeCredential: async (key: string, value: string) => {
          capturedKey = key;
          capturedValue = value;
          return true;
        },
        getCredential: async () => null,
        deleteCredential: async () => false,
        isSecureStorageAvailable: async () => true,
        getStoredCredentials: async () => ({
          anthropic: false,
          openai: false,
          github: false,
        }),
        clearWdeCredentials: async () => {},
      }));

      delete require.cache[require.resolve('../src/config-manager')];
      const { storeGitHubToken } = await import('../src/config-manager');
      await storeGitHubToken('ghp_test_token');

      expect(capturedKey).toBe('github-token');
      expect(capturedValue).toBe('ghp_test_token');
    });

    it('should return true when storage succeeds', async () => {
      await mock.module('../src/secure-storage', () => ({
        storeCredential: async () => true,
        getCredential: async () => null,
        deleteCredential: async () => false,
        isSecureStorageAvailable: async () => true,
        getStoredCredentials: async () => ({
          anthropic: false,
          openai: false,
          github: false,
        }),
        clearWdeCredentials: async () => {},
      }));

      delete require.cache[require.resolve('../src/config-manager')];
      const { storeGitHubToken } = await import('../src/config-manager');
      const result = await storeGitHubToken('ghp_test');
      expect(result).toBe(true);
    });

    it('should return false when storage fails', async () => {
      await mock.module('../src/secure-storage', () => ({
        storeCredential: async () => false,
        getCredential: async () => null,
        deleteCredential: async () => false,
        isSecureStorageAvailable: async () => false,
        getStoredCredentials: async () => ({
          anthropic: false,
          openai: false,
          github: false,
        }),
        clearWdeCredentials: async () => {},
      }));

      delete require.cache[require.resolve('../src/config-manager')];
      const { storeGitHubToken } = await import('../src/config-manager');
      const result = await storeGitHubToken('ghp_test');
      expect(result).toBe(false);
    });
  });

  describe('loadUserConfig', () => {
    it('should return default config when file does not exist', async () => {
      const fileSpy = spyOn(Bun, 'file').mockReturnValue(
        fakeBunFile(false) as ReturnType<typeof Bun.file>
      );
      delete require.cache[require.resolve('../src/config-manager')];
      const { loadUserConfig } = await import('../src/config-manager');
      const config = await loadUserConfig();
      fileSpy.mockRestore();
      expect(config.ai.provider).toBe('anthropic');
      expect(config.preferences).toBeDefined();
    });

    it('should merge file values over defaults when file exists', async () => {
      const fileSpy = spyOn(Bun, 'file').mockReturnValue(
        fakeBunFile(true, {
          ai: { provider: 'openai', model: 'gpt-4o' },
          preferences: { verbose: true },
        }) as ReturnType<typeof Bun.file>
      );
      delete require.cache[require.resolve('../src/config-manager')];
      const { loadUserConfig } = await import('../src/config-manager');
      const config = await loadUserConfig();
      fileSpy.mockRestore();
      expect(config.ai.provider).toBe('openai');
      expect(config.ai.model).toBe('gpt-4o');
      expect(config.preferences.verbose).toBe(true);
    });

    it('should return default config when file.exists() throws', async () => {
      const fileSpy = spyOn(Bun, 'file').mockReturnValue({
        exists: async () => {
          throw new Error('disk error');
        },
        json: async () => ({}),
      } as ReturnType<typeof Bun.file>);
      delete require.cache[require.resolve('../src/config-manager')];
      const { loadUserConfig } = await import('../src/config-manager');
      const config = await loadUserConfig();
      fileSpy.mockRestore();
      expect(config.ai.provider).toBe('anthropic');
    });

    it('should always return an object with ai and preferences keys', async () => {
      const fileSpy = spyOn(Bun, 'file').mockReturnValue(
        fakeBunFile(false) as ReturnType<typeof Bun.file>
      );
      delete require.cache[require.resolve('../src/config-manager')];
      const { loadUserConfig } = await import('../src/config-manager');
      const config = await loadUserConfig();
      fileSpy.mockRestore();
      expect(Object.keys(config)).toContain('ai');
      expect(Object.keys(config)).toContain('preferences');
    });
  });

  describe('saveUserConfig', () => {
    it('should call Bun.write with a path containing config.json', async () => {
      let writtenPath: string | null = null;
      let writtenContent: string | null = null;

      const writeSpy = spyOn(Bun, 'write').mockImplementation(
        async (path: Parameters<typeof Bun.write>[0], content: Parameters<typeof Bun.write>[1]) => {
          writtenPath = String(path);
          writtenContent = String(content);
          return 0;
        }
      );

      delete require.cache[require.resolve('../src/config-manager')];
      const { saveUserConfig } = await import('../src/config-manager');
      await saveUserConfig({
        ai: { provider: 'anthropic' as const },
        preferences: { verbose: false },
      });
      writeSpy.mockRestore();

      expect(writtenPath).not.toBeNull();
      expect(writtenPath).toContain('config.json');
      const parsed = JSON.parse(writtenContent!);
      expect(parsed.ai.provider).toBe('anthropic');
      expect(parsed.preferences.verbose).toBe(false);
    });

    it('should serialize config with newlines (pretty-printed)', async () => {
      let writtenContent: string | null = null;

      const writeSpy = spyOn(Bun, 'write').mockImplementation(async (_path, content) => {
        writtenContent = String(content);
        return 0;
      });

      delete require.cache[require.resolve('../src/config-manager')];
      const { saveUserConfig } = await import('../src/config-manager');
      await saveUserConfig({ ai: { provider: 'ollama' as const }, preferences: {} });
      writeSpy.mockRestore();

      expect(writtenContent).not.toBeNull();
      expect(writtenContent).toContain('\n');
    });

    it('should write valid JSON', async () => {
      let writtenContent: string | null = null;

      const writeSpy = spyOn(Bun, 'write').mockImplementation(async (_path, content) => {
        writtenContent = String(content);
        return 0;
      });

      delete require.cache[require.resolve('../src/config-manager')];
      const { saveUserConfig } = await import('../src/config-manager');
      await saveUserConfig({
        ai: { provider: 'openai' as const, model: 'gpt-4o' },
        preferences: { json: true },
      });
      writeSpy.mockRestore();

      expect(() => JSON.parse(writtenContent!)).not.toThrow();
      const parsed = JSON.parse(writtenContent!);
      expect(parsed.ai.model).toBe('gpt-4o');
    });
  });

  describe('updateUserConfig', () => {
    it('should merge partial ai updates with existing config', async () => {
      const fileSpy = spyOn(Bun, 'file').mockReturnValue(
        fakeBunFile(true, {
          ai: { provider: 'anthropic', model: 'claude-3-opus' },
          preferences: { verbose: false },
        }) as ReturnType<typeof Bun.file>
      );
      const writeSpy = spyOn(Bun, 'write').mockImplementation(async () => 0);

      delete require.cache[require.resolve('../src/config-manager')];
      const { updateUserConfig } = await import('../src/config-manager');
      const updated = await updateUserConfig({ ai: { provider: 'openai' as const } });
      fileSpy.mockRestore();
      writeSpy.mockRestore();

      expect(updated.ai.provider).toBe('openai');
    });

    it('should save updated config to disk via Bun.write', async () => {
      let writeCallCount = 0;
      const fileSpy = spyOn(Bun, 'file').mockReturnValue(
        fakeBunFile(false) as ReturnType<typeof Bun.file>
      );
      const writeSpy = spyOn(Bun, 'write').mockImplementation(async () => {
        writeCallCount++;
        return 0;
      });

      delete require.cache[require.resolve('../src/config-manager')];
      const { updateUserConfig } = await import('../src/config-manager');
      await updateUserConfig({ preferences: { verbose: true } });
      fileSpy.mockRestore();
      writeSpy.mockRestore();

      expect(writeCallCount).toBeGreaterThan(0);
    });

    it('should return the updated config object with correct shape', async () => {
      const fileSpy = spyOn(Bun, 'file').mockReturnValue(
        fakeBunFile(false) as ReturnType<typeof Bun.file>
      );
      const writeSpy = spyOn(Bun, 'write').mockImplementation(async () => 0);

      delete require.cache[require.resolve('../src/config-manager')];
      const { updateUserConfig } = await import('../src/config-manager');
      const result = await updateUserConfig({ preferences: { json: true } });
      fileSpy.mockRestore();
      writeSpy.mockRestore();

      expect(result).toHaveProperty('ai');
      expect(result).toHaveProperty('preferences');
      expect(result.preferences.json).toBe(true);
    });

    it('should deep-merge preferences without clobbering existing keys', async () => {
      const fileSpy = spyOn(Bun, 'file').mockReturnValue(
        fakeBunFile(true, {
          ai: { provider: 'anthropic', model: 'claude-3-5-sonnet' },
          preferences: { verbose: true, json: false },
        }) as ReturnType<typeof Bun.file>
      );
      const writeSpy = spyOn(Bun, 'write').mockImplementation(async () => 0);

      delete require.cache[require.resolve('../src/config-manager')];
      const { updateUserConfig } = await import('../src/config-manager');
      const result = await updateUserConfig({ preferences: { json: true } });
      fileSpy.mockRestore();
      writeSpy.mockRestore();

      expect(result.preferences.json).toBe(true);
      expect(result.preferences.verbose).toBe(true);
      expect(result.ai.provider).toBe('anthropic');
    });
  });

  describe('clearConfig', () => {
    it('should call clearWdeCredentials', async () => {
      let clearCalled = false;

      await mock.module('../src/secure-storage', () => ({
        storeCredential: async () => false,
        getCredential: async () => null,
        deleteCredential: async () => false,
        isSecureStorageAvailable: async () => false,
        getStoredCredentials: async () => ({
          anthropic: false,
          openai: false,
          github: false,
        }),
        clearWdeCredentials: async () => {
          clearCalled = true;
        },
      }));

      const writeSpy = spyOn(Bun, 'write').mockImplementation(async () => 0);
      delete require.cache[require.resolve('../src/config-manager')];
      const { clearConfig } = await import('../src/config-manager');
      await clearConfig();
      writeSpy.mockRestore();

      expect(clearCalled).toBe(true);
    });

    it('should reset config to defaults by writing anthropic as provider', async () => {
      let writtenContent: string | null = null;

      await mock.module('../src/secure-storage', () => ({
        storeCredential: async () => false,
        getCredential: async () => null,
        deleteCredential: async () => false,
        isSecureStorageAvailable: async () => false,
        getStoredCredentials: async () => ({
          anthropic: false,
          openai: false,
          github: false,
        }),
        clearWdeCredentials: async () => {},
      }));

      const writeSpy = spyOn(Bun, 'write').mockImplementation(async (_path, content) => {
        writtenContent = String(content);
        return 0;
      });
      delete require.cache[require.resolve('../src/config-manager')];
      const { clearConfig } = await import('../src/config-manager');
      await clearConfig();
      writeSpy.mockRestore();

      expect(writtenContent).not.toBeNull();
      const parsed = JSON.parse(writtenContent!);
      expect(parsed.ai.provider).toBe('anthropic');
    });
  });
});
