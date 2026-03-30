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

/**
 * User configuration stored in ~/.config/wde/config.json
 * NOTE: Credentials are stored in system keychain, NOT in this file
 */
export interface UserConfig {
  // AI Provider settings (credentials stored in keychain)
  ai: {
    provider: 'anthropic' | 'openai' | 'ollama';
    model?: string;
    ollamaHost?: string;
  };
  // Preferences
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

/**
 * Ensure config directory exists with proper permissions
 */
async function ensureConfigDir(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

/**
 * Load user configuration from disk
 */
export async function loadUserConfig(): Promise<UserConfig> {
  try {
    const file = Bun.file(CONFIG_FILE);
    if (await file.exists()) {
      const content = await file.json();
      return { ...DEFAULT_CONFIG, ...content };
    }
  } catch {
    // Config doesn't exist or is invalid, use defaults
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * Save user configuration to disk
 * NOTE: This does NOT save credentials - they go to keychain
 */
export async function saveUserConfig(config: UserConfig): Promise<void> {
  await ensureConfigDir();
  await Bun.write(CONFIG_FILE, JSON.stringify(config, null, 2));
  // Set restrictive permissions (owner read/write only)
  try {
    await chmod(CONFIG_FILE, 0o600);
  } catch {
    // Ignore permission errors on Windows
  }
}

/**
 * Update specific config values
 */
export async function updateUserConfig(updates: Partial<UserConfig>): Promise<UserConfig> {
  const current = await loadUserConfig();
  const updated: UserConfig = {
    ai: { ...current.ai, ...updates.ai },
    preferences: { ...current.preferences, ...updates.preferences },
  };
  await saveUserConfig(updated);
  return updated;
}

// ============================================
// Credential Management (via system keychain)
// ============================================

/**
 * Store an API key securely in the system keychain
 */
export async function storeApiKey(
  provider: 'anthropic' | 'openai',
  apiKey: string
): Promise<boolean> {
  const key = provider === 'anthropic' ? 'anthropic-api-key' : 'openai-api-key';
  return storeCredential(key, apiKey);
}

/**
 * Get an API key from the system keychain or environment
 */
export async function getApiKey(
  provider: 'anthropic' | 'openai'
): Promise<string | null> {
  // Environment variable takes precedence
  const envVar = provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
  if (process.env[envVar]) {
    return process.env[envVar]!;
  }

  // Then check keychain
  const key = provider === 'anthropic' ? 'anthropic-api-key' : 'openai-api-key';
  return getCredential(key);
}

/**
 * Store GitHub token securely
 */
export async function storeGitHubToken(token: string): Promise<boolean> {
  return storeCredential('github-token', token);
}

/**
 * Get GitHub token from keychain or environment
 */
export async function getGitHubToken(): Promise<string | null> {
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }
  return getCredential('github-token');
}

/**
 * Delete stored API key
 */
export async function deleteApiKey(provider: 'anthropic' | 'openai'): Promise<boolean> {
  const key = provider === 'anthropic' ? 'anthropic-api-key' : 'openai-api-key';
  return deleteCredential(key);
}

/**
 * Delete stored GitHub token
 */
export async function deleteGitHubToken(): Promise<boolean> {
  return deleteCredential('github-token');
}

// ============================================
// Status & Validation
// ============================================

/**
 * Check if the tool is configured (has at least an AI provider key)
 */
export async function isConfigured(): Promise<boolean> {
  const config = await loadUserConfig();

  if (config.ai.provider === 'ollama') {
    return true; // Ollama doesn't need an API key
  }

  // Check for API key in environment or keychain
  const apiKey = await getApiKey(config.ai.provider);
  return !!apiKey;
}

/**
 * Check if secure storage (system keychain) is available
 */
export { isSecureStorageAvailable };

/**
 * Get status of stored credentials
 */
export async function getCredentialStatus(): Promise<{
  anthropic: boolean;
  openai: boolean;
  github: boolean;
  secureStorage: boolean;
}> {
  const secureStorage = await isSecureStorageAvailable();
  const stored = await getStoredCredentials();

  // Also check environment variables
  return {
    anthropic: stored.anthropic || !!process.env.ANTHROPIC_API_KEY,
    openai: stored.openai || !!process.env.OPENAI_API_KEY,
    github: stored.github || !!process.env.GITHUB_TOKEN,
    secureStorage,
  };
}

/**
 * Get the config file path (for display purposes)
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}

/**
 * Clear all wde configuration and credentials
 * NOTE: Only clears wde's own credentials, not other apps
 */
export async function clearConfig(): Promise<void> {
  // Clear wde credentials from keychain (only our service, not others)
  await clearWdeCredentials();

  // Reset config file
  await saveUserConfig(DEFAULT_CONFIG);
}
