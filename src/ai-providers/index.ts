import type { AIProvider, ProviderConfig } from './types';

import { loadUserConfig } from '../config-manager';
import { ConfigError } from '../errors';
import { AnthropicProvider } from './anthropic';
import { OllamaProvider } from './ollama';
import { OpenAIProvider } from './openai';

export type { AIProvider, ProviderConfig } from './types';
export { AnthropicProvider } from './anthropic';
export { OpenAIProvider } from './openai';
export { OllamaProvider } from './ollama';

export type ProviderType = 'anthropic' | 'openai' | 'ollama';

export function getSupportedProviders(): Array<{
  id: ProviderType;
  name: string;
  description: string;
}> {
  return [
    {
      id: 'anthropic',
      name: 'Anthropic (Claude)',
      description: 'Best for reasoning over messy PR/issue text (recommended)',
    },
    {
      id: 'openai',
      name: 'OpenAI (GPT)',
      description: 'GPT-4o and other OpenAI models',
    },
    {
      id: 'ollama',
      name: 'Ollama (Local)',
      description: 'Run locally with Llama, Mistral, etc. (free, no API key)',
    },
  ];
}

export async function createProvider(overrideProvider?: ProviderType): Promise<AIProvider> {
  const config = await loadUserConfig();
  const providerType = overrideProvider || config.ai.provider;

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
