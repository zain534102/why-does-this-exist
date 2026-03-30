import type { AIProvider, ProviderConfig } from './types';
import { AIError, ConfigError } from '../errors';
import { getApiKey } from '../config-manager';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIChoice {
  message: { content: string };
  delta?: { content?: string };
}

interface OpenAIResponse {
  choices: OpenAIChoice[];
}

export class OpenAIProvider implements AIProvider {
  name = 'OpenAI (GPT)';
  private config: ProviderConfig;
  private resolvedApiKey: string | null = null;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  private async resolveApiKey(): Promise<string> {
    if (this.resolvedApiKey) return this.resolvedApiKey;

    const apiKey = this.config.apiKey || await getApiKey('openai');
    if (!apiKey) {
      throw new ConfigError(
        'OpenAI API key not configured.\n' +
        'Run `wde auth` to set up authentication.'
      );
    }
    this.resolvedApiKey = apiKey;
    return apiKey;
  }

  private getBaseUrl(): string {
    return this.config.baseUrl || 'https://api.openai.com/v1';
  }

  getDefaultModel(): string {
    return 'gpt-4o';
  }

  getAvailableModels(): string[] {
    return [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-3.5-turbo',
    ];
  }

  async validate(): Promise<{ valid: boolean; error?: string }> {
    const apiKey = this.config.apiKey || await getApiKey('openai');
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
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const apiKey = await this.resolveApiKey();
    const baseUrl = this.getBaseUrl();

    const messages: OpenAIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || this.getDefaultModel(),
          messages,
          max_tokens: 500,
          stream: true,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`${response.status}: ${error}`);
      }

      let fullResponse = '';
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new AIError('Failed to get response stream');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

        for (const line of lines) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data) as { choices: Array<{ delta?: { content?: string } }> };
            const content = parsed.choices[0]?.delta?.content;
            if (content) {
              fullResponse += content;
              onChunk(content);
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }

      return fullResponse;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getResponse(
    systemPrompt: string,
    userPrompt: string,
    model: string
  ): Promise<string> {
    const apiKey = await this.resolveApiKey();
    const baseUrl = this.getBaseUrl();

    const messages: OpenAIMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || this.getDefaultModel(),
          messages,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`${response.status}: ${error}`);
      }

      const data = await response.json() as OpenAIResponse;
      return data.choices[0]?.message?.content || '';
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private handleError(error: unknown): Error {
    if (error instanceof ConfigError || error instanceof AIError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('401') || message.includes('authentication')) {
      return new ConfigError('Invalid API key. Run `wde auth` to reconfigure.');
    }
    if (message.includes('429') || message.includes('rate_limit')) {
      return new AIError('Rate limit exceeded. Please try again in a moment.');
    }
    if (message.includes('503') || message.includes('overloaded')) {
      return new AIError('API is currently overloaded. Please try again.');
    }

    return new AIError(`OpenAI API error: ${message}`);
  }
}
