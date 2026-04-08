import { describe, expect, it } from 'bun:test';
import {
  WdeError,
  GitError,
  GitHubError,
  AIError,
  ConfigError,
} from '../src/errors';

describe('WdeError', () => {
  it('should create an error with correct message', () => {
    const error = new WdeError('Test error message');
    expect(error.message).toBe('Test error message');
  });

  it('should have a stack trace', () => {
    const error = new WdeError('stack test');
    expect(error.stack).toBeDefined();
  });

  it('should have correct name', () => {
    const error = new WdeError('Test');
    expect(error.name).toBe('WdeError');
  });

  it('should be instance of Error', () => {
    const error = new WdeError('Test');
    expect(error instanceof Error).toBe(true);
  });

  it('should be instance of WdeError', () => {
    const error = new WdeError('Test');
    expect(error instanceof WdeError).toBe(true);
  });

  it('should preserve the message exactly', () => {
    const msg = 'multi\nline\nmessage with special chars: !@#$%';
    const error = new WdeError(msg);
    expect(error.message).toBe(msg);
  });

  it('should be throwable and catchable', () => {
    expect(() => {
      throw new WdeError('thrown');
    }).toThrow('thrown');
  });

  it('should be catchable as Error', () => {
    let caught: Error | null = null;
    try {
      throw new WdeError('base catch');
    } catch (e) {
      caught = e as Error;
    }
    expect(caught instanceof Error).toBe(true);
    expect(caught?.message).toBe('base catch');
  });
});

describe('GitError', () => {
  it('should create an error with correct message', () => {
    const error = new GitError('Git operation failed');
    expect(error.message).toBe('Git operation failed');
  });

  it('should have correct name', () => {
    const error = new GitError('Test');
    expect(error.name).toBe('GitError');
  });

  it('should be instance of WdeError', () => {
    const error = new GitError('Test');
    expect(error instanceof WdeError).toBe(true);
  });

  it('should be instance of GitError', () => {
    const error = new GitError('Test');
    expect(error instanceof GitError).toBe(true);
  });

  it('should be instance of Error', () => {
    const error = new GitError('Test');
    expect(error instanceof Error).toBe(true);
  });

  it('should be throwable and catchable as WdeError', () => {
    let caught: WdeError | null = null;
    try {
      throw new GitError('no git repo found');
    } catch (e) {
      if (e instanceof WdeError) {
        caught = e;
      }
    }
    expect(caught).not.toBeNull();
    expect(caught?.message).toBe('no git repo found');
  });

  it('should have a stack trace', () => {
    const error = new GitError('stack');
    expect(error.stack).toBeDefined();
  });
});

describe('GitHubError', () => {
  it('should create an error with message only', () => {
    const error = new GitHubError('GitHub API failed');
    expect(error.message).toBe('GitHub API failed');
    expect(error.statusCode).toBeUndefined();
  });

  it('should create an error with status code', () => {
    const error = new GitHubError('Not found', 404);
    expect(error.message).toBe('Not found');
    expect(error.statusCode).toBe(404);
  });

  it('should create an error with rate limit info', () => {
    const resetDate = new Date('2024-01-15T12:00:00Z');
    const error = new GitHubError('Rate limited', 403, 0, resetDate);
    expect(error.statusCode).toBe(403);
    expect(error.rateLimitRemaining).toBe(0);
    expect(error.rateLimitReset).toEqual(resetDate);
  });

  it('should have correct name', () => {
    const error = new GitHubError('Test');
    expect(error.name).toBe('GitHubError');
  });

  it('should be instance of WdeError', () => {
    const error = new GitHubError('Test');
    expect(error instanceof WdeError).toBe(true);
  });

  it('should be instance of Error', () => {
    const error = new GitHubError('Test');
    expect(error instanceof Error).toBe(true);
  });

  it('should be instance of GitHubError', () => {
    const error = new GitHubError('Test');
    expect(error instanceof GitHubError).toBe(true);
  });

  it('should leave rateLimitRemaining undefined when not provided', () => {
    const error = new GitHubError('Unauthorized', 401);
    expect(error.rateLimitRemaining).toBeUndefined();
  });

  it('should leave rateLimitReset undefined when not provided', () => {
    const error = new GitHubError('Unauthorized', 401);
    expect(error.rateLimitReset).toBeUndefined();
  });

  it('should accept any numeric status code', () => {
    const codes = [200, 400, 401, 403, 404, 429, 500];
    for (const code of codes) {
      const error = new GitHubError(`Status ${code}`, code);
      expect(error.statusCode).toBe(code);
    }
  });

  it('should store rateLimitReset as Date', () => {
    const reset = new Date('2025-01-01T00:00:00Z');
    const error = new GitHubError('Rate limited', 429, 0, reset);
    expect(error.rateLimitReset instanceof Date).toBe(true);
    expect(error.rateLimitReset?.getFullYear()).toBe(2025);
  });

  it('should be throwable and catchable as WdeError', () => {
    let caught: WdeError | null = null;
    try {
      throw new GitHubError('API down', 500);
    } catch (e) {
      if (e instanceof WdeError) {
        caught = e;
      }
    }
    expect(caught).not.toBeNull();
    expect(caught instanceof GitHubError).toBe(true);
  });

  it('should have a stack trace', () => {
    const error = new GitHubError('trace');
    expect(error.stack).toBeDefined();
  });
});

