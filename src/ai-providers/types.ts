/**
 * AI Provider interface - all providers must implement this
 */
export interface AIProvider {
  name: string;

  /**
   * Stream a response from the AI
   */
  streamResponse(
    systemPrompt: string,
    userPrompt: string,
    model: string,
    onChunk: (chunk: string) => void
  ): Promise<string>;

  /**
   * Get a response without streaming (for JSON mode)
   */
  getResponse(
    systemPrompt: string,
    userPrompt: string,
    model: string
  ): Promise<string>;

  /**
   * Get the default model for this provider
   */
  getDefaultModel(): string;

  /**
   * Get available models for this provider
   */
  getAvailableModels(): string[];

  /**
   * Validate the provider is configured correctly
   */
  validate(): Promise<{ valid: boolean; error?: string }>;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}
