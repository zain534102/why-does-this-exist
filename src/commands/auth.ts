import pc from 'picocolors';
import {
  loadUserConfig,
  saveUserConfig,
  getConfigPath,
  storeApiKey,
  storeGitHubToken,
  getCredentialStatus,
  isSecureStorageAvailable,
  clearConfig,
} from '../config-manager';
import { getSupportedProviders, getProvider, type ProviderType } from '../ai-providers';

const isInteractive = process.stdout.isTTY;

/**
 * Simple readline for interactive prompts
 */
async function prompt(question: string): Promise<string> {
  process.stdout.write(question);
  const reader = Bun.stdin.stream().getReader();
  const { value } = await reader.read();
  reader.releaseLock();
  return new TextDecoder().decode(value).trim();
}

/**
 * Prompt for a selection from a list
 */
async function promptSelect(
  question: string,
  options: Array<{ id: string; name: string; description: string }>
): Promise<string> {
  console.log(question);
  console.log('');
  options.forEach((opt, i) => {
    console.log(`  ${pc.cyan(`${i + 1})`)} ${pc.bold(opt.name)}`);
    console.log(`     ${pc.dim(opt.description)}`);
  });
  console.log('');

  const answer = await prompt(`Enter choice (1-${options.length}): `);
  const index = parseInt(answer, 10) - 1;

  if (index >= 0 && index < options.length) {
    return options[index].id;
  }

  // Default to first option
  return options[0].id;
}

/**
 * Prompt for a secret (API key)
 */
async function promptSecret(question: string): Promise<string> {
  const answer = await prompt(question);
  return answer.trim();
}

/**
 * Run the interactive auth flow
 */
export async function runAuthFlow(): Promise<void> {
  if (!isInteractive) {
    console.error(pc.red('Error: Auth command requires an interactive terminal.'));
    console.error('Set environment variables directly:');
    console.error('  export ANTHROPIC_API_KEY=sk-ant-...');
    console.error('  export GITHUB_TOKEN=ghp_...');
    process.exit(1);
  }

  console.log('');
  console.log(pc.bold(pc.cyan('━━━ wde auth ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')));
  console.log('');
  console.log('Let\'s set up wde to analyze your code!');
  console.log('');

  // Check if secure storage is available
  const secureAvailable = await isSecureStorageAvailable();
  if (secureAvailable) {
    console.log(pc.green('✓') + ' Secure storage available (system keychain)');
  } else {
    console.log(pc.yellow('⚠') + ' System keychain not available');
    console.log(pc.dim('  Credentials will be stored in environment variables only'));
  }
  console.log('');

  const config = await loadUserConfig();

  // Step 1: Choose AI provider
  const providers = getSupportedProviders();
  const providerChoice = await promptSelect(
    'Which AI provider would you like to use?',
    providers.map(p => ({ id: p.id, name: p.name, description: p.description }))
  ) as ProviderType;

  config.ai.provider = providerChoice;

  // Step 2: Configure the provider
  let apiKeyStored = false;

  if (providerChoice === 'anthropic') {
    console.log('');
    console.log(pc.dim('Get your API key from: https://console.anthropic.com/settings/keys'));
    console.log('');
    const apiKey = await promptSecret('Enter your Anthropic API key: ');
    if (apiKey) {
      if (secureAvailable) {
        apiKeyStored = await storeApiKey('anthropic', apiKey);
        if (apiKeyStored) {
          console.log(pc.green('✓') + ' API key stored in system keychain');
        }
      }
      if (!apiKeyStored) {
        console.log('');
        console.log(pc.yellow('Add this to your shell profile (~/.bashrc, ~/.zshrc):'));
        console.log(pc.cyan(`  export ANTHROPIC_API_KEY="${apiKey}"`));
      }
    }
  } else if (providerChoice === 'openai') {
    console.log('');
    console.log(pc.dim('Get your API key from: https://platform.openai.com/api-keys'));
    console.log('');
    const apiKey = await promptSecret('Enter your OpenAI API key: ');
    if (apiKey) {
      if (secureAvailable) {
        apiKeyStored = await storeApiKey('openai', apiKey);
        if (apiKeyStored) {
          console.log(pc.green('✓') + ' API key stored in system keychain');
        }
      }
      if (!apiKeyStored) {
        console.log('');
        console.log(pc.yellow('Add this to your shell profile (~/.bashrc, ~/.zshrc):'));
        console.log(pc.cyan(`  export OPENAI_API_KEY="${apiKey}"`));
      }
    }
  } else if (providerChoice === 'ollama') {
    console.log('');
    console.log(pc.green('✓') + ' Ollama runs locally - no API key needed!');
    console.log(pc.dim('Make sure Ollama is running: ollama serve'));
    console.log('');
    const host = await prompt(`Ollama host (${pc.dim('press enter for localhost')}): `);
    if (host) {
      config.ai.ollamaHost = host;
    }
    apiKeyStored = true; // No key needed
  }

  // Step 3: Validate the provider
  if (apiKeyStored || providerChoice === 'ollama') {
    console.log('');
    console.log('Validating configuration...');
    const provider = getProvider(providerChoice, {
      apiKey: providerChoice !== 'ollama' ? await promptSecret('') : undefined,
      baseUrl: config.ai.ollamaHost,
    });
    const validation = await provider.validate();

    if (!validation.valid && providerChoice !== 'ollama') {
      console.log(pc.yellow(`⚠ Warning: ${validation.error}`));
    } else if (validation.valid) {
      console.log(pc.green('✓') + ' Provider configured successfully!');
    }
  }

  // Step 4: GitHub token (optional)
  console.log('');
  console.log(pc.bold('GitHub Token (optional)'));
  console.log(pc.dim('Required for private repos. Public repos work without it.'));
  console.log(pc.dim('Create at: https://github.com/settings/tokens'));
  console.log('');
  const githubToken = await promptSecret(`GitHub token (${pc.dim('press enter to skip')}): `);
  if (githubToken) {
    if (secureAvailable) {
      const stored = await storeGitHubToken(githubToken);
      if (stored) {
        console.log(pc.green('✓') + ' GitHub token stored in system keychain');
      } else {
        console.log(pc.yellow('Add this to your shell profile:'));
        console.log(pc.cyan(`  export GITHUB_TOKEN="${githubToken}"`));
      }
    } else {
      console.log(pc.yellow('Add this to your shell profile:'));
      console.log(pc.cyan(`  export GITHUB_TOKEN="${githubToken}"`));
    }
  }

  // Step 5: Save configuration (without credentials)
  await saveUserConfig(config);

  console.log('');
  console.log(pc.green('✓') + ' Configuration saved!');
  if (secureAvailable) {
    console.log(pc.dim('  Credentials: System keychain (secure)'));
  }
  console.log(pc.dim(`  Settings: ${getConfigPath()}`));
  console.log('');
  console.log('You\'re all set! Try running:');
  console.log(pc.cyan('  wde src/cli.ts:1'));
  console.log('');
}