describe('AIError', () => {
  it('should create an error with correct message', () => {
    const error = new AIError('AI API failed');
    expect(error.message).toBe('AI API failed');
  });

  it('should have correct name', () => {
    const error = new AIError('Test');
    expect(error.name).toBe('AIError');
  });

  it('should be instance of WdeError', () => {
    const error = new AIError('Test');
    expect(error instanceof WdeError).toBe(true);
  });

  it('should be instance of Error', () => {
    const error = new AIError('Test');
    expect(error instanceof Error).toBe(true);
  });

  it('should be instance of AIError', () => {
    const error = new AIError('Test');
    expect(error instanceof AIError).toBe(true);
  });

  it('should be throwable and catchable as WdeError', () => {
    let caught: WdeError | null = null;
    try {
      throw new AIError('model overloaded');
    } catch (e) {
      if (e instanceof WdeError) {
        caught = e;
      }
    }
    expect(caught).not.toBeNull();
    expect(caught instanceof AIError).toBe(true);
  });

  it('should have a stack trace', () => {
    const error = new AIError('trace');
    expect(error.stack).toBeDefined();
  });
});

describe('ConfigError', () => {
  it('should create an error with correct message', () => {
    const error = new ConfigError('Missing API key');
    expect(error.message).toBe('Missing API key');
  });

  it('should have correct name', () => {
    const error = new ConfigError('Test');
    expect(error.name).toBe('ConfigError');
  });

  it('should be instance of WdeError', () => {
    const error = new ConfigError('Test');
    expect(error instanceof WdeError).toBe(true);
  });

  it('should be instance of Error', () => {
    const error = new ConfigError('Test');
    expect(error instanceof Error).toBe(true);
  });

  it('should be instance of ConfigError', () => {
    const error = new ConfigError('Test');
    expect(error instanceof ConfigError).toBe(true);
  });

  it('should be throwable and catchable as WdeError', () => {
    let caught: WdeError | null = null;
    try {
      throw new ConfigError('missing env var');
    } catch (e) {
      if (e instanceof WdeError) {
        caught = e;
      }
    }
    expect(caught).not.toBeNull();
    expect(caught instanceof ConfigError).toBe(true);
  });

  it('should have a stack trace', () => {
    const error = new ConfigError('trace');
    expect(error.stack).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Cross-class inheritance checks
// ---------------------------------------------------------------------------
describe('Error inheritance hierarchy', () => {
  it('GitError should not be instance of GitHubError', () => {
    const error = new GitError('git');
    expect(error instanceof GitHubError).toBe(false);
  });

  it('GitHubError should not be instance of GitError', () => {
    const error = new GitHubError('github');
    expect(error instanceof GitError).toBe(false);
  });

  it('AIError should not be instance of ConfigError', () => {
    const error = new AIError('ai');
    expect(error instanceof ConfigError).toBe(false);
  });

  it('ConfigError should not be instance of AIError', () => {
    const error = new ConfigError('config');
    expect(error instanceof AIError).toBe(false);
  });

  it('all error classes share WdeError as common ancestor', () => {
    const errors: WdeError[] = [
      new WdeError('base'),
      new GitError('git'),
      new GitHubError('github'),
      new AIError('ai'),
      new ConfigError('config'),
    ];
    for (const error of errors) {
      expect(error instanceof WdeError).toBe(true);
      expect(error instanceof Error).toBe(true);
    }
  });

  it('all error classes have a non-empty name property', () => {
    const errors = [
      new WdeError('a'),
      new GitError('b'),
      new GitHubError('c'),
      new AIError('d'),
      new ConfigError('e'),
    ];
    for (const error of errors) {
      expect(error.name.length).toBeGreaterThan(0);
    }
  });

  it('name property should not equal "Error" for any subclass', () => {
    const subclasses = [
      new WdeError('x'),
      new GitError('x'),
      new GitHubError('x'),
      new AIError('x'),
      new ConfigError('x'),
    ];
    for (const error of subclasses) {
      expect(error.name).not.toBe('Error');
    }
  });
});
