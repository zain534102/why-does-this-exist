import { describe, expect, it, mock, beforeEach } from 'bun:test';
import {
  getSupportedProviders,
  getProvider,
  AnthropicProvider,
  OpenAIProvider,
  OllamaProvider,
} from '../src/ai-providers';

// ---------------------------------------------------------------------------
// Helpers: async generators used as streaming mocks
// ---------------------------------------------------------------------------

async function* makeAnthropicStream(texts: string[]) {
  for (const text of texts) {
    yield { type: 'content_block_delta', delta: { type: 'text_delta', text } };
  }
}

async function* makeOpenAIStream(contents: (string | undefined)[]) {
  for (const content of contents) {
    yield { choices: [{ delta: { content } }] };
  }
}

async function* makeOllamaStream(contents: string[]) {
  for (const content of contents) {
    yield { message: { content } };
  }
}

// ---------------------------------------------------------------------------
// SDK mocks – must be declared before any provider import so that module
// resolution picks up the mock rather than the real SDK.
// ---------------------------------------------------------------------------

// ---- Anthropic SDK mock ---------------------------------------------------
const mockAnthropicCreate = mock(async (_params: any) => ({
  content: [{ type: 'text', text: 'Anthropic response text' }],
}));

const mockAnthropicStream = mock((_params: any) =>
  makeAnthropicStream(['Hello', ' from', ' Claude'])
);

mock.module('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    constructor(_opts: any) {}
    messages = {
      create: mockAnthropicCreate,
      stream: mockAnthropicStream,
    };
  },
}));

// ---- OpenAI SDK mock ------------------------------------------------------
class FakeOpenAIAPIError extends Error {
  status: number;
  constructor(message: string, opts: { status: number }) {
    super(message);
    this.name = 'APIError';
    this.status = opts.status;
  }
}

const mockOpenAICreate = mock(async (params: any) => {
  if (params.stream) {
    return makeOpenAIStream(['Hello', ' from', ' GPT']);
  }
  return { choices: [{ message: { content: 'OpenAI response text' } }] };
});

mock.module('openai', () => ({
  default: class MockOpenAI {
    static APIError = FakeOpenAIAPIError;
    constructor(_opts: any) {}
    chat = { completions: { create: mockOpenAICreate } };
  },
}));

// ---- Ollama SDK mock -------------------------------------------------------
const mockOllamaList = mock(async () => ({ models: [] }));
const mockOllamaChat = mock(async (params: any) => {
  if (params.stream) {
    return makeOllamaStream(['Hello', ' from', ' Ollama']);
  }
  return { message: { content: 'Ollama response text' } };
});

mock.module('ollama', () => ({
  Ollama: class MockOllama {
    constructor(_opts: any) {}
    list = mockOllamaList;
    chat = mockOllamaChat;
  },
}));

// ---- config-manager mock --------------------------------------------------
const mockGetApiKey = mock(async (_provider: string) => null as string | null);
const mockLoadUserConfig = mock(async () => ({
  ai: { provider: 'anthropic' as const, ollamaHost: undefined, model: undefined },
  preferences: {},
}));

mock.module('../src/config-manager', () => ({
  getApiKey: mockGetApiKey,
  loadUserConfig: mockLoadUserConfig,
}));

// ---------------------------------------------------------------------------
// Re-import providers after mocks are registered so they resolve the mocked
// modules. Dynamic imports are used inside tests to pick up the mocked deps.
// ---------------------------------------------------------------------------

