import Anthropic from '@anthropic-ai/sdk';

import type { AIProvider, ProviderConfig } from './types';

import { getApiKey } from '../config-manager';
import { AIError, ConfigError } from '../errors';

export class AnthropicProvider implements AIProvider {
  name = 'Anthropic (Claude)';
  private client: Anthropic | null = null;
  private config: ProviderConfig;
  private resolvedApiKey: string | null = null;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  private async resolveApiKey(): Promise<string> {
    if (this.resolvedApiKey) return this.resolvedApiKey;

    // Check config first, then keychain/env
    const apiKey = this.config.apiKey || (await getApiKey('anthropic'));
    if (!apiKey) {
      throw new ConfigError(
        'Anthropic API key not configured.\n' + 'Run `wde auth` to set up authentication.',
      );
    }
    this.resolvedApiKey = apiKey;
    return apiKey;
  }

  private async getClient(): Promise<Anthropic> {
    if (!this.client) {
      const apiKey = await this.resolveApiKey();
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  getDefaultModel(): string {
    return 'claude-sonnet-4-20250514';
  }

  getAvailableModels(): string[] {
    return ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-4-20250514'];
  }

  async validate(): Promise<{ valid: boolean; error?: string }> {
    const apiKey = this.config.apiKey || (await getApiKey('anthropic'));
    if (!apiKey) {
      return { valid: false, error: 'API key not configured' };
    }

    // Basic key format validation
    if (!apiKey.startsWith('sk-ant-')) {
      return { valid: false, error: 'Invalid API key format (should start with sk-ant-)' };
    }

    return { valid: true };
  }

  async streamResponse(
    systemPrompt: string,
    userPrompt: string,
    model: string,
    onChunk: (chunk: string) => void,
  ): Promise<string> {
    const client = await this.getClient();

    try {
      let fullResponse = '';

      const stream = client.messages.stream({
        model: model || this.getDefaultModel(),
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const text = event.delta.text;
          fullResponse += text;
          onChunk(text);
        }
      }

      return fullResponse;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getResponse(systemPrompt: string, userPrompt: string, model: string): Promise<string> {
    const client = await this.getClient();

    try {
      const response = await client.messages.create({
        model: model || this.getDefaultModel(),
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new AIError('Unexpected response format from Claude API');
      }

      return textBlock.text;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private handleError(error: unknown): Error {
    if (error instanceof ConfigError || error instanceof AIError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('authentication') || message.includes('api_key')) {
      return new ConfigError('Invalid API key. Run `wde auth` to reconfigure.');
    }
    if (message.includes('rate_limit') || message.includes('429')) {
      return new AIError('Rate limit exceeded. Please try again in a moment.');
    }
    if (message.includes('overloaded') || message.includes('503')) {
      return new AIError('API is currently overloaded. Please try again.');
    }

    return new AIError(`Anthropic API error: ${message}`);
  }
}
