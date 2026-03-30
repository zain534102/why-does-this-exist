/**
 * Secure credential storage using system keychain
 * - macOS: Keychain
 * - Windows: Credential Manager
 * - Linux: libsecret (GNOME Keyring, KWallet, etc.)
 */

const SERVICE_NAME = 'wde-cli';

// Keytar types
interface Keytar {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

let keytar: Keytar | null = null;
let keytarAvailable: boolean | null = null;

/**
 * Check if keytar (system keychain) is available
 */
async function isKeytarAvailable(): Promise<boolean> {
  if (keytarAvailable !== null) {
    return keytarAvailable;
  }

  try {
    // Dynamic import to handle environments where keytar isn't available
    const kt = await import('keytar');
    keytar = kt.default || kt;
    // Test if it works
    await keytar.getPassword(SERVICE_NAME, 'test');
    keytarAvailable = true;
  } catch {
    keytarAvailable = false;
  }

  return keytarAvailable;
}

/**
 * Credential keys
 */
export type CredentialKey =
  | 'anthropic-api-key'
  | 'openai-api-key'
  | 'github-token';

/**
 * Store a credential securely in the system keychain
 */
export async function storeCredential(key: CredentialKey, value: string): Promise<boolean> {
  if (await isKeytarAvailable()) {
    try {
      await keytar!.setPassword(SERVICE_NAME, key, value);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Retrieve a credential from the system keychain
 */
export async function getCredential(key: CredentialKey): Promise<string | null> {
  if (await isKeytarAvailable()) {
    try {
      return await keytar!.getPassword(SERVICE_NAME, key);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Delete a credential from the system keychain
 */
export async function deleteCredential(key: CredentialKey): Promise<boolean> {
  if (await isKeytarAvailable()) {
    try {
      return await keytar!.deletePassword(SERVICE_NAME, key);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Check if secure storage (system keychain) is available
 */
export async function isSecureStorageAvailable(): Promise<boolean> {
  return isKeytarAvailable();
}

/**
 * Get all stored credential keys (for status display)
 */
export async function getStoredCredentials(): Promise<{
  anthropic: boolean;
  openai: boolean;
  github: boolean;
}> {
  const [anthropic, openai, github] = await Promise.all([
    getCredential('anthropic-api-key'),
    getCredential('openai-api-key'),
    getCredential('github-token'),
  ]);

  return {
    anthropic: !!anthropic,
    openai: !!openai,
    github: !!github,
  };
}

/**
 * Clear all wde credentials from the system keychain
 * NOTE: This only clears credentials stored by wde (under SERVICE_NAME),
 * not any other application's credentials
 */
export async function clearWdeCredentials(): Promise<void> {
  await Promise.all([
    deleteCredential('anthropic-api-key'),
    deleteCredential('openai-api-key'),
    deleteCredential('github-token'),
  ]);
}