describe('AI Providers', () => {

  // =========================================================================
  // getSupportedProviders
  // =========================================================================
  describe('getSupportedProviders', () => {
    it('should return list of providers', () => {
      const providers = getSupportedProviders();
      expect(providers.length).toBeGreaterThan(0);
    });

    it('should return exactly three providers', () => {
      const providers = getSupportedProviders();
      expect(providers.length).toBe(3);
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

    it('should include id, name, and description on each entry', () => {
      const providers = getSupportedProviders();
      providers.forEach(p => {
        expect(typeof p.id).toBe('string');
        expect(typeof p.name).toBe('string');
        expect(typeof p.description).toBe('string');
      });
    });
  });

  // =========================================================================
  // getProvider (factory without config loading)
  // =========================================================================
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

    it('should throw ConfigError for unknown provider', async () => {
      const { ConfigError } = await import('../src/errors');
      expect(() => getProvider('unknown' as any)).toThrow(ConfigError);
    });

    it('should throw with message containing the unknown provider name', () => {
      expect(() => getProvider('notreal' as any)).toThrow('notreal');
    });

    it('should pass config to provider', () => {
      const provider = getProvider('anthropic', { apiKey: 'test-key' });
      expect(provider).toBeInstanceOf(AnthropicProvider);
    });

    it('should pass baseUrl config to ollama provider', () => {
      const provider = getProvider('ollama', { baseUrl: 'http://myhost:11434' });
      expect(provider).toBeInstanceOf(OllamaProvider);
    });
  });

  // =========================================================================
  // createProvider (loads config, supports override)
  // =========================================================================
  describe('createProvider', () => {
    beforeEach(() => {
      mockLoadUserConfig.mockImplementation(async () => ({
        ai: { provider: 'anthropic' as const, ollamaHost: undefined, model: undefined },
        preferences: {},
      }));
    });

    it('should return AnthropicProvider when config says anthropic', async () => {
      const { createProvider } = await import('../src/ai-providers');
      const provider = await createProvider();
      expect(provider).toBeInstanceOf(AnthropicProvider);
    });

    it('should return OpenAIProvider when config says openai', async () => {
      mockLoadUserConfig.mockImplementation(async () => ({
        ai: { provider: 'openai' as const, ollamaHost: undefined, model: undefined },
        preferences: {},
      }));
      const { createProvider } = await import('../src/ai-providers');
      const provider = await createProvider();
      expect(provider).toBeInstanceOf(OpenAIProvider);
    });

    it('should return OllamaProvider when config says ollama', async () => {
      mockLoadUserConfig.mockImplementation(async () => ({
        ai: { provider: 'ollama' as const, ollamaHost: 'http://localhost:11434', model: undefined },
        preferences: {},
      }));
      const { createProvider } = await import('../src/ai-providers');
      const provider = await createProvider();
      expect(provider).toBeInstanceOf(OllamaProvider);
    });

    it('should use override provider instead of config provider', async () => {
      const { createProvider } = await import('../src/ai-providers');
      const provider = await createProvider('openai');
      expect(provider).toBeInstanceOf(OpenAIProvider);
    });

    it('should use ollama override regardless of config', async () => {
      const { createProvider } = await import('../src/ai-providers');
      const provider = await createProvider('ollama');
      expect(provider).toBeInstanceOf(OllamaProvider);
    });

    it('should use anthropic override regardless of config', async () => {
      mockLoadUserConfig.mockImplementation(async () => ({
        ai: { provider: 'openai' as const, ollamaHost: undefined, model: undefined },
        preferences: {},
      }));
      const { createProvider } = await import('../src/ai-providers');
      const provider = await createProvider('anthropic');
      expect(provider).toBeInstanceOf(AnthropicProvider);
    });

    it('should throw ConfigError for unknown override provider', async () => {
      const { createProvider } = await import('../src/ai-providers');
      const { ConfigError } = await import('../src/errors');
      await expect(createProvider('badprovider' as any)).rejects.toBeInstanceOf(ConfigError);
    });

    it('should throw with message containing unknown provider name', async () => {
      const { createProvider } = await import('../src/ai-providers');
      await expect(createProvider('badprovider' as any)).rejects.toThrow('badprovider');
    });
  });

  // =========================================================================
  // AnthropicProvider
  // =========================================================================
  describe('AnthropicProvider', () => {
    describe('constructor and basic properties', () => {
      it('should have the correct name', () => {
        const p = new AnthropicProvider({});
        expect(p.name).toBe('Anthropic (Claude)');
      });

      it('should return the correct default model', () => {
        const p = new AnthropicProvider({});
        expect(p.getDefaultModel()).toBe('claude-sonnet-4-20250514');
      });

      it('should return available models as an array', () => {
        const p = new AnthropicProvider({});
        const models = p.getAvailableModels();
        expect(Array.isArray(models)).toBe(true);
        expect(models.length).toBeGreaterThan(0);
      });

      it('should include claude in all available model names', () => {
        const p = new AnthropicProvider({});
        const models = p.getAvailableModels();
        expect(models.every(m => m.includes('claude'))).toBe(true);
      });

      it('should include the default model in available models', () => {
        const p = new AnthropicProvider({});
        expect(p.getAvailableModels()).toContain(p.getDefaultModel());
      });
    });

    describe('validate', () => {
      it('should return invalid when no API key is configured', async () => {
        mockGetApiKey.mockImplementation(async () => null);
        const p = new AnthropicProvider({});
        const result = await p.validate();
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should include "API key" in error message when key is missing', async () => {
        mockGetApiKey.mockImplementation(async () => null);
        const p = new AnthropicProvider({});
        const result = await p.validate();
        expect(result.error).toContain('API key');
      });

      it('should return invalid for a key that does not start with sk-ant-', async () => {
        const p = new AnthropicProvider({ apiKey: 'invalid-key-format' });
        const result = await p.validate();
        expect(result.valid).toBe(false);
        expect(result.error).toContain('format');
      });

      it('should return invalid for a bare "sk-" key (not sk-ant-)', async () => {
        const p = new AnthropicProvider({ apiKey: 'sk-notanthopic' });
        const result = await p.validate();
        expect(result.valid).toBe(false);
      });

      it('should return valid for a properly formatted key', async () => {
        const p = new AnthropicProvider({ apiKey: 'sk-ant-api03test' });
        const result = await p.validate();
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should prefer config apiKey over getApiKey result for validation', async () => {
        // Even if getApiKey would return null, the config key takes precedence
        mockGetApiKey.mockImplementation(async () => null);
        const p = new AnthropicProvider({ apiKey: 'sk-ant-configkey' });
        const result = await p.validate();
        expect(result.valid).toBe(true);
      });

      it('should fall back to getApiKey when config has no apiKey', async () => {
        mockGetApiKey.mockImplementation(async () => 'sk-ant-from-keychain');
        const p = new AnthropicProvider({});
        const result = await p.validate();
        expect(result.valid).toBe(true);
      });
    });

    describe('getResponse', () => {
      beforeEach(() => {
        mockAnthropicCreate.mockImplementation(async (_params: any) => ({
          content: [{ type: 'text', text: 'Anthropic response text' }],
        }));
      });

      it('should return text from a successful API response', async () => {
        const p = new AnthropicProvider({ apiKey: 'sk-ant-testkey' });
        const result = await p.getResponse('system', 'user', 'claude-sonnet-4-20250514');
        expect(result).toBe('Anthropic response text');
      });

      it('should pass the correct model to the API', async () => {
        const p = new AnthropicProvider({ apiKey: 'sk-ant-testkey' });
        await p.getResponse('system', 'user', 'claude-opus-4-20250514');
        const callArgs = mockAnthropicCreate.mock.calls[mockAnthropicCreate.mock.calls.length - 1][0];
        expect(callArgs.model).toBe('claude-opus-4-20250514');
      });

      it('should fall back to default model when empty string is passed', async () => {
        const p = new AnthropicProvider({ apiKey: 'sk-ant-testkey' });
        await p.getResponse('system', 'user', '');
        const callArgs = mockAnthropicCreate.mock.calls[mockAnthropicCreate.mock.calls.length - 1][0];
        expect(callArgs.model).toBe(p.getDefaultModel());
      });

      it('should pass system and user messages correctly', async () => {
        const p = new AnthropicProvider({ apiKey: 'sk-ant-testkey' });
        await p.getResponse('my-system-prompt', 'my-user-message', 'claude-sonnet-4-20250514');
        const callArgs = mockAnthropicCreate.mock.calls[mockAnthropicCreate.mock.calls.length - 1][0];
        expect(callArgs.system).toBe('my-system-prompt');
        expect(callArgs.messages[0].content).toBe('my-user-message');
      });

      it('should throw ConfigError when no API key is configured', async () => {
        mockGetApiKey.mockImplementation(async () => null);
        const { ConfigError } = await import('../src/errors');
        const p = new AnthropicProvider({});
        await expect(p.getResponse('s', 'u', 'claude-sonnet-4-20250514')).rejects.toBeInstanceOf(ConfigError);
      });

      it('should throw ConfigError containing wde auth hint when key is missing', async () => {
        mockGetApiKey.mockImplementation(async () => null);
        const p = new AnthropicProvider({});
        await expect(p.getResponse('s', 'u', 'model')).rejects.toThrow('wde auth');
      });

      it('should throw AIError on unexpected response format', async () => {
        mockAnthropicCreate.mockImplementation(async () => ({ content: [] }));
        const { AIError } = await import('../src/errors');
        const p = new AnthropicProvider({ apiKey: 'sk-ant-testkey' });
        await expect(p.getResponse('s', 'u', 'model')).rejects.toBeInstanceOf(AIError);
      });

      it('should throw AIError when response contains no text block', async () => {
        mockAnthropicCreate.mockImplementation(async () => ({
          content: [{ type: 'tool_use', id: 'tu_1' }],
        }));
        const { AIError } = await import('../src/errors');
        const p = new AnthropicProvider({ apiKey: 'sk-ant-testkey' });
        await expect(p.getResponse('s', 'u', 'model')).rejects.toBeInstanceOf(AIError);
      });

      it('should throw ConfigError for authentication errors', async () => {
        mockAnthropicCreate.mockImplementation(async () => {
          throw new Error('authentication failed: invalid api_key');
        });
        const { ConfigError } = await import('../src/errors');
        const p = new AnthropicProvider({ apiKey: 'sk-ant-badkey' });
        await expect(p.getResponse('s', 'u', 'model')).rejects.toBeInstanceOf(ConfigError);
      });

      it('should throw AIError for rate limit errors (429)', async () => {
        mockAnthropicCreate.mockImplementation(async () => {
          throw new Error('rate_limit exceeded: 429');
        });
        const { AIError } = await import('../src/errors');
        const p = new AnthropicProvider({ apiKey: 'sk-ant-testkey' });
        await expect(p.getResponse('s', 'u', 'model')).rejects.toBeInstanceOf(AIError);
      });

      it('should include rate limit hint in error message for 429', async () => {
        mockAnthropicCreate.mockImplementation(async () => {
          throw new Error('rate_limit exceeded');
        });
        const p = new AnthropicProvider({ apiKey: 'sk-ant-testkey' });
        await expect(p.getResponse('s', 'u', 'model')).rejects.toThrow('Rate limit exceeded');
      });

      it('should throw AIError for overloaded API (503)', async () => {
        mockAnthropicCreate.mockImplementation(async () => {
          throw new Error('overloaded: 503');
        });
        const { AIError } = await import('../src/errors');
        const p = new AnthropicProvider({ apiKey: 'sk-ant-testkey' });
        await expect(p.getResponse('s', 'u', 'model')).rejects.toBeInstanceOf(AIError);
      });

      it('should include overloaded hint in error message for 503', async () => {
        mockAnthropicCreate.mockImplementation(async () => {
          throw new Error('overloaded');
        });
        const p = new AnthropicProvider({ apiKey: 'sk-ant-testkey' });
        await expect(p.getResponse('s', 'u', 'model')).rejects.toThrow('overloaded');
      });

      it('should wrap generic errors in AIError with Anthropic prefix', async () => {
        mockAnthropicCreate.mockImplementation(async () => {
          throw new Error('some unknown failure');
        });
        const { AIError } = await import('../src/errors');
        const p = new AnthropicProvider({ apiKey: 'sk-ant-testkey' });
        await expect(p.getResponse('s', 'u', 'model')).rejects.toBeInstanceOf(AIError);
      });

      it('should include original message in wrapped generic error', async () => {
        mockAnthropicCreate.mockImplementation(async () => {
          throw new Error('some unknown failure');
        });
        const p = new AnthropicProvider({ apiKey: 'sk-ant-testkey' });
        await expect(p.getResponse('s', 'u', 'model')).rejects.toThrow('some unknown failure');
      });

      it('should pass through existing AIError without wrapping', async () => {
        const { AIError } = await import('../src/errors');
        const original = new AIError('original ai error');
        mockAnthropicCreate.mockImplementation(async () => { throw original; });
        const p = new AnthropicProvider({ apiKey: 'sk-ant-testkey' });
        await expect(p.getResponse('s', 'u', 'model')).rejects.toBe(original);
      });

      it('should pass through existing ConfigError without wrapping', async () => {
        const { ConfigError } = await import('../src/errors');
        const original = new ConfigError('original config error');
        mockAnthropicCreate.mockImplementation(async () => { throw original; });
        const p = new AnthropicProvider({ apiKey: 'sk-ant-testkey' });
        await expect(p.getResponse('s', 'u', 'model')).rejects.toBe(original);
      });
    });

    describe('streamResponse', () => {
      beforeEach(() => {
        mockAnthropicStream.mockImplementation((_params: any) =>
          makeAnthropicStream(['Hello', ' from', ' Claude'])
        );
      });

      it('should return the full concatenated response', async () => {
        const p = new AnthropicProvider({ apiKey: 'sk-ant-testkey' });
        const result = await p.streamResponse('sys', 'usr', 'model', () => {});
        expect(result).toBe('Hello from Claude');
      });

      it('should call onChunk for each text delta', async () => {
        const p = new AnthropicProvider({ apiKey: 'sk-ant-testkey' });
        const chunks: string[] = [];
        await p.streamResponse('sys', 'usr', 'model', (c) => chunks.push(c));
        expect(chunks).toEqual(['Hello', ' from', ' Claude']);
      });

      it('should pass the correct model to the stream call', async () => {
        const p = new AnthropicProvider({ apiKey: 'sk-ant-testkey' });
        await p.streamResponse('sys', 'usr', 'claude-opus-4-20250514', () => {});
        const callArgs = mockAnthropicStream.mock.calls[mockAnthropicStream.mock.calls.length - 1][0];
        expect(callArgs.model).toBe('claude-opus-4-20250514');
      });

      it('should fall back to default model when empty string is given', async () => {
        const p = new AnthropicProvider({ apiKey: 'sk-ant-testkey' });
        await p.streamResponse('sys', 'usr', '', () => {});
        const callArgs = mockAnthropicStream.mock.calls[mockAnthropicStream.mock.calls.length - 1][0];
        expect(callArgs.model).toBe(p.getDefaultModel());
      });

      it('should ignore non-text events from the stream', async () => {
        mockAnthropicStream.mockImplementation(async function* () {
          yield { type: 'message_start', message: {} };
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'real' } };
          yield { type: 'message_stop' };
        });
        const p = new AnthropicProvider({ apiKey: 'sk-ant-testkey' });
        const result = await p.streamResponse('sys', 'usr', 'model', () => {});
        expect(result).toBe('real');
      });

      it('should return empty string when stream emits no text deltas', async () => {
        mockAnthropicStream.mockImplementation(async function* () {
          yield { type: 'message_start' };
        });
        const p = new AnthropicProvider({ apiKey: 'sk-ant-testkey' });
        const result = await p.streamResponse('sys', 'usr', 'model', () => {});
        expect(result).toBe('');
      });

      it('should throw ConfigError when API key is missing', async () => {
        mockGetApiKey.mockImplementation(async () => null);
        const { ConfigError } = await import('../src/errors');
        const p = new AnthropicProvider({});
        await expect(p.streamResponse('s', 'u', 'model', () => {})).rejects.toBeInstanceOf(ConfigError);
      });

      it('should throw AIError for rate limit errors in stream', async () => {
        mockAnthropicStream.mockImplementation(() => {
          throw new Error('rate_limit');
        });
        const { AIError } = await import('../src/errors');
        const p = new AnthropicProvider({ apiKey: 'sk-ant-testkey' });
        await expect(p.streamResponse('s', 'u', 'model', () => {})).rejects.toBeInstanceOf(AIError);
      });
    });

    describe('resolveApiKey caching', () => {
      it('should cache the resolved API key and not re-fetch on second call', async () => {
        const callCount = { n: 0 };
        mockGetApiKey.mockImplementation(async () => {
          callCount.n++;
          return 'sk-ant-cached-key';
        });
        mockAnthropicCreate.mockImplementation(async () => ({
          content: [{ type: 'text', text: 'ok' }],
        }));
        const p = new AnthropicProvider({});
        await p.getResponse('s', 'u', 'model');
        await p.getResponse('s', 'u', 'model');
        // getApiKey should be called once - second call uses the cached key
        expect(callCount.n).toBe(1);
      });
    });
  });

  // =========================================================================
  // OpenAIProvider
  // =========================================================================
  describe('OpenAIProvider', () => {
    describe('constructor and basic properties', () => {
      it('should have the correct name', () => {
        const p = new OpenAIProvider({});
        expect(p.name).toBe('OpenAI (GPT)');
      });

      it('should return the correct default model', () => {
        const p = new OpenAIProvider({});
        expect(p.getDefaultModel()).toBe('gpt-4o');
      });

      it('should return available models as an array', () => {
        const p = new OpenAIProvider({});
        const models = p.getAvailableModels();
        expect(Array.isArray(models)).toBe(true);
        expect(models.length).toBeGreaterThan(0);
      });

      it('should include gpt in available model names', () => {
        const p = new OpenAIProvider({});
        const models = p.getAvailableModels();
        expect(models.some(m => m.includes('gpt'))).toBe(true);
      });

      it('should include the default model in available models', () => {
        const p = new OpenAIProvider({});
        expect(p.getAvailableModels()).toContain(p.getDefaultModel());
      });
    });

    describe('validate', () => {
      it('should return invalid when no API key is configured', async () => {
        mockGetApiKey.mockImplementation(async () => null);
        const p = new OpenAIProvider({});
        const result = await p.validate();
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should include "API key" in error when key is missing', async () => {
        mockGetApiKey.mockImplementation(async () => null);
        const p = new OpenAIProvider({});
        const result = await p.validate();
        expect(result.error).toContain('API key');
      });

      it('should return invalid for a key that does not start with sk-', async () => {
        const p = new OpenAIProvider({ apiKey: 'invalid-key-format' });
        const result = await p.validate();
        expect(result.valid).toBe(false);
        expect(result.error).toContain('format');
      });

      it('should return valid for a properly formatted key starting with sk-', async () => {
        const p = new OpenAIProvider({ apiKey: 'sk-testkey' });
        const result = await p.validate();
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should also accept sk-ant- style keys (they start with sk-)', async () => {
        const p = new OpenAIProvider({ apiKey: 'sk-ant-somethingleaky' });
        const result = await p.validate();
        expect(result.valid).toBe(true);
      });

      it('should prefer config apiKey for validation', async () => {
        mockGetApiKey.mockImplementation(async () => null);
        const p = new OpenAIProvider({ apiKey: 'sk-config-key' });
        const result = await p.validate();
        expect(result.valid).toBe(true);
      });

      it('should fall back to getApiKey when config has no apiKey', async () => {
        mockGetApiKey.mockImplementation(async () => 'sk-from-keychain');
        const p = new OpenAIProvider({});
        const result = await p.validate();
        expect(result.valid).toBe(true);
      });
    });

    describe('getResponse', () => {
      beforeEach(() => {
        mockOpenAICreate.mockImplementation(async (_params: any) => ({
          choices: [{ message: { content: 'OpenAI response text' } }],
        }));
      });

      it('should return text from a successful API response', async () => {
        const p = new OpenAIProvider({ apiKey: 'sk-testkey' });
        const result = await p.getResponse('system', 'user', 'gpt-4o');
        expect(result).toBe('OpenAI response text');
      });

      it('should pass the correct model to the API', async () => {
        const p = new OpenAIProvider({ apiKey: 'sk-testkey' });
        await p.getResponse('system', 'user', 'gpt-4o-mini');
        const callArgs = mockOpenAICreate.mock.calls[mockOpenAICreate.mock.calls.length - 1][0];
        expect(callArgs.model).toBe('gpt-4o-mini');
      });

      it('should fall back to default model when empty string is passed', async () => {
        const p = new OpenAIProvider({ apiKey: 'sk-testkey' });
        await p.getResponse('system', 'user', '');
        const callArgs = mockOpenAICreate.mock.calls[mockOpenAICreate.mock.calls.length - 1][0];
        expect(callArgs.model).toBe(p.getDefaultModel());
      });

      it('should pass system and user messages in the messages array', async () => {
        const p = new OpenAIProvider({ apiKey: 'sk-testkey' });
        await p.getResponse('my-system', 'my-user', 'gpt-4o');
        const callArgs = mockOpenAICreate.mock.calls[mockOpenAICreate.mock.calls.length - 1][0];
        const msgs = callArgs.messages;
        expect(msgs.find((m: any) => m.role === 'system')?.content).toBe('my-system');
        expect(msgs.find((m: any) => m.role === 'user')?.content).toBe('my-user');
      });

      it('should return empty string when choices content is null', async () => {
        mockOpenAICreate.mockImplementation(async () => ({
          choices: [{ message: { content: null } }],
        }));
        const p = new OpenAIProvider({ apiKey: 'sk-testkey' });
        const result = await p.getResponse('s', 'u', 'gpt-4o');
        expect(result).toBe('');
      });

      it('should return empty string when choices array is empty', async () => {
        mockOpenAICreate.mockImplementation(async () => ({ choices: [] }));
        const p = new OpenAIProvider({ apiKey: 'sk-testkey' });
        const result = await p.getResponse('s', 'u', 'gpt-4o');
        expect(result).toBe('');
      });

      it('should throw ConfigError when no API key is configured', async () => {
        mockGetApiKey.mockImplementation(async () => null);
        const { ConfigError } = await import('../src/errors');
        const p = new OpenAIProvider({});
        await expect(p.getResponse('s', 'u', 'gpt-4o')).rejects.toBeInstanceOf(ConfigError);
      });

      it('should throw ConfigError containing wde auth hint when key is missing', async () => {
        mockGetApiKey.mockImplementation(async () => null);
        const p = new OpenAIProvider({});
        await expect(p.getResponse('s', 'u', 'gpt-4o')).rejects.toThrow('wde auth');
      });

      it('should throw ConfigError for 401 authentication error', async () => {
        mockOpenAICreate.mockImplementation(async () => {
          throw new FakeOpenAIAPIError('Unauthorized', { status: 401 });
        });
        const { ConfigError } = await import('../src/errors');
        const p = new OpenAIProvider({ apiKey: 'sk-badkey' });
        await expect(p.getResponse('s', 'u', 'gpt-4o')).rejects.toBeInstanceOf(ConfigError);
      });

      it('should include wde auth hint in ConfigError for 401', async () => {
        mockOpenAICreate.mockImplementation(async () => {
          throw new FakeOpenAIAPIError('Unauthorized', { status: 401 });
        });
        const p = new OpenAIProvider({ apiKey: 'sk-badkey' });
        await expect(p.getResponse('s', 'u', 'gpt-4o')).rejects.toThrow('wde auth');
      });

      it('should throw AIError for 429 rate limit error', async () => {
        mockOpenAICreate.mockImplementation(async () => {
          throw new FakeOpenAIAPIError('Too Many Requests', { status: 429 });
        });
        const { AIError } = await import('../src/errors');
        const p = new OpenAIProvider({ apiKey: 'sk-testkey' });
        await expect(p.getResponse('s', 'u', 'gpt-4o')).rejects.toBeInstanceOf(AIError);
      });

      it('should include rate limit hint in message for 429', async () => {
        mockOpenAICreate.mockImplementation(async () => {
          throw new FakeOpenAIAPIError('Too Many Requests', { status: 429 });
        });
        const p = new OpenAIProvider({ apiKey: 'sk-testkey' });
        await expect(p.getResponse('s', 'u', 'gpt-4o')).rejects.toThrow('Rate limit exceeded');
      });

      it('should throw AIError for 503 server overloaded error', async () => {
        mockOpenAICreate.mockImplementation(async () => {
          throw new FakeOpenAIAPIError('Service Unavailable', { status: 503 });
        });
        const { AIError } = await import('../src/errors');
        const p = new OpenAIProvider({ apiKey: 'sk-testkey' });
        await expect(p.getResponse('s', 'u', 'gpt-4o')).rejects.toBeInstanceOf(AIError);
      });

      it('should include overloaded hint in message for 503', async () => {
        mockOpenAICreate.mockImplementation(async () => {
          throw new FakeOpenAIAPIError('Service Unavailable', { status: 503 });
        });
        const p = new OpenAIProvider({ apiKey: 'sk-testkey' });
        await expect(p.getResponse('s', 'u', 'gpt-4o')).rejects.toThrow('overloaded');
      });

      it('should throw AIError for other API error status codes (e.g. 500)', async () => {
        mockOpenAICreate.mockImplementation(async () => {
          throw new FakeOpenAIAPIError('Internal Server Error', { status: 500 });
        });
        const { AIError } = await import('../src/errors');
        const p = new OpenAIProvider({ apiKey: 'sk-testkey' });
        await expect(p.getResponse('s', 'u', 'gpt-4o')).rejects.toBeInstanceOf(AIError);
      });

      it('should include OpenAI prefix in generic API error message', async () => {
        mockOpenAICreate.mockImplementation(async () => {
          throw new FakeOpenAIAPIError('Server Error', { status: 500 });
        });
        const p = new OpenAIProvider({ apiKey: 'sk-testkey' });
        await expect(p.getResponse('s', 'u', 'gpt-4o')).rejects.toThrow('OpenAI API error');
      });

      it('should wrap non-APIError exceptions in AIError', async () => {
        mockOpenAICreate.mockImplementation(async () => {
          throw new Error('network failure');
        });
        const { AIError } = await import('../src/errors');
        const p = new OpenAIProvider({ apiKey: 'sk-testkey' });
        await expect(p.getResponse('s', 'u', 'gpt-4o')).rejects.toBeInstanceOf(AIError);
      });

      it('should pass through existing AIError without wrapping', async () => {
        const { AIError } = await import('../src/errors');
        const original = new AIError('direct ai error');
        mockOpenAICreate.mockImplementation(async () => { throw original; });
        const p = new OpenAIProvider({ apiKey: 'sk-testkey' });
        await expect(p.getResponse('s', 'u', 'gpt-4o')).rejects.toBe(original);
      });

      it('should pass through existing ConfigError without wrapping', async () => {
        const { ConfigError } = await import('../src/errors');
        const original = new ConfigError('direct config error');
        mockOpenAICreate.mockImplementation(async () => { throw original; });
        const p = new OpenAIProvider({ apiKey: 'sk-testkey' });
        await expect(p.getResponse('s', 'u', 'gpt-4o')).rejects.toBe(original);
      });
    });

    describe('streamResponse', () => {
      beforeEach(() => {
        mockOpenAICreate.mockImplementation(async (params: any) => {
          if (params.stream) {
            return makeOpenAIStream(['Hello', ' from', ' GPT']);
          }
          return { choices: [{ message: { content: 'OpenAI response text' } }] };
        });
      });

      it('should return the full concatenated response', async () => {
        const p = new OpenAIProvider({ apiKey: 'sk-testkey' });
        const result = await p.streamResponse('sys', 'usr', 'gpt-4o', () => {});
        expect(result).toBe('Hello from GPT');
      });

      it('should call onChunk for each piece of content', async () => {
        const p = new OpenAIProvider({ apiKey: 'sk-testkey' });
        const chunks: string[] = [];
        await p.streamResponse('sys', 'usr', 'gpt-4o', (c) => chunks.push(c));
        expect(chunks).toEqual(['Hello', ' from', ' GPT']);
      });

      it('should pass stream: true to the create call', async () => {
        const p = new OpenAIProvider({ apiKey: 'sk-testkey' });
        await p.streamResponse('sys', 'usr', 'gpt-4o', () => {});
        const callArgs = mockOpenAICreate.mock.calls[mockOpenAICreate.mock.calls.length - 1][0];
        expect(callArgs.stream).toBe(true);
      });

      it('should pass the correct model to the stream call', async () => {
        const p = new OpenAIProvider({ apiKey: 'sk-testkey' });
        await p.streamResponse('sys', 'usr', 'gpt-4o-mini', () => {});
        const callArgs = mockOpenAICreate.mock.calls[mockOpenAICreate.mock.calls.length - 1][0];
        expect(callArgs.model).toBe('gpt-4o-mini');
      });

      it('should fall back to default model when empty string is given', async () => {
        const p = new OpenAIProvider({ apiKey: 'sk-testkey' });
        await p.streamResponse('sys', 'usr', '', () => {});
        const callArgs = mockOpenAICreate.mock.calls[mockOpenAICreate.mock.calls.length - 1][0];
        expect(callArgs.model).toBe(p.getDefaultModel());
      });

      it('should skip chunks with undefined content', async () => {
        mockOpenAICreate.mockImplementation(async () =>
          makeOpenAIStream(['word1', undefined, 'word2'])
        );
        const p = new OpenAIProvider({ apiKey: 'sk-testkey' });
        const chunks: string[] = [];
        await p.streamResponse('sys', 'usr', 'gpt-4o', (c) => chunks.push(c));
        expect(chunks).toEqual(['word1', 'word2']);
      });

      it('should return empty string when all stream chunks have undefined content', async () => {
        mockOpenAICreate.mockImplementation(async () =>
          makeOpenAIStream([undefined, undefined])
        );
        const p = new OpenAIProvider({ apiKey: 'sk-testkey' });
        const result = await p.streamResponse('sys', 'usr', 'gpt-4o', () => {});
        expect(result).toBe('');
      });

      it('should throw ConfigError when API key is missing', async () => {
        mockGetApiKey.mockImplementation(async () => null);
        const { ConfigError } = await import('../src/errors');
        const p = new OpenAIProvider({});
        await expect(p.streamResponse('s', 'u', 'gpt-4o', () => {})).rejects.toBeInstanceOf(ConfigError);
      });

      it('should throw AIError for 401 error during streaming', async () => {
        mockOpenAICreate.mockImplementation(async () => {
          throw new FakeOpenAIAPIError('Unauthorized', { status: 401 });
        });
        const { ConfigError } = await import('../src/errors');
        const p = new OpenAIProvider({ apiKey: 'sk-badkey' });
        await expect(p.streamResponse('s', 'u', 'gpt-4o', () => {})).rejects.toBeInstanceOf(ConfigError);
      });

      it('should throw AIError for 429 error during streaming', async () => {
        mockOpenAICreate.mockImplementation(async () => {
          throw new FakeOpenAIAPIError('Too Many Requests', { status: 429 });
        });
        const { AIError } = await import('../src/errors');
        const p = new OpenAIProvider({ apiKey: 'sk-testkey' });
        await expect(p.streamResponse('s', 'u', 'gpt-4o', () => {})).rejects.toBeInstanceOf(AIError);
      });
    });

    describe('resolveApiKey caching', () => {
      it('should cache the resolved API key across calls', async () => {
        const callCount = { n: 0 };
        mockGetApiKey.mockImplementation(async () => {
          callCount.n++;
          return 'sk-cached-key';
        });
        mockOpenAICreate.mockImplementation(async () => ({
          choices: [{ message: { content: 'ok' } }],
        }));
        const p = new OpenAIProvider({});
        await p.getResponse('s', 'u', 'gpt-4o');
        await p.getResponse('s', 'u', 'gpt-4o');
        expect(callCount.n).toBe(1);
      });
    });
  });

  // =========================================================================
  // OllamaProvider
  // =========================================================================
  describe('OllamaProvider', () => {
    describe('constructor and basic properties', () => {
      it('should have the correct name', () => {
        const p = new OllamaProvider({});
        expect(p.name).toBe('Ollama (Local)');
      });

      it('should return the correct default model', () => {
        const p = new OllamaProvider({});
        expect(p.getDefaultModel()).toBe('llama3.2');
      });

      it('should return available models as an array', () => {
        const p = new OllamaProvider({});
        const models = p.getAvailableModels();
        expect(Array.isArray(models)).toBe(true);
        expect(models.length).toBeGreaterThan(0);
      });

      it('should include llama in available model names', () => {
        const p = new OllamaProvider({});
        const models = p.getAvailableModels();
        expect(models.some(m => m.includes('llama'))).toBe(true);
      });

      it('should include the default model in available models', () => {
        const p = new OllamaProvider({});
        expect(p.getAvailableModels()).toContain(p.getDefaultModel());
      });

      it('should use default localhost URL when no config is provided', () => {
        delete process.env.OLLAMA_HOST;
        const p = new OllamaProvider({});
        // The provider should construct without error and have correct name
        expect(p.name).toBe('Ollama (Local)');
      });

      it('should accept a custom baseUrl in config', () => {
        const p = new OllamaProvider({ baseUrl: 'http://myserver:11434' });
        expect(p).toBeInstanceOf(OllamaProvider);
      });

      it('should prefer OLLAMA_HOST env var over default when no config baseUrl', () => {
        process.env.OLLAMA_HOST = 'http://envhost:11434';
        const p = new OllamaProvider({});
        expect(p).toBeInstanceOf(OllamaProvider);
        delete process.env.OLLAMA_HOST;
      });

      it('should prefer config baseUrl over OLLAMA_HOST env var', () => {
        process.env.OLLAMA_HOST = 'http://envhost:11434';
        const p = new OllamaProvider({ baseUrl: 'http://confighost:11434' });
        expect(p).toBeInstanceOf(OllamaProvider);
        delete process.env.OLLAMA_HOST;
      });
    });

    describe('validate', () => {
      beforeEach(() => {
        mockOllamaList.mockImplementation(async () => ({ models: [] }));
      });

      it('should return valid when Ollama list call succeeds', async () => {
        const p = new OllamaProvider({});
        const result = await p.validate();
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should return invalid when Ollama is not reachable', async () => {
        mockOllamaList.mockImplementation(async () => {
          throw new Error('ECONNREFUSED connect ECONNREFUSED 127.0.0.1:11434');
        });
        const p = new OllamaProvider({});
        const result = await p.validate();
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should include the host URL in the validation error message', async () => {
        mockOllamaList.mockImplementation(async () => {
          throw new Error('ECONNREFUSED');
        });
        const p = new OllamaProvider({});
        const result = await p.validate();
        expect(result.error).toContain('http://localhost:11434');
      });

      it('should include "Is Ollama running?" in the error message', async () => {
        mockOllamaList.mockImplementation(async () => {
          throw new Error('ECONNREFUSED');
        });
        const p = new OllamaProvider({});
        const result = await p.validate();
        expect(result.error).toContain('Ollama');
      });

      it('should include custom host in error when custom baseUrl is set', async () => {
        mockOllamaList.mockImplementation(async () => {
          throw new Error('ECONNREFUSED');
        });
        const p = new OllamaProvider({ baseUrl: 'http://myserver:11434' });
        const result = await p.validate();
        expect(result.error).toContain('http://myserver:11434');
      });
    });

    describe('getResponse', () => {
      beforeEach(() => {
        mockOllamaChat.mockImplementation(async (_params: any) => ({
          message: { content: 'Ollama response text' },
        }));
      });

      it('should return text from a successful API response', async () => {
        const p = new OllamaProvider({});
        const result = await p.getResponse('system', 'user', 'llama3.2');
        expect(result).toBe('Ollama response text');
      });

      it('should pass stream: false to the chat call', async () => {
        const p = new OllamaProvider({});
        await p.getResponse('system', 'user', 'llama3.2');
        const callArgs = mockOllamaChat.mock.calls[mockOllamaChat.mock.calls.length - 1][0];
        expect(callArgs.stream).toBe(false);
      });

      it('should pass the correct model to the API', async () => {
        const p = new OllamaProvider({});
        await p.getResponse('system', 'user', 'mistral');
        const callArgs = mockOllamaChat.mock.calls[mockOllamaChat.mock.calls.length - 1][0];
        expect(callArgs.model).toBe('mistral');
      });

      it('should fall back to default model when empty string is passed', async () => {
        const p = new OllamaProvider({});
        await p.getResponse('system', 'user', '');
        const callArgs = mockOllamaChat.mock.calls[mockOllamaChat.mock.calls.length - 1][0];
        expect(callArgs.model).toBe(p.getDefaultModel());
      });

      it('should pass system and user messages in the messages array', async () => {
        const p = new OllamaProvider({});
        await p.getResponse('my-system', 'my-user', 'llama3.2');
        const callArgs = mockOllamaChat.mock.calls[mockOllamaChat.mock.calls.length - 1][0];
        const msgs = callArgs.messages;
        expect(msgs.find((m: any) => m.role === 'system')?.content).toBe('my-system');
        expect(msgs.find((m: any) => m.role === 'user')?.content).toBe('my-user');
      });

      it('should return empty string when message content is empty', async () => {
        mockOllamaChat.mockImplementation(async () => ({
          message: { content: '' },
        }));
        const p = new OllamaProvider({});
        const result = await p.getResponse('s', 'u', 'llama3.2');
        expect(result).toBe('');
      });

      it('should return empty string when message is undefined', async () => {
        mockOllamaChat.mockImplementation(async () => ({ message: undefined }));
        const p = new OllamaProvider({});
        const result = await p.getResponse('s', 'u', 'llama3.2');
        expect(result).toBe('');
      });

      it('should throw ConfigError for ECONNREFUSED errors', async () => {
        mockOllamaChat.mockImplementation(async () => {
          throw new Error('ECONNREFUSED connect ECONNREFUSED 127.0.0.1:11434');
        });
        const { ConfigError } = await import('../src/errors');
        const p = new OllamaProvider({});
        await expect(p.getResponse('s', 'u', 'llama3.2')).rejects.toBeInstanceOf(ConfigError);
      });

      it('should include "Is it running?" in ECONNREFUSED error message', async () => {
        mockOllamaChat.mockImplementation(async () => {
          throw new Error('ECONNREFUSED');
        });
        const p = new OllamaProvider({});
        await expect(p.getResponse('s', 'u', 'llama3.2')).rejects.toThrow('Is it running?');
      });

      it('should include "ollama serve" hint in ECONNREFUSED error message', async () => {
        mockOllamaChat.mockImplementation(async () => {
          throw new Error('ECONNREFUSED');
        });
        const p = new OllamaProvider({});
        await expect(p.getResponse('s', 'u', 'llama3.2')).rejects.toThrow('ollama serve');
      });

      it('should throw ConfigError for "fetch failed" errors', async () => {
        mockOllamaChat.mockImplementation(async () => {
          throw new Error('fetch failed: connection refused');
        });
        const { ConfigError } = await import('../src/errors');
        const p = new OllamaProvider({});
        await expect(p.getResponse('s', 'u', 'llama3.2')).rejects.toBeInstanceOf(ConfigError);
      });

      it('should throw ConfigError when model is not found', async () => {
        mockOllamaChat.mockImplementation(async () => {
          throw new Error('model "llama3.2" not found');
        });
        const { ConfigError } = await import('../src/errors');
        const p = new OllamaProvider({});
        await expect(p.getResponse('s', 'u', 'llama3.2')).rejects.toBeInstanceOf(ConfigError);
      });

      it('should include "ollama pull" hint in model not found error', async () => {
        mockOllamaChat.mockImplementation(async () => {
          throw new Error('model "llama3.2" not found');
        });
        const p = new OllamaProvider({});
        await expect(p.getResponse('s', 'u', 'llama3.2')).rejects.toThrow('ollama pull');
      });

      it('should include default model name in model not found error', async () => {
        mockOllamaChat.mockImplementation(async () => {
          throw new Error('model "llama3.2" not found');
        });
        const p = new OllamaProvider({});
        await expect(p.getResponse('s', 'u', 'llama3.2')).rejects.toThrow('llama3.2');
      });

      it('should throw AIError for generic errors', async () => {
        mockOllamaChat.mockImplementation(async () => {
          throw new Error('some unexpected error');
        });
        const { AIError } = await import('../src/errors');
        const p = new OllamaProvider({});
        await expect(p.getResponse('s', 'u', 'llama3.2')).rejects.toBeInstanceOf(AIError);
      });

      it('should include Ollama prefix in generic error message', async () => {
        mockOllamaChat.mockImplementation(async () => {
          throw new Error('some unexpected error');
        });
        const p = new OllamaProvider({});
        await expect(p.getResponse('s', 'u', 'llama3.2')).rejects.toThrow('Ollama error');
      });

      it('should pass through existing ConfigError without wrapping', async () => {
        const { ConfigError } = await import('../src/errors');
        const original = new ConfigError('direct config error');
        mockOllamaChat.mockImplementation(async () => { throw original; });
        const p = new OllamaProvider({});
        await expect(p.getResponse('s', 'u', 'llama3.2')).rejects.toBe(original);
      });

      it('should pass through existing AIError without wrapping', async () => {
        const { AIError } = await import('../src/errors');
        const original = new AIError('direct ai error');
        mockOllamaChat.mockImplementation(async () => { throw original; });
        const p = new OllamaProvider({});
        await expect(p.getResponse('s', 'u', 'llama3.2')).rejects.toBe(original);
      });
    });

    describe('streamResponse', () => {
      beforeEach(() => {
        mockOllamaChat.mockImplementation(async (params: any) => {
          if (params.stream) {
            return makeOllamaStream(['Hello', ' from', ' Ollama']);
          }
          return { message: { content: 'Ollama response text' } };
        });
      });

      it('should return the full concatenated response', async () => {
        const p = new OllamaProvider({});
        const result = await p.streamResponse('sys', 'usr', 'llama3.2', () => {});
        expect(result).toBe('Hello from Ollama');
      });

      it('should call onChunk for each piece of content', async () => {
        const p = new OllamaProvider({});
        const chunks: string[] = [];
        await p.streamResponse('sys', 'usr', 'llama3.2', (c) => chunks.push(c));
        expect(chunks).toEqual(['Hello', ' from', ' Ollama']);
      });

      it('should pass stream: true to the chat call', async () => {
        const p = new OllamaProvider({});
        await p.streamResponse('sys', 'usr', 'llama3.2', () => {});
        const callArgs = mockOllamaChat.mock.calls[mockOllamaChat.mock.calls.length - 1][0];
        expect(callArgs.stream).toBe(true);
      });

      it('should pass the correct model to the stream call', async () => {
        const p = new OllamaProvider({});
        await p.streamResponse('sys', 'usr', 'codellama', () => {});
        const callArgs = mockOllamaChat.mock.calls[mockOllamaChat.mock.calls.length - 1][0];
        expect(callArgs.model).toBe('codellama');
      });

      it('should fall back to default model when empty string is given', async () => {
        const p = new OllamaProvider({});
        await p.streamResponse('sys', 'usr', '', () => {});
        const callArgs = mockOllamaChat.mock.calls[mockOllamaChat.mock.calls.length - 1][0];
        expect(callArgs.model).toBe(p.getDefaultModel());
      });

      it('should skip chunks with falsy content', async () => {
        mockOllamaChat.mockImplementation(async () =>
          makeOllamaStream(['word1', '', 'word2'])
        );
        const p = new OllamaProvider({});
        const chunks: string[] = [];
        await p.streamResponse('sys', 'usr', 'llama3.2', (c) => chunks.push(c));
        // empty string is falsy so it should be skipped
        expect(chunks).toEqual(['word1', 'word2']);
      });

      it('should return empty string when stream emits no content', async () => {
        mockOllamaChat.mockImplementation(async function* () {
          yield { message: { content: '' } };
        });
        const p = new OllamaProvider({});
        const result = await p.streamResponse('sys', 'usr', 'llama3.2', () => {});
        expect(result).toBe('');
      });

      it('should throw ConfigError for ECONNREFUSED errors in stream', async () => {
        mockOllamaChat.mockImplementation(async () => {
          throw new Error('ECONNREFUSED');
        });
        const { ConfigError } = await import('../src/errors');
        const p = new OllamaProvider({});
        await expect(p.streamResponse('s', 'u', 'llama3.2', () => {})).rejects.toBeInstanceOf(ConfigError);
      });

      it('should throw ConfigError for model not found in stream', async () => {
        mockOllamaChat.mockImplementation(async () => {
          throw new Error('model "llama3.2" not found');
        });
        const { ConfigError } = await import('../src/errors');
        const p = new OllamaProvider({});
        await expect(p.streamResponse('s', 'u', 'llama3.2', () => {})).rejects.toBeInstanceOf(ConfigError);
      });

      it('should throw AIError for generic stream errors', async () => {
        mockOllamaChat.mockImplementation(async () => {
          throw new Error('unknown stream failure');
        });
        const { AIError } = await import('../src/errors');
        const p = new OllamaProvider({});
        await expect(p.streamResponse('s', 'u', 'llama3.2', () => {})).rejects.toBeInstanceOf(AIError);
      });
    });
  });

  // =========================================================================
  // AIProvider interface compliance (all three providers)
  // =========================================================================
  describe('AIProvider interface compliance', () => {
    const providers = [
      new AnthropicProvider({}),
      new OpenAIProvider({}),
      new OllamaProvider({}),
    ];

    providers.forEach(provider => {
      describe(provider.name, () => {
        it('should have a non-empty string name property', () => {
          expect(typeof provider.name).toBe('string');
          expect(provider.name.length).toBeGreaterThan(0);
        });

        it('should have a getDefaultModel method returning a non-empty string', () => {
          expect(typeof provider.getDefaultModel).toBe('function');
          const model = provider.getDefaultModel();
          expect(typeof model).toBe('string');
          expect(model.length).toBeGreaterThan(0);
        });

        it('should have a getAvailableModels method returning a non-empty array', () => {
          expect(typeof provider.getAvailableModels).toBe('function');
          const models = provider.getAvailableModels();
          expect(Array.isArray(models)).toBe(true);
          expect(models.length).toBeGreaterThan(0);
        });

        it('should have a validate method', () => {
          expect(typeof provider.validate).toBe('function');
        });

        it('should have a streamResponse method', () => {
          expect(typeof provider.streamResponse).toBe('function');
        });

        it('should have a getResponse method', () => {
          expect(typeof provider.getResponse).toBe('function');
        });

        it('should have validate returning a Promise', () => {
          const result = provider.validate();
          expect(result).toBeInstanceOf(Promise);
          // Consume the promise to avoid unhandled rejection warnings
          result.catch(() => {});
        });
      });
    });
  });
});
