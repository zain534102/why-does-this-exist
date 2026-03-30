import { homedir } from 'os';
import { join } from 'path';
import { mkdir } from 'fs/promises';

/**
 * User configuration stored in ~/.config/wde/config.json
 */
export interface UserConfig {
  // AI Provider settings
  ai: {
    provider: 'anthropic' | 'openai' | 'ollama';
    model?: string;
    apiKey?: string;
    ollamaHost?: string;
  };
  // GitHub settings
  github: {
    token?: string;
  };
  // Preferences
  preferences: {
    defaultModel?: string;
    verbose?: boolean;
    json?: boolean;
  };
}

const DEFAULT_CONFIG: UserConfig = {
  ai: {
    provider: 'anthropic',
  },
  github: {},
  preferences: {},
};

const CONFIG_DIR = join(homedir(), '.config', 'wde');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

/**
 * Ensure config directory exists
 */
async function ensureConfigDir(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
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
 */
export async function saveUserConfig(config: UserConfig): Promise<void> {
  await ensureConfigDir();
  await Bun.write(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Update specific config values
 */
export async function updateUserConfig(updates: Partial<UserConfig>): Promise<UserConfig> {
  const current = await loadUserConfig();
  const updated: UserConfig = {
    ai: { ...current.ai, ...updates.ai },
    github: { ...current.github, ...updates.github },
    preferences: { ...current.preferences, ...updates.preferences },
  };
  await saveUserConfig(updated);
  return updated;
}

/**
 * Get a specific config value with environment variable override
 * Environment variables take precedence over config file
 */
export async function getConfigValue<T>(
  getter: (config: UserConfig) => T | undefined,
  envVar?: string,
  defaultValue?: T
): Promise<T | undefined> {
  // Check environment variable first
  if (envVar && process.env[envVar]) {
    return process.env[envVar] as unknown as T;
  }

  // Then check config file
  const config = await loadUserConfig();
  const value = getter(config);
  if (value !== undefined) {
    return value;
  }

  return defaultValue;
}

/**
 * Check if the tool is configured (has at least an AI provider key)
 */
export async function isConfigured(): Promise<boolean> {
  const config = await loadUserConfig();

  // Check for API key in config or environment
  if (config.ai.provider === 'anthropic') {
    return !!(config.ai.apiKey || process.env.ANTHROPIC_API_KEY);
  }
  if (config.ai.provider === 'openai') {
    return !!(config.ai.apiKey || process.env.OPENAI_API_KEY);
  }
  if (config.ai.provider === 'ollama') {
    return true; // Ollama doesn't need an API key
  }

  return false;
}

/**
 * Get the config file path (for display purposes)
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}

/**
 * Clear all configuration
 */
export async function clearConfig(): Promise<void> {
  try {
    const file = Bun.file(CONFIG_FILE);
    if (await file.exists()) {
      await Bun.write(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
    }
  } catch {
    // Ignore errors
  }
}
