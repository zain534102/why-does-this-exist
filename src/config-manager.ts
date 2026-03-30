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

export async function loadUserConfig(): Promise<UserConfig> {
  try {
    const file = Bun.file(CONFIG_FILE);
    if (await file.exists()) {
      const content = await file.json();
      return { ...DEFAULT_CONFIG, ...content };
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
  const key = provider === 'anthropic' ? 'anthropic-api-key' : 'openai-api-key';
  return storeCredential(key, apiKey);
}

export async function getApiKey(
  provider: 'anthropic' | 'openai'
): Promise<string | null> {
  const envVar = provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
  if (process.env[envVar]) {
    return process.env[envVar]!;
  }
  const key = provider === 'anthropic' ? 'anthropic-api-key' : 'openai-api-key';
  return getCredential(key);
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
  const key = provider === 'anthropic' ? 'anthropic-api-key' : 'openai-api-key';
  return deleteCredential(key);
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
