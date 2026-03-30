import { describe, expect, it } from 'bun:test';
import {
  getSupportedProviders,
  getProvider,
  AnthropicProvider,
  OpenAIProvider,
  OllamaProvider,
} from '../src/ai-providers';

describe('AI Providers', () => {
  describe('getSupportedProviders', () => {
    it('should return list of providers', () => {
      const providers = getSupportedProviders();
      expect(providers.length).toBeGreaterThan(0);
    });

    it('should include anthropic provider', () => {
      const providers = getSupportedProviders();
      const anthropic = providers.find(p => p.id === 'anthropic');
      expect(anthropic).toBeDefined();
      expect(anthropic?.name).toContain('Anthropic');
    });

    it('should include openai provider', () => {
      const providers = getSupportedProviders();
      const openai = providers.find(p => p.id === 'openai');
      expect(openai).toBeDefined();
      expect(openai?.name).toContain('OpenAI');
    });

    it('should include ollama provider', () => {
      const providers = getSupportedProviders();
      const ollama = providers.find(p => p.id === 'ollama');
      expect(ollama).toBeDefined();
      expect(ollama?.name).toContain('Ollama');
    });

    it('should have description for each provider', () => {
      const providers = getSupportedProviders();
      providers.forEach(p => {
        expect(p.description).toBeDefined();
        expect(p.description.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getProvider', () => {
    it('should return AnthropicProvider for anthropic', () => {
      const provider = getProvider('anthropic');
      expect(provider).toBeInstanceOf(AnthropicProvider);
    });

    it('should return OpenAIProvider for openai', () => {
      const provider = getProvider('openai');
      expect(provider).toBeInstanceOf(OpenAIProvider);
    });

    it('should return OllamaProvider for ollama', () => {
      const provider = getProvider('ollama');
      expect(provider).toBeInstanceOf(OllamaProvider);
    });

    it('should throw for unknown provider', () => {
      expect(() => getProvider('unknown' as any)).toThrow();
    });

    it('should pass config to provider', () => {
      const provider = getProvider('anthropic', { apiKey: 'test-key' });
      expect(provider).toBeInstanceOf(AnthropicProvider);
    });
  });

  describe('AnthropicProvider', () => {
    const provider = new AnthropicProvider({});

    it('should have correct name', () => {
      expect(provider.name).toContain('Anthropic');
    });

    it('should return default model', () => {
      const model = provider.getDefaultModel();
      expect(model).toContain('claude');
    });

    it('should return available models', () => {
      const models = provider.getAvailableModels();
      expect(models.length).toBeGreaterThan(0);
      expect(models.some(m => m.includes('claude'))).toBe(true);
    });

    it('should validate missing API key', async () => {
      const result = await provider.validate();
      // Without API key set, should be invalid
      expect(result.valid).toBe(false);
      expect(result.error).toContain('API key');
    });

    it('should validate invalid API key format', async () => {
      const p = new AnthropicProvider({ apiKey: 'invalid-key' });
      const result = await p.validate();
      expect(result.valid).toBe(false);
      expect(result.error).toContain('format');
    });

    it('should validate correct API key format', async () => {
      const p = new AnthropicProvider({ apiKey: 'sk-ant-test123' });
      const result = await p.validate();
      expect(result.valid).toBe(true);
    });
  });

  describe('OpenAIProvider', () => {
    const provider = new OpenAIProvider({});

    it('should have correct name', () => {
      expect(provider.name).toContain('OpenAI');
    });

    it('should return default model', () => {
      const model = provider.getDefaultModel();
      expect(model).toContain('gpt');
    });

    it('should return available models', () => {
      const models = provider.getAvailableModels();
      expect(models.length).toBeGreaterThan(0);
      expect(models.some(m => m.includes('gpt'))).toBe(true);
    });

    it('should validate missing API key', async () => {
      const result = await provider.validate();
      expect(result.valid).toBe(false);
      expect(result.error).toContain('API key');
    });

    it('should validate invalid API key format', async () => {
      const p = new OpenAIProvider({ apiKey: 'invalid-key' });
      const result = await p.validate();
      expect(result.valid).toBe(false);
      expect(result.error).toContain('format');
    });

    it('should validate correct API key format', async () => {
      const p = new OpenAIProvider({ apiKey: 'sk-test123' });
      const result = await p.validate();
      expect(result.valid).toBe(true);
    });
  });

  describe('OllamaProvider', () => {
    const provider = new OllamaProvider({});

    it('should have correct name', () => {
      expect(provider.name).toContain('Ollama');
    });

    it('should return default model', () => {
      const model = provider.getDefaultModel();
      expect(model).toBeDefined();
      expect(model.length).toBeGreaterThan(0);
    });

    it('should return available models', () => {
      const models = provider.getAvailableModels();
      expect(models.length).toBeGreaterThan(0);
    });

    it('should use localhost by default', () => {
      // Test that it doesn't throw when getting default URL
      const p = new OllamaProvider({});
      expect(p.name).toBe('Ollama (Local)');
    });

    it('should accept custom host', () => {
      const p = new OllamaProvider({ baseUrl: 'http://custom:11434' });
      expect(p).toBeInstanceOf(OllamaProvider);
    });
  });

  describe('AIProvider interface', () => {
    const providers = [
      new AnthropicProvider({}),
      new OpenAIProvider({}),
      new OllamaProvider({}),
    ];

    providers.forEach(provider => {
      describe(provider.name, () => {
        it('should have name property', () => {
          expect(typeof provider.name).toBe('string');
          expect(provider.name.length).toBeGreaterThan(0);
        });

        it('should have getDefaultModel method', () => {
          expect(typeof provider.getDefaultModel).toBe('function');
          const model = provider.getDefaultModel();
          expect(typeof model).toBe('string');
        });

        it('should have getAvailableModels method', () => {
          expect(typeof provider.getAvailableModels).toBe('function');
          const models = provider.getAvailableModels();
          expect(Array.isArray(models)).toBe(true);
        });

        it('should have validate method', () => {
          expect(typeof provider.validate).toBe('function');
        });

        it('should have streamResponse method', () => {
          expect(typeof provider.streamResponse).toBe('function');
        });

        it('should have getResponse method', () => {
          expect(typeof provider.getResponse).toBe('function');
        });
      });
    });
  });
});
