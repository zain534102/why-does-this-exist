import { Ollama } from 'ollama';
import type { AIProvider, ProviderConfig } from './types';
import { AIError, ConfigError } from '../errors';

export class OllamaProvider implements AIProvider {
  name = 'Ollama (Local)';
  private client: Ollama | null = null;
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  private getBaseUrl(): string {
    const url = this.config.baseUrl || process.env.OLLAMA_HOST || 'http://localhost:11434';
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new ConfigError('Ollama host must use http:// or https:// scheme');
      }
      if (parsed.username || parsed.password) {
        throw new ConfigError('Ollama host must not contain credentials in the URL');
      }
    } catch (e) {
      if (e instanceof ConfigError) throw e;
      throw new ConfigError(`Invalid Ollama host URL: ${url}`);
    }
    return url;
  }

  private getSafeUrlForDisplay(): string {
    try {
      const parsed = new URL(this.getBaseUrl());
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return '(invalid URL)';
    }
  }

  private getClient(): Ollama {
    if (!this.client) {
      this.client = new Ollama({ host: this.getBaseUrl() });
    }
    return this.client;
  }

  getDefaultModel(): string {
    return 'llama3.2';
  }

  getAvailableModels(): string[] {
    return [
      'llama3.2',
      'llama3.1',
      'mistral',
      'codellama',
      'deepseek-coder',
    ];
  }

  async validate(): Promise<{ valid: boolean; error?: string }> {
    try {
      const client = this.getClient();
      await client.list();
      return { valid: true };
    } catch {
      const safeUrl = this.getSafeUrlForDisplay();
      return {
        valid: false,
        error: `Could not connect to Ollama at ${safeUrl}. Is Ollama running?`
      };
    }
  }

  async streamResponse(
    systemPrompt: string,
    userPrompt: string,
    model: string,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const client = this.getClient();

    try {
      let fullResponse = '';

      const stream = await client.chat({
        model: model || this.getDefaultModel(),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.message?.content;
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

  async getResponse(
    systemPrompt: string,
    userPrompt: string,
    model: string
  ): Promise<string> {
    const client = this.getClient();

    try {
      const response = await client.chat({
        model: model || this.getDefaultModel(),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: false,
      });

      return response.message?.content || '';
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private handleError(error: unknown): Error {
    if (error instanceof ConfigError || error instanceof AIError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
      return new ConfigError(
        'Could not connect to Ollama. Is it running?\n' +
        'Start Ollama with: ollama serve'
      );
    }
    if (message.includes('model') && message.includes('not found')) {
      return new ConfigError(
        `Model not found. Pull it with: ollama pull ${this.getDefaultModel()}`
      );
    }

    return new AIError(`Ollama error: ${message}`);
  }
}
