import { homedir } from 'os';
import { join } from 'path';
import { mkdir, chmod } from 'fs/promises';
import {
  storeCredential,
  getCredential,
  deleteCredential,
  isSecureStorageAvailable,
  getStoredCredentials,
  clearWdeCredentials,
} from './secure-storage';

export interface UserConfig {
  ai: {
    provider: 'anthropic' | 'openai' | 'ollama';
    model?: string;
    ollamaHost?: string;
  };
  preferences: {
    verbose?: boolean;
    json?: boolean;
  };
}

const DEFAULT_CONFIG: UserConfig = {
  ai: {
    provider: 'anthropic',
  },
  preferences: {},
};

const CONFIG_DIR = join(homedir(), '.config', 'wde');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

async function ensureConfigDir(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

const VALID_PROVIDERS = ['anthropic', 'openai', 'ollama'];

function isValidConfig(obj: unknown): obj is Partial<UserConfig> {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return false;
  const o = obj as Record<string, unknown>;

  if (o.ai !== undefined) {
    if (typeof o.ai !== 'object' || o.ai === null || Array.isArray(o.ai)) return false;
    const ai = o.ai as Record<string, unknown>;
    if (ai.provider !== undefined && !VALID_PROVIDERS.includes(ai.provider as string)) return false;
    if (ai.model !== undefined && typeof ai.model !== 'string') return false;
    if (ai.ollamaHost !== undefined) {
      if (typeof ai.ollamaHost !== 'string') return false;
      try {
        const parsed = new URL(ai.ollamaHost);
        if (!['http:', 'https:'].includes(parsed.protocol)) return false;
        if (parsed.username || parsed.password) return false;
      } catch {
        return false;
      }
    }
  }

  if (o.preferences !== undefined) {
    if (typeof o.preferences !== 'object' || o.preferences === null || Array.isArray(o.preferences)) return false;
  }

  return true;
}

export async function loadUserConfig(): Promise<UserConfig> {
  try {
    const file = Bun.file(CONFIG_FILE);
    if (await file.exists()) {
      const content = await file.json();
      if (isValidConfig(content)) {
        return {
          ai: { ...DEFAULT_CONFIG.ai, ...(content.ai ?? {}) },
          preferences: { ...DEFAULT_CONFIG.preferences, ...(content.preferences ?? {}) },
        };
      }
    }
  } catch {
    // Config doesn't exist or is invalid
  }
  return { ...DEFAULT_CONFIG };
}

export async function saveUserConfig(config: UserConfig): Promise<void> {
  await ensureConfigDir();
  await Bun.write(CONFIG_FILE, JSON.stringify(config, null, 2));
  try {
    await chmod(CONFIG_FILE, 0o600);
  } catch {
    // Ignore permission errors on Windows
  }
}

export async function updateUserConfig(updates: Partial<UserConfig>): Promise<UserConfig> {
  const current = await loadUserConfig();
  const updated: UserConfig = {
    ai: { ...current.ai, ...updates.ai },
    preferences: { ...current.preferences, ...updates.preferences },
  };
  await saveUserConfig(updated);
  return updated;
}

export async function storeApiKey(
  provider: 'anthropic' | 'openai',
  apiKey: string
): Promise<boolean> {
  return storeCredential(CREDENTIAL_KEY_MAP[provider], apiKey);
}

const ENV_VAR_MAP = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
} as const;

const CREDENTIAL_KEY_MAP = {
  anthropic: 'anthropic-api-key',
  openai: 'openai-api-key',
} as const;

export async function getApiKey(
  provider: 'anthropic' | 'openai'
): Promise<string | null> {
  const envVar = ENV_VAR_MAP[provider];
  if (process.env[envVar]) {
    return process.env[envVar]!;
  }
  return getCredential(CREDENTIAL_KEY_MAP[provider]);
}

export async function storeGitHubToken(token: string): Promise<boolean> {
  return storeCredential('github-token', token);
}

export async function getGitHubToken(): Promise<string | null> {
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }
  return getCredential('github-token');
}

export async function deleteApiKey(provider: 'anthropic' | 'openai'): Promise<boolean> {
  return deleteCredential(CREDENTIAL_KEY_MAP[provider]);
}

export async function deleteGitHubToken(): Promise<boolean> {
  return deleteCredential('github-token');
}

export async function isConfigured(): Promise<boolean> {
  const config = await loadUserConfig();

  if (config.ai.provider === 'ollama') {
    return true;
  }

  const apiKey = await getApiKey(config.ai.provider);
  return !!apiKey;
}

export { isSecureStorageAvailable };

export async function getCredentialStatus(): Promise<{
  anthropic: boolean;
  openai: boolean;
  github: boolean;
  secureStorage: boolean;
}> {
  const secureStorage = await isSecureStorageAvailable();
  const stored = await getStoredCredentials();

  return {
    anthropic: stored.anthropic || !!process.env.ANTHROPIC_API_KEY,
    openai: stored.openai || !!process.env.OPENAI_API_KEY,
    github: stored.github || !!process.env.GITHUB_TOKEN,
    secureStorage,
  };
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export async function clearConfig(): Promise<void> {
  await clearWdeCredentials();
  await saveUserConfig(DEFAULT_CONFIG);
}
