import type { AIProvider, ProviderConfig } from './types';
import { AIError, ConfigError } from '../errors';

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaResponse {
  message: { content: string };
  done: boolean;
}

export class OllamaProvider implements AIProvider {
  name = 'Ollama (Local)';
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  private getBaseUrl(): string {
    return this.config.baseUrl || process.env.OLLAMA_HOST || 'http://localhost:11434';
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
    const baseUrl = this.getBaseUrl();

    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return { valid: false, error: 'Could not connect to Ollama server' };
      }

      return { valid: true };
    } catch {
      return {
        valid: false,
        error: `Could not connect to Ollama at ${baseUrl}. Is Ollama running?`
      };
    }
  }

  async streamResponse(
    systemPrompt: string,
    userPrompt: string,
    model: string,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const baseUrl = this.getBaseUrl();

    const messages: OllamaMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || this.getDefaultModel(),
          messages,
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
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line) as OllamaResponse;
            const content = parsed.message?.content;
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
    const baseUrl = this.getBaseUrl();

    const messages: OllamaMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || this.getDefaultModel(),
          messages,
          stream: false,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`${response.status}: ${error}`);
      }

      const data = await response.json() as OllamaResponse;
      return data.message?.content || '';
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
