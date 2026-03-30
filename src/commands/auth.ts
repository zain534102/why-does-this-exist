import pc from 'picocolors';
import { loadUserConfig, saveUserConfig, getConfigPath } from '../config-manager';
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
  // Note: In a real implementation, we'd hide the input
  // Bun doesn't have built-in hidden input, so we'll just prompt normally
  const answer = await prompt(question);
  return answer.trim();
}

/**
 * Run the interactive auth flow
 */
export async function runAuthFlow(): Promise<void> {
  if (!isInteractive) {
    console.error(pc.red('Error: Auth command requires an interactive terminal.'));
    console.error('Set environment variables directly or edit the config file:');
    console.error(`  ${pc.dim(getConfigPath())}`);
    process.exit(1);
  }

  console.log('');
  console.log(pc.bold(pc.cyan('━━━ wde auth ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')));
  console.log('');
  console.log('Let\'s set up wde to analyze your code!');
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
  if (providerChoice === 'anthropic') {
    console.log('');
    console.log(pc.dim('Get your API key from: https://console.anthropic.com/settings/keys'));
    console.log('');
    const apiKey = await promptSecret('Enter your Anthropic API key: ');
    if (apiKey) {
      config.ai.apiKey = apiKey;
    }
  } else if (providerChoice === 'openai') {
    console.log('');
    console.log(pc.dim('Get your API key from: https://platform.openai.com/api-keys'));
    console.log('');
    const apiKey = await promptSecret('Enter your OpenAI API key: ');
    if (apiKey) {
      config.ai.apiKey = apiKey;
    }
  } else if (providerChoice === 'ollama') {
    console.log('');
    console.log(pc.dim('Ollama runs locally - no API key needed!'));
    console.log(pc.dim('Make sure Ollama is running: ollama serve'));
    console.log('');
    const host = await prompt(`Ollama host (${pc.dim('press enter for localhost')}): `);
    if (host) {
      config.ai.ollamaHost = host;
    }
  }

  // Step 3: Validate the provider
  console.log('');
  console.log('Validating configuration...');
  const provider = getProvider(providerChoice, { apiKey: config.ai.apiKey, baseUrl: config.ai.ollamaHost });
  const validation = await provider.validate();

  if (!validation.valid) {
    console.log(pc.yellow(`⚠ Warning: ${validation.error}`));
    console.log(pc.dim('You can still save and fix this later.'));
  } else {
    console.log(pc.green('✓ Provider configured successfully!'));
  }

  // Step 4: GitHub token (optional)
  console.log('');
  console.log(pc.bold('GitHub Token (optional)'));
  console.log(pc.dim('Required for private repos. Public repos work without it.'));
  console.log(pc.dim('Create at: https://github.com/settings/tokens'));
  console.log('');
  const githubToken = await promptSecret(`GitHub token (${pc.dim('press enter to skip')}): `);
  if (githubToken) {
    config.github.token = githubToken;
  }

  // Step 5: Save configuration
  await saveUserConfig(config);

  console.log('');
  console.log(pc.green('✓ Configuration saved!'));
  console.log(pc.dim(`  ${getConfigPath()}`));
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

  console.log('');
  console.log(pc.bold('Current Configuration'));
  console.log(pc.dim(`Config file: ${getConfigPath()}`));
  console.log('');

  // AI Provider
  const providers = getSupportedProviders();
  const currentProvider = providers.find(p => p.id === config.ai.provider);
  console.log(`AI Provider: ${pc.cyan(currentProvider?.name || config.ai.provider)}`);

  if (config.ai.provider === 'ollama') {
    console.log(`  Host: ${config.ai.ollamaHost || 'localhost:11434'}`);
  } else {
    const hasKey = !!config.ai.apiKey;
    console.log(`  API Key: ${hasKey ? pc.green('configured') : pc.yellow('not set')}`);
  }

  if (config.ai.model) {
    console.log(`  Model: ${config.ai.model}`);
  }

  // GitHub
  console.log('');
  console.log('GitHub:');
  const hasGitHubToken = !!config.github.token;
  console.log(`  Token: ${hasGitHubToken ? pc.green('configured') : pc.dim('not set (optional)')}`);

  console.log('');
  console.log(`Run ${pc.cyan('wde auth')} to reconfigure.`);
  console.log('');
}

/**
 * Clear auth configuration
 */
export async function clearAuth(): Promise<void> {
  const config = await loadUserConfig();
  config.ai.apiKey = undefined;
  config.github.token = undefined;
  await saveUserConfig(config);

  console.log(pc.green('✓ Credentials cleared.'));
}