/**
 * Show current auth status
 */
export async function showAuthStatus(): Promise<void> {
  const config = await loadUserConfig();
  const creds = await getCredentialStatus();

  console.log('');
  console.log(pc.bold('Current Configuration'));
  console.log('');

  // Secure storage status
  if (creds.secureStorage) {
    console.log(`${pc.green('✓')} Secure storage: ${pc.green('System keychain')}`);
  } else {
    console.log(`${pc.yellow('⚠')} Secure storage: ${pc.yellow('Not available')}`);
    console.log(pc.dim('  Using environment variables'));
  }
  console.log('');

  // AI Provider
  const providers = getSupportedProviders();
  const currentProvider = providers.find(p => p.id === config.ai.provider);
  console.log(`AI Provider: ${pc.cyan(currentProvider?.name || config.ai.provider)}`);

  if (config.ai.provider === 'ollama') {
    console.log(`  Host: ${config.ai.ollamaHost || 'localhost:11434'}`);
    console.log(`  Status: ${pc.green('No API key required')}`);
  } else if (config.ai.provider === 'anthropic') {
    console.log(`  API Key: ${creds.anthropic ? pc.green('✓ Configured') : pc.yellow('Not set')}`);
  } else if (config.ai.provider === 'openai') {
    console.log(`  API Key: ${creds.openai ? pc.green('✓ Configured') : pc.yellow('Not set')}`);
  }

  if (config.ai.model) {
    console.log(`  Model: ${config.ai.model}`);
  }

  // GitHub
  console.log('');
  console.log('GitHub:');
  console.log(`  Token: ${creds.github ? pc.green('✓ Configured') : pc.dim('Not set (optional)')}`);

  // Config file
  console.log('');
  console.log(pc.dim(`Config file: ${getConfigPath()}`));
  console.log('');
  console.log(`Run ${pc.cyan('wde auth')} to reconfigure.`);
  console.log(`Run ${pc.cyan('wde auth --logout')} to clear credentials.`);
  console.log('');
}

/**
 * Clear auth configuration
 */
export async function clearAuth(): Promise<void> {
  await clearConfig();
  console.log(pc.green('✓') + ' All credentials cleared from keychain.');
  console.log(pc.dim('Note: Environment variables are not affected.'));
}
