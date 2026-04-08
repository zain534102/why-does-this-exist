import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import {
  config,
  github,
  app,
  reloadConfig,
} from '../src/configs';
import { loadAppConfig } from '../src/configs/app';
import { loadGitHubConfig } from '../src/configs/github';

describe('Config Module', () => {
  // Store original env vars
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset config before each test
    reloadConfig();
  });

  afterEach(() => {
    // Restore original env vars
    process.env = { ...originalEnv };
    reloadConfig();
  });

  describe('github config', () => {
    it('should return default API base when not set', () => {
      delete process.env.GITHUB_API_BASE;
      reloadConfig();
      expect(github().apiBase).toBe('https://api.github.com');
    });

    it('should return custom API base when set', () => {
      process.env.GITHUB_API_BASE = 'https://github.mycompany.com/api/v3';
      reloadConfig();
      expect(github().apiBase).toBe('https://github.mycompany.com/api/v3');
    });

    it('should return default user agent', () => {
      delete process.env.WDE_USER_AGENT;
      reloadConfig();
      expect(github().userAgent).toBe('wde-cli');
    });

    it('should return default per page value', () => {
      delete process.env.WDE_GITHUB_PER_PAGE;
      reloadConfig();
      expect(github().perPage).toBe(100);
    });

    it('should return custom per page value', () => {
      process.env.WDE_GITHUB_PER_PAGE = '50';
      reloadConfig();
      expect(github().perPage).toBe(50);
    });

    it('should return default max review comments', () => {
      delete process.env.WDE_MAX_REVIEW_COMMENTS;
      reloadConfig();
      expect(github().maxReviewComments).toBe(10);
    });

    it('should return default max PR comments', () => {
      delete process.env.WDE_MAX_PR_COMMENTS;
      reloadConfig();
      expect(github().maxPRComments).toBe(10);
    });

    it('should return default max issue comments', () => {
      delete process.env.WDE_MAX_ISSUE_COMMENTS;
      reloadConfig();
      expect(github().maxIssueComments).toBe(5);
    });

    it('should return default batch size', () => {
      delete process.env.WDE_GITHUB_BATCH_SIZE;
      reloadConfig();
      expect(github().batchSize).toBe(5);
    });
  });

  describe('app config', () => {
    it('should return app name', () => {
      expect(app().name).toBe('wde');
    });

    it('should return verbose as false by default', () => {
      delete process.env.WDE_VERBOSE;
      reloadConfig();
      expect(app().verbose).toBe(false);
    });

    it('should return verbose as true when set', () => {
      process.env.WDE_VERBOSE = 'true';
      reloadConfig();
      expect(app().verbose).toBe(true);
    });

    it('should return default max token budget', () => {
      delete process.env.WDE_MAX_TOKENS;
      reloadConfig();
      expect(app().maxTokenBudget).toBe(8000);
    });

    it('should return custom max token budget', () => {
      process.env.WDE_MAX_TOKENS = '16000';
      reloadConfig();
      expect(app().maxTokenBudget).toBe(16000);
    });

    it('should return default chars per token', () => {
      delete process.env.WDE_CHARS_PER_TOKEN;
      reloadConfig();
      expect(app().charsPerToken).toBe(4);
    });

    it('should return default max diff lines', () => {
      delete process.env.WDE_MAX_DIFF_LINES;
      reloadConfig();
      expect(app().maxDiffLines).toBe(150);
    });

    it('should return default max linked issues', () => {
      delete process.env.WDE_MAX_LINKED_ISSUES;
      reloadConfig();
      expect(app().maxLinkedIssues).toBe(3);
    });
  });

  describe('unified config', () => {
    it('should return all configs in one object', () => {
      const cfg = config();
      expect(cfg.github).toBeDefined();
      expect(cfg.app).toBeDefined();
    });

    it('should cache config between calls', () => {
      const cfg1 = config();
      const cfg2 = config();
      expect(cfg1).toBe(cfg2);
    });
  });

  describe('reloadConfig', () => {
    it('should reload config with new values', () => {
      process.env.WDE_MAX_TOKENS = '5000';
      reloadConfig();
      expect(app().maxTokenBudget).toBe(5000);

      process.env.WDE_MAX_TOKENS = '10000';
      reloadConfig();
      expect(app().maxTokenBudget).toBe(10000);
    });

    it('should return a complete Config object', () => {
      const result = reloadConfig();
      expect(result).toHaveProperty('github');
      expect(result).toHaveProperty('app');
    });

    it('should bust both github and app caches independently', () => {
      process.env.WDE_MAX_TOKENS = '1234';
      process.env.WDE_GITHUB_BATCH_SIZE = '9';
      reloadConfig();
      expect(app().maxTokenBudget).toBe(1234);
      expect(github().batchSize).toBe(9);
    });
  });

  describe('github config (additional env overrides)', () => {
    it('should override user agent with WDE_USER_AGENT', () => {
      process.env.WDE_USER_AGENT = 'my-custom-agent/1.0';
      reloadConfig();
      expect(github().userAgent).toBe('my-custom-agent/1.0');
    });

    it('should override maxReviewComments with WDE_MAX_REVIEW_COMMENTS', () => {
      process.env.WDE_MAX_REVIEW_COMMENTS = '25';
      reloadConfig();
      expect(github().maxReviewComments).toBe(25);
    });

    it('should override maxPRComments with WDE_MAX_PR_COMMENTS', () => {
      process.env.WDE_MAX_PR_COMMENTS = '20';
      reloadConfig();
      expect(github().maxPRComments).toBe(20);
    });

    it('should override maxIssueComments with WDE_MAX_ISSUE_COMMENTS', () => {
      process.env.WDE_MAX_ISSUE_COMMENTS = '15';
      reloadConfig();
      expect(github().maxIssueComments).toBe(15);
    });

    it('should override batchSize with WDE_GITHUB_BATCH_SIZE', () => {
      process.env.WDE_GITHUB_BATCH_SIZE = '10';
      reloadConfig();
      expect(github().batchSize).toBe(10);
    });

    it('should cache the github config between calls', () => {
      const first = github();
      const second = github();
      expect(first).toBe(second);
    });
  });

  describe('app config (additional env overrides)', () => {
    it('should return verbose as false when set to any value other than "true"', () => {
      process.env.WDE_VERBOSE = 'false';
      reloadConfig();
      expect(app().verbose).toBe(false);
    });

    it('should return verbose as false when set to "1"', () => {
      process.env.WDE_VERBOSE = '1';
      reloadConfig();
      expect(app().verbose).toBe(false);
    });

    it('should override charsPerToken with WDE_CHARS_PER_TOKEN', () => {
      process.env.WDE_CHARS_PER_TOKEN = '6';
      reloadConfig();
      expect(app().charsPerToken).toBe(6);
    });

    it('should override maxDiffLines with WDE_MAX_DIFF_LINES', () => {
      process.env.WDE_MAX_DIFF_LINES = '300';
      reloadConfig();
      expect(app().maxDiffLines).toBe(300);
    });

    it('should override maxLinkedIssues with WDE_MAX_LINKED_ISSUES', () => {
      process.env.WDE_MAX_LINKED_ISSUES = '10';
      reloadConfig();
      expect(app().maxLinkedIssues).toBe(10);
    });

    it('should cache the app config between calls', () => {
      const first = app();
      const second = app();
      expect(first).toBe(second);
    });
  });

  describe('unified config (additional)', () => {
    it('github sub-config inside config() matches standalone github()', () => {
      reloadConfig();
      expect(config().github).toBe(github());
    });

    it('app sub-config inside config() matches standalone app()', () => {
      reloadConfig();
      expect(config().app).toBe(app());
    });

    it('should contain expected github properties', () => {
      const cfg = config();
      expect(cfg.github).toHaveProperty('apiBase');
      expect(cfg.github).toHaveProperty('userAgent');
      expect(cfg.github).toHaveProperty('perPage');
      expect(cfg.github).toHaveProperty('maxReviewComments');
      expect(cfg.github).toHaveProperty('maxPRComments');
      expect(cfg.github).toHaveProperty('maxIssueComments');
      expect(cfg.github).toHaveProperty('batchSize');
    });

    it('should contain expected app properties', () => {
      const cfg = config();
      expect(cfg.app).toHaveProperty('name');
      expect(cfg.app).toHaveProperty('verbose');
      expect(cfg.app).toHaveProperty('maxTokenBudget');
      expect(cfg.app).toHaveProperty('charsPerToken');
      expect(cfg.app).toHaveProperty('maxDiffLines');
      expect(cfg.app).toHaveProperty('maxLinkedIssues');
    });
  });
});

