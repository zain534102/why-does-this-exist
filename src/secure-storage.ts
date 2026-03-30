const SERVICE_NAME = 'wde-cli';

interface Keytar {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
}

let keytar: Keytar | null = null;
let keytarAvailable: boolean | null = null;

async function isKeytarAvailable(): Promise<boolean> {
  if (keytarAvailable !== null) {
    return keytarAvailable;
  }

  try {
    const kt = await import('keytar');
    keytar = kt.default || kt;
    await keytar.getPassword(SERVICE_NAME, 'test');
    keytarAvailable = true;
  } catch {
    keytarAvailable = false;
  }

  return keytarAvailable;
}

export type CredentialKey =
  | 'anthropic-api-key'
  | 'openai-api-key'
  | 'github-token';

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

export async function isSecureStorageAvailable(): Promise<boolean> {
  return isKeytarAvailable();
}

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

export async function clearWdeCredentials(): Promise<void> {
  await Promise.all([
    deleteCredential('anthropic-api-key'),
    deleteCredential('openai-api-key'),
    deleteCredential('github-token'),
  ]);
}
