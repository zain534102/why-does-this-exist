import OpenAI from 'openai';

import type { AIProvider, ProviderConfig } from './types';

import { getApiKey } from '../config-manager';
import { AIError, ConfigError } from '../errors';

export class OpenAIProvider implements AIProvider {
  name = 'OpenAI (GPT)';
  private client: OpenAI | null = null;
  private config: ProviderConfig;
  private resolvedApiKey: string | null = null;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  private async resolveApiKey(): Promise<string> {
    if (this.resolvedApiKey) return this.resolvedApiKey;

    const apiKey = this.config.apiKey || (await getApiKey('openai'));
    if (!apiKey) {
      throw new ConfigError(
        'OpenAI API key not configured.\n' + 'Run `wde auth` to set up authentication.',
      );
    }
    this.resolvedApiKey = apiKey;
    return apiKey;
  }

  private validateBaseUrl(url: string): void {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new ConfigError('OpenAI baseURL must use http:// or https:// scheme');
      }
      if (parsed.username || parsed.password) {
        throw new ConfigError('OpenAI baseURL must not contain credentials');
      }
    } catch (e) {
      if (e instanceof ConfigError) throw e;
      throw new ConfigError(`Invalid OpenAI baseURL: ${url}`);
    }
  }

  private async getClient(): Promise<OpenAI> {
    if (!this.client) {
      const apiKey = await this.resolveApiKey();
      const baseURL = this.config.baseUrl;
      if (baseURL) this.validateBaseUrl(baseURL);
      this.client = new OpenAI({
        apiKey,
        baseURL: baseURL || undefined,
      });
    }
    return this.client;
  }

  getDefaultModel(): string {
    return 'gpt-4o';
  }

  getAvailableModels(): string[] {
    return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
  }

  async validate(): Promise<{ valid: boolean; error?: string }> {
    const apiKey = this.config.apiKey || (await getApiKey('openai'));
    if (!apiKey) {
      return { valid: false, error: 'API key not configured' };
    }

    // Basic key format validation
    if (!apiKey.startsWith('sk-')) {
      return { valid: false, error: 'Invalid API key format (should start with sk-)' };
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

      const stream = await client.chat.completions.create({
        model: model || this.getDefaultModel(),
        max_tokens: 500,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          fullResponse += content;
          onChunk(content);
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
      const response = await client.chat.completions.create({
        model: model || this.getDefaultModel(),
        max_tokens: 500,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });

      return response.choices[0]?.message?.content || '';
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private handleError(error: unknown): Error {
    if (error instanceof ConfigError || error instanceof AIError) {
      return error;
    }

    if (error instanceof OpenAI.APIError) {
      if (error.status === 401) {
        return new ConfigError('Invalid API key. Run `wde auth` to reconfigure.');
      }
      if (error.status === 429) {
        return new AIError('Rate limit exceeded. Please try again in a moment.');
      }
      if (error.status === 503) {
        return new AIError('API is currently overloaded. Please try again.');
      }
      return new AIError(`OpenAI API error: ${error.message}`);
    }

    const message = error instanceof Error ? error.message : String(error);
    return new AIError(`OpenAI API error: ${message}`);
  }
}