// ---------------------------------------------------------------------------
// loadAppConfig() - direct unit tests (NaN for invalid env vars, etc.)
// ---------------------------------------------------------------------------
describe('loadAppConfig', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('should return default name "wde"', () => {
    expect(loadAppConfig().name).toBe('wde');
  });

  it('should return verbose false when WDE_VERBOSE is not set', () => {
    delete process.env.WDE_VERBOSE;
    expect(loadAppConfig().verbose).toBe(false);
  });

  it('should return verbose true when WDE_VERBOSE is "true"', () => {
    process.env.WDE_VERBOSE = 'true';
    expect(loadAppConfig().verbose).toBe(true);
  });

  it('should return verbose false when WDE_VERBOSE is "false"', () => {
    process.env.WDE_VERBOSE = 'false';
    expect(loadAppConfig().verbose).toBe(false);
  });

  it('should parse WDE_MAX_TOKENS as integer', () => {
    process.env.WDE_MAX_TOKENS = '4096';
    expect(loadAppConfig().maxTokenBudget).toBe(4096);
  });

  it('should use default 8000 for maxTokenBudget when WDE_MAX_TOKENS is absent', () => {
    delete process.env.WDE_MAX_TOKENS;
    expect(loadAppConfig().maxTokenBudget).toBe(8000);
  });

  it('should parse WDE_CHARS_PER_TOKEN as integer', () => {
    process.env.WDE_CHARS_PER_TOKEN = '3';
    expect(loadAppConfig().charsPerToken).toBe(3);
  });

  it('should use default 4 for charsPerToken when WDE_CHARS_PER_TOKEN is absent', () => {
    delete process.env.WDE_CHARS_PER_TOKEN;
    expect(loadAppConfig().charsPerToken).toBe(4);
  });

  it('should parse WDE_MAX_DIFF_LINES as integer', () => {
    process.env.WDE_MAX_DIFF_LINES = '500';
    expect(loadAppConfig().maxDiffLines).toBe(500);
  });

  it('should use default 150 for maxDiffLines when WDE_MAX_DIFF_LINES is absent', () => {
    delete process.env.WDE_MAX_DIFF_LINES;
    expect(loadAppConfig().maxDiffLines).toBe(150);
  });

  it('should parse WDE_MAX_LINKED_ISSUES as integer', () => {
    process.env.WDE_MAX_LINKED_ISSUES = '7';
    expect(loadAppConfig().maxLinkedIssues).toBe(7);
  });

  it('should use default 3 for maxLinkedIssues when WDE_MAX_LINKED_ISSUES is absent', () => {
    delete process.env.WDE_MAX_LINKED_ISSUES;
    expect(loadAppConfig().maxLinkedIssues).toBe(3);
  });

  it('should fall back to default for maxTokenBudget when WDE_MAX_TOKENS is non-numeric', () => {
    process.env.WDE_MAX_TOKENS = 'not-a-number';
    expect(loadAppConfig().maxTokenBudget).toBe(8000);
  });

  it('should fall back to default for charsPerToken when WDE_CHARS_PER_TOKEN is non-numeric', () => {
    process.env.WDE_CHARS_PER_TOKEN = 'abc';
    expect(loadAppConfig().charsPerToken).toBe(4);
  });

  it('should fall back to default for maxDiffLines when WDE_MAX_DIFF_LINES is non-numeric', () => {
    process.env.WDE_MAX_DIFF_LINES = 'many';
    expect(loadAppConfig().maxDiffLines).toBe(150);
  });

  it('should fall back to default for maxLinkedIssues when WDE_MAX_LINKED_ISSUES is non-numeric', () => {
    process.env.WDE_MAX_LINKED_ISSUES = 'lots';
    expect(loadAppConfig().maxLinkedIssues).toBe(3);
  });

  it('should truncate floats via parseInt for numeric env vars', () => {
    process.env.WDE_MAX_TOKENS = '8000.9';
    // parseInt('8000.9', 10) === 8000
    expect(loadAppConfig().maxTokenBudget).toBe(8000);
  });
});

