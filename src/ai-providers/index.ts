import type { AIProvider, ProviderConfig } from './types';
import { AnthropicProvider } from './anthropic';
import { OpenAIProvider } from './openai';
import { OllamaProvider } from './ollama';
import { loadUserConfig } from '../config-manager';
import { ConfigError } from '../errors';

export type { AIProvider, ProviderConfig } from './types';
export { AnthropicProvider } from './anthropic';
export { OpenAIProvider } from './openai';
export { OllamaProvider } from './ollama';

export type ProviderType = 'anthropic' | 'openai' | 'ollama';

/**
 * Get the list of supported providers
 */
export function getSupportedProviders(): Array<{ id: ProviderType; name: string; description: string }> {
  return [
    {
      id: 'anthropic',
      name: 'Anthropic (Claude)',
      description: 'Best for reasoning over messy PR/issue text (recommended)'
    },
    {
      id: 'openai',
      name: 'OpenAI (GPT)',
      description: 'GPT-4o and other OpenAI models'
    },
    {
      id: 'ollama',
      name: 'Ollama (Local)',
      description: 'Run locally with Llama, Mistral, etc. (free, no API key)'
    },
  ];
}

/**
 * Create an AI provider instance based on configuration
 * API keys are retrieved from the system keychain, not the config file
 */
export async function createProvider(overrideProvider?: ProviderType): Promise<AIProvider> {
  const config = await loadUserConfig();
  const providerType = overrideProvider || config.ai.provider;

  // Note: API keys are not in config - they're in the system keychain
  // The providers will fetch them via getApiKey() when needed
  const providerConfig: ProviderConfig = {
    baseUrl: config.ai.ollamaHost,
    model: config.ai.model,
  };

  switch (providerType) {
    case 'anthropic':
      return new AnthropicProvider(providerConfig);
    case 'openai':
      return new OpenAIProvider(providerConfig);
    case 'ollama':
      return new OllamaProvider(providerConfig);
    default:
      throw new ConfigError(`Unknown provider: ${providerType}`);
  }
}

/**
 * Get provider by type
 */
export function getProvider(type: ProviderType, config: ProviderConfig = {}): AIProvider {
  switch (type) {
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'openai':
      return new OpenAIProvider(config);
    case 'ollama':
      return new OllamaProvider(config);
    default:
      throw new ConfigError(`Unknown provider: ${type}`);
  }
}
