import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test';
import {
  runAuthFlow,
  showAuthStatus,
  clearAuth,
} from '../src/commands/auth';

describe('commands/auth', () => {
  describe('exports', () => {
    it('should export runAuthFlow function', () => {
      expect(typeof runAuthFlow).toBe('function');
    });

    it('should export showAuthStatus function', () => {
      expect(typeof showAuthStatus).toBe('function');
    });

    it('should export clearAuth function', () => {
      expect(typeof clearAuth).toBe('function');
    });
  });

  describe('runAuthFlow', () => {
    it('should be an async function', () => {
      // Check it returns a promise
      expect(runAuthFlow.constructor.name).toBe('AsyncFunction');
    });
  });

  describe('showAuthStatus', () => {
    it('should be an async function', () => {
      expect(showAuthStatus.constructor.name).toBe('AsyncFunction');
    });
  });

  describe('clearAuth', () => {
    it('should be an async function', () => {
      expect(clearAuth.constructor.name).toBe('AsyncFunction');
    });
  });
});

// ─── showAuthStatus output tests ─────────────────────────────────────────────
// These tests mock config-manager and verify what showAuthStatus prints.

describe('showAuthStatus - output', () => {
  let logOutput: string[] = [];
  const originalLog = console.log;

  beforeEach(() => {
    logOutput = [];
    console.log = (...args: unknown[]) => {
      logOutput.push(args.map(String).join(' '));
    };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('should print Current Configuration heading', async () => {
    await mock.module('../src/config-manager', () => ({
      loadUserConfig: async () => ({ ai: { provider: 'anthropic' }, preferences: {} }),
      getCredentialStatus: async () => ({
        anthropic: true,
        openai: false,
        github: false,
        secureStorage: true,
      }),
      getConfigPath: () => '/home/user/.config/wde/config.json',
      storeApiKey: async () => true,
      storeGitHubToken: async () => true,
      isSecureStorageAvailable: async () => true,
      clearConfig: async () => {},
    }));

    delete require.cache[require.resolve('../src/commands/auth')];
    const { showAuthStatus } = await import('../src/commands/auth');
    await showAuthStatus();

    const output = logOutput.join('\n');
    expect(output).toContain('Current Configuration');
  });

  it('should show anthropic as configured when credential is present', async () => {
    await mock.module('../src/config-manager', () => ({
      loadUserConfig: async () => ({ ai: { provider: 'anthropic' }, preferences: {} }),
      getCredentialStatus: async () => ({
        anthropic: true,
        openai: false,
        github: false,
        secureStorage: true,
      }),
      getConfigPath: () => '/home/user/.config/wde/config.json',
      storeApiKey: async () => true,
      storeGitHubToken: async () => true,
      isSecureStorageAvailable: async () => true,
      clearConfig: async () => {},
    }));

    delete require.cache[require.resolve('../src/commands/auth')];
    const { showAuthStatus } = await import('../src/commands/auth');
    await showAuthStatus();

    const output = logOutput.join('\n');
    expect(output).toContain('Anthropic');
    expect(output).toContain('Configured');
  });

  it('should show anthropic as Not set when credential is absent', async () => {
    await mock.module('../src/config-manager', () => ({
      loadUserConfig: async () => ({ ai: { provider: 'anthropic' }, preferences: {} }),
      getCredentialStatus: async () => ({
        anthropic: false,
        openai: false,
        github: false,
        secureStorage: false,
      }),
      getConfigPath: () => '/home/user/.config/wde/config.json',
      storeApiKey: async () => false,
      storeGitHubToken: async () => false,
      isSecureStorageAvailable: async () => false,
      clearConfig: async () => {},
    }));

    delete require.cache[require.resolve('../src/commands/auth')];
    const { showAuthStatus } = await import('../src/commands/auth');
    await showAuthStatus();

    const output = logOutput.join('\n');
    expect(output).toContain('Not set');
  });

  it('should show openai provider label', async () => {
    await mock.module('../src/config-manager', () => ({
      loadUserConfig: async () => ({ ai: { provider: 'openai' }, preferences: {} }),
      getCredentialStatus: async () => ({
        anthropic: false,
        openai: true,
        github: false,
        secureStorage: true,
      }),
      getConfigPath: () => '/home/user/.config/wde/config.json',
      storeApiKey: async () => true,
      storeGitHubToken: async () => true,
      isSecureStorageAvailable: async () => true,
      clearConfig: async () => {},
    }));

    delete require.cache[require.resolve('../src/commands/auth')];
    const { showAuthStatus } = await import('../src/commands/auth');
    await showAuthStatus();

    const output = logOutput.join('\n');
    expect(output).toContain('OpenAI');
  });

  it('should always show ollama as requiring no key', async () => {
    await mock.module('../src/config-manager', () => ({
      loadUserConfig: async () => ({
        ai: { provider: 'ollama', ollamaHost: 'http://localhost:11434' },
        preferences: {},
      }),
      getCredentialStatus: async () => ({
        anthropic: false,
        openai: false,
        github: false,
        secureStorage: false,
      }),
      getConfigPath: () => '/home/user/.config/wde/config.json',
      storeApiKey: async () => false,
      storeGitHubToken: async () => false,
      isSecureStorageAvailable: async () => false,
      clearConfig: async () => {},
    }));

    delete require.cache[require.resolve('../src/commands/auth')];
    const { showAuthStatus } = await import('../src/commands/auth');
    await showAuthStatus();

    const output = logOutput.join('\n');
    expect(output).toContain('Ollama');
    expect(output).toContain('No API key required');
  });

  it('should show custom ollama host when configured', async () => {
    await mock.module('../src/config-manager', () => ({
      loadUserConfig: async () => ({
        ai: { provider: 'ollama', ollamaHost: 'http://my-server:11434' },
        preferences: {},
      }),
      getCredentialStatus: async () => ({
        anthropic: false,
        openai: false,
        github: false,
        secureStorage: false,
      }),
      getConfigPath: () => '/home/user/.config/wde/config.json',
      storeApiKey: async () => false,
      storeGitHubToken: async () => false,
      isSecureStorageAvailable: async () => false,
      clearConfig: async () => {},
    }));

    delete require.cache[require.resolve('../src/commands/auth')];
    const { showAuthStatus } = await import('../src/commands/auth');
    await showAuthStatus();

    const output = logOutput.join('\n');
    expect(output).toContain('my-server:11434');
  });

  it('should show github token as configured when present', async () => {
    await mock.module('../src/config-manager', () => ({
      loadUserConfig: async () => ({ ai: { provider: 'anthropic' }, preferences: {} }),
      getCredentialStatus: async () => ({
        anthropic: true,
        openai: false,
        github: true,
        secureStorage: true,
      }),
      getConfigPath: () => '/home/user/.config/wde/config.json',
      storeApiKey: async () => true,
      storeGitHubToken: async () => true,
      isSecureStorageAvailable: async () => true,
      clearConfig: async () => {},
    }));

    delete require.cache[require.resolve('../src/commands/auth')];
    const { showAuthStatus } = await import('../src/commands/auth');
    await showAuthStatus();

    const output = logOutput.join('\n');
    expect(output).toContain('GitHub');
    expect(output).toContain('Configured');
  });

  it('should label github token as optional when absent', async () => {
    await mock.module('../src/config-manager', () => ({
      loadUserConfig: async () => ({ ai: { provider: 'anthropic' }, preferences: {} }),
      getCredentialStatus: async () => ({
        anthropic: false,
        openai: false,
        github: false,
        secureStorage: false,
      }),
      getConfigPath: () => '/home/user/.config/wde/config.json',
      storeApiKey: async () => false,
      storeGitHubToken: async () => false,
      isSecureStorageAvailable: async () => false,
      clearConfig: async () => {},
    }));

    delete require.cache[require.resolve('../src/commands/auth')];
    const { showAuthStatus } = await import('../src/commands/auth');
    await showAuthStatus();

    const output = logOutput.join('\n');
    expect(output).toContain('optional');
  });

  it('should show System keychain when secure storage is available', async () => {
    await mock.module('../src/config-manager', () => ({
      loadUserConfig: async () => ({ ai: { provider: 'anthropic' }, preferences: {} }),
      getCredentialStatus: async () => ({
        anthropic: false,
        openai: false,
        github: false,
        secureStorage: true,
      }),
      getConfigPath: () => '/home/user/.config/wde/config.json',
      storeApiKey: async () => true,
      storeGitHubToken: async () => true,
      isSecureStorageAvailable: async () => true,
      clearConfig: async () => {},
    }));

    delete require.cache[require.resolve('../src/commands/auth')];
    const { showAuthStatus } = await import('../src/commands/auth');
    await showAuthStatus();

    const output = logOutput.join('\n');
    expect(output).toContain('System keychain');
  });

  it('should show Not available when secure storage is missing', async () => {
    await mock.module('../src/config-manager', () => ({
      loadUserConfig: async () => ({ ai: { provider: 'anthropic' }, preferences: {} }),
      getCredentialStatus: async () => ({
        anthropic: false,
        openai: false,
        github: false,
        secureStorage: false,
      }),
      getConfigPath: () => '/home/user/.config/wde/config.json',
      storeApiKey: async () => false,
      storeGitHubToken: async () => false,
      isSecureStorageAvailable: async () => false,
      clearConfig: async () => {},
    }));

    delete require.cache[require.resolve('../src/commands/auth')];
    const { showAuthStatus } = await import('../src/commands/auth');
    await showAuthStatus();

    const output = logOutput.join('\n');
    expect(output).toContain('Not available');
  });

  it('should show config file path', async () => {
    await mock.module('../src/config-manager', () => ({
      loadUserConfig: async () => ({ ai: { provider: 'anthropic' }, preferences: {} }),
      getCredentialStatus: async () => ({
        anthropic: false,
        openai: false,
        github: false,
        secureStorage: false,
      }),
      getConfigPath: () => '/home/user/.config/wde/config.json',
      storeApiKey: async () => false,
      storeGitHubToken: async () => false,
      isSecureStorageAvailable: async () => false,
      clearConfig: async () => {},
    }));

    delete require.cache[require.resolve('../src/commands/auth')];
    const { showAuthStatus } = await import('../src/commands/auth');
    await showAuthStatus();

    const output = logOutput.join('\n');
    expect(output).toContain('config.json');
  });

  it('should print a wde auth reconfigure hint', async () => {
    await mock.module('../src/config-manager', () => ({
      loadUserConfig: async () => ({ ai: { provider: 'anthropic' }, preferences: {} }),
      getCredentialStatus: async () => ({
        anthropic: false,
        openai: false,
        github: false,
        secureStorage: false,
      }),
      getConfigPath: () => '/home/user/.config/wde/config.json',
      storeApiKey: async () => false,
      storeGitHubToken: async () => false,
      isSecureStorageAvailable: async () => false,
      clearConfig: async () => {},
    }));

    delete require.cache[require.resolve('../src/commands/auth')];
    const { showAuthStatus } = await import('../src/commands/auth');
    await showAuthStatus();

    const output = logOutput.join('\n');
    expect(output).toContain('wde auth');
  });

  it('should show model name when a specific model is configured', async () => {
    await mock.module('../src/config-manager', () => ({
      loadUserConfig: async () => ({
        ai: { provider: 'anthropic', model: 'claude-3-5-sonnet' },
        preferences: {},
      }),
      getCredentialStatus: async () => ({
        anthropic: true,
        openai: false,
        github: false,
        secureStorage: true,
      }),
      getConfigPath: () => '/home/user/.config/wde/config.json',
      storeApiKey: async () => true,
      storeGitHubToken: async () => true,
      isSecureStorageAvailable: async () => true,
      clearConfig: async () => {},
    }));

    delete require.cache[require.resolve('../src/commands/auth')];
    const { showAuthStatus } = await import('../src/commands/auth');
    await showAuthStatus();

    const output = logOutput.join('\n');
    expect(output).toContain('claude-3-5-sonnet');
  });
});

// ─── clearAuth tests ──────────────────────────────────────────────────────────

describe('clearAuth - behaviour', () => {
  let logOutput: string[] = [];
  const originalLog = console.log;

  beforeEach(() => {
    logOutput = [];
    console.log = (...args: unknown[]) => {
      logOutput.push(args.map(String).join(' '));
    };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('should call clearConfig exactly once', async () => {
    let clearCallCount = 0;

    await mock.module('../src/config-manager', () => ({
      loadUserConfig: async () => ({ ai: { provider: 'anthropic' }, preferences: {} }),
      getCredentialStatus: async () => ({
        anthropic: false,
        openai: false,
        github: false,
        secureStorage: false,
      }),
      getConfigPath: () => '/home/user/.config/wde/config.json',
      storeApiKey: async () => false,
      storeGitHubToken: async () => false,
      isSecureStorageAvailable: async () => false,
      clearConfig: async () => {
        clearCallCount++;
      },
    }));

    delete require.cache[require.resolve('../src/commands/auth')];
    const { clearAuth } = await import('../src/commands/auth');
    await clearAuth();

    expect(clearCallCount).toBe(1);
  });

  it('should print a confirmation message after clearing', async () => {
    await mock.module('../src/config-manager', () => ({
      loadUserConfig: async () => ({ ai: { provider: 'anthropic' }, preferences: {} }),
      getCredentialStatus: async () => ({
        anthropic: false,
        openai: false,
        github: false,
        secureStorage: false,
      }),
      getConfigPath: () => '/home/user/.config/wde/config.json',
      storeApiKey: async () => false,
      storeGitHubToken: async () => false,
      isSecureStorageAvailable: async () => false,
      clearConfig: async () => {},
    }));

    delete require.cache[require.resolve('../src/commands/auth')];
    const { clearAuth } = await import('../src/commands/auth');
    await clearAuth();

    const output = logOutput.join('\n');
    expect(output).toContain('cleared');
  });

  it('should mention that environment variables are not affected', async () => {
    await mock.module('../src/config-manager', () => ({
      loadUserConfig: async () => ({ ai: { provider: 'anthropic' }, preferences: {} }),
      getCredentialStatus: async () => ({
        anthropic: false,
        openai: false,
        github: false,
        secureStorage: false,
      }),
      getConfigPath: () => '/home/user/.config/wde/config.json',
      storeApiKey: async () => false,
      storeGitHubToken: async () => false,
      isSecureStorageAvailable: async () => false,
      clearConfig: async () => {},
    }));

    delete require.cache[require.resolve('../src/commands/auth')];
    const { clearAuth } = await import('../src/commands/auth');
    await clearAuth();

    const output = logOutput.join('\n');
    expect(output).toContain('Environment variables');
  });
});

// ─── non-interactive terminal detection ──────────────────────────────────────

describe('runAuthFlow - non-interactive terminal', () => {
  let errorOutput: string[] = [];
  const originalError = console.error;
  const originalExit = process.exit;
  const originalIsTTY = process.stdout.isTTY;

  beforeEach(() => {
    errorOutput = [];
    console.error = (...args: unknown[]) => {
      errorOutput.push(args.map(String).join(' '));
    };
    (process as NodeJS.Process).exit = (() => {
      throw new Error('process.exit called');
    }) as never;
  });

  afterEach(() => {
    console.error = originalError;
    process.exit = originalExit;
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    });
  });

  it('should call process.exit(1) when terminal is non-interactive', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

    delete require.cache[require.resolve('../src/commands/auth')];
    const { runAuthFlow } = await import('../src/commands/auth');

    let exitCalled = false;
    (process as NodeJS.Process).exit = (() => {
      exitCalled = true;
      throw new Error('process.exit called');
    }) as never;

    try {
      await runAuthFlow();
    } catch {
      // Expected: our mock throws after recording the call
    }

    expect(exitCalled).toBe(true);
  });

  it('should print an error about needing an interactive terminal', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

    delete require.cache[require.resolve('../src/commands/auth')];
    const { runAuthFlow } = await import('../src/commands/auth');

    try {
      await runAuthFlow();
    } catch {
      // swallow exit mock throw
    }

    const output = errorOutput.join('\n');
    expect(output).toContain('interactive terminal');
  });

  it('should suggest setting ANTHROPIC_API_KEY as an env var alternative', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

    delete require.cache[require.resolve('../src/commands/auth')];
    const { runAuthFlow } = await import('../src/commands/auth');

    try {
      await runAuthFlow();
    } catch {
      // swallow exit mock throw
    }

    const output = errorOutput.join('\n');
    expect(output).toContain('ANTHROPIC_API_KEY');
  });

  it('should suggest setting GITHUB_TOKEN as an env var alternative', async () => {
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });

    delete require.cache[require.resolve('../src/commands/auth')];
    const { runAuthFlow } = await import('../src/commands/auth');

    try {
      await runAuthFlow();
    } catch {
      // swallow exit mock throw
    }

    const output = errorOutput.join('\n');
    expect(output).toContain('GITHUB_TOKEN');
  });
});