// ---------------------------------------------------------------------------
// loadGitHubConfig() - direct unit tests
// ---------------------------------------------------------------------------
describe('loadGitHubConfig', () => {
  const origEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('should return default apiBase', () => {
    delete process.env.GITHUB_API_BASE;
    expect(loadGitHubConfig().apiBase).toBe('https://api.github.com');
  });

  it('should override apiBase with GITHUB_API_BASE', () => {
    process.env.GITHUB_API_BASE = 'https://ghe.corp.com/api/v3';
    expect(loadGitHubConfig().apiBase).toBe('https://ghe.corp.com/api/v3');
  });

  it('should return default userAgent "wde-cli"', () => {
    delete process.env.WDE_USER_AGENT;
    expect(loadGitHubConfig().userAgent).toBe('wde-cli');
  });

  it('should override userAgent with WDE_USER_AGENT', () => {
    process.env.WDE_USER_AGENT = 'test-agent/2.0';
    expect(loadGitHubConfig().userAgent).toBe('test-agent/2.0');
  });

  it('should return default perPage of 100', () => {
    delete process.env.WDE_GITHUB_PER_PAGE;
    expect(loadGitHubConfig().perPage).toBe(100);
  });

  it('should parse WDE_GITHUB_PER_PAGE as integer', () => {
    process.env.WDE_GITHUB_PER_PAGE = '30';
    expect(loadGitHubConfig().perPage).toBe(30);
  });

  it('should return default maxReviewComments of 10', () => {
    delete process.env.WDE_MAX_REVIEW_COMMENTS;
    expect(loadGitHubConfig().maxReviewComments).toBe(10);
  });

  it('should parse WDE_MAX_REVIEW_COMMENTS as integer', () => {
    process.env.WDE_MAX_REVIEW_COMMENTS = '50';
    expect(loadGitHubConfig().maxReviewComments).toBe(50);
  });

  it('should return default maxPRComments of 10', () => {
    delete process.env.WDE_MAX_PR_COMMENTS;
    expect(loadGitHubConfig().maxPRComments).toBe(10);
  });

  it('should parse WDE_MAX_PR_COMMENTS as integer', () => {
    process.env.WDE_MAX_PR_COMMENTS = '40';
    expect(loadGitHubConfig().maxPRComments).toBe(40);
  });

  it('should return default maxIssueComments of 5', () => {
    delete process.env.WDE_MAX_ISSUE_COMMENTS;
    expect(loadGitHubConfig().maxIssueComments).toBe(5);
  });

  it('should parse WDE_MAX_ISSUE_COMMENTS as integer', () => {
    process.env.WDE_MAX_ISSUE_COMMENTS = '20';
    expect(loadGitHubConfig().maxIssueComments).toBe(20);
  });

  it('should return default batchSize of 5', () => {
    delete process.env.WDE_GITHUB_BATCH_SIZE;
    expect(loadGitHubConfig().batchSize).toBe(5);
  });

  it('should parse WDE_GITHUB_BATCH_SIZE as integer', () => {
    process.env.WDE_GITHUB_BATCH_SIZE = '8';
    expect(loadGitHubConfig().batchSize).toBe(8);
  });

  it('should fall back to default for perPage when WDE_GITHUB_PER_PAGE is non-numeric', () => {
    process.env.WDE_GITHUB_PER_PAGE = 'all';
    expect(loadGitHubConfig().perPage).toBe(100);
  });

  it('should fall back to default for maxReviewComments when WDE_MAX_REVIEW_COMMENTS is non-numeric', () => {
    process.env.WDE_MAX_REVIEW_COMMENTS = 'many';
    expect(loadGitHubConfig().maxReviewComments).toBe(10);
  });

  it('should fall back to default for maxPRComments when WDE_MAX_PR_COMMENTS is non-numeric', () => {
    process.env.WDE_MAX_PR_COMMENTS = 'plenty';
    expect(loadGitHubConfig().maxPRComments).toBe(10);
  });

  it('should fall back to default for maxIssueComments when WDE_MAX_ISSUE_COMMENTS is non-numeric', () => {
    process.env.WDE_MAX_ISSUE_COMMENTS = 'few';
    expect(loadGitHubConfig().maxIssueComments).toBe(5);
  });

  it('should fall back to default for batchSize when WDE_GITHUB_BATCH_SIZE is non-numeric', () => {
    process.env.WDE_GITHUB_BATCH_SIZE = 'chunk';
    expect(loadGitHubConfig().batchSize).toBe(5);
  });

  it('should truncate floats via parseInt for numeric env vars', () => {
    process.env.WDE_GITHUB_PER_PAGE = '99.7';
    expect(loadGitHubConfig().perPage).toBe(99);
  });
});
