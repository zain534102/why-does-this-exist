import { describe, expect, it, afterEach } from 'bun:test';
import { buildContext, buildSystemPrompt, getVerboseContext } from '../src/context-builder';
import type { DecisionTrail, BlameResult, PRContext, IssueContext } from '../src/types';

// Helper to create a minimal valid trail
function createMinimalTrail(overrides?: Partial<DecisionTrail>): DecisionTrail {
  return {
    blame: {
      sha: 'abc123def456789',
      commitMessage: 'feat: add feature',
      diff: '+ new code',
      authorName: 'Test User',
      authorEmail: 'test@example.com',
      authorDate: new Date('2024-01-15T10:00:00Z'),
    },
    pr: null,
    issues: [],
    repoOwner: 'test-org',
    repo: 'test-repo',
    ...overrides,
  };
}

// Helper to create a full trail with PR and issues
function createFullTrail(): DecisionTrail {
  return {
    blame: {
      sha: 'abc123def456789',
      commitMessage: 'feat: add new feature\n\nThis adds a cool new feature.',
      diff: '+ const newFeature = true;\n- const oldCode = false;\n+ // more changes',
      authorName: 'John Doe',
      authorEmail: 'john@example.com',
      authorDate: new Date('2024-01-15T10:00:00Z'),
    },
    pr: {
      number: 42,
      title: 'Add new feature',
      body: 'This PR introduces a new feature.\n\nFixes #10',
      labels: ['enhancement', 'reviewed'],
      state: 'merged',
      reviewComments: [
        {
          id: 1,
          body: 'LGTM!',
          user: 'reviewer1',
          path: 'src/feature.ts',
          line: 10,
          createdAt: new Date('2024-01-15T11:00:00Z'),
        },
        {
          id: 2,
          body: 'Consider adding tests',
          user: 'reviewer2',
          path: 'src/feature.ts',
          line: 20,
          createdAt: new Date('2024-01-15T12:00:00Z'),
        },
      ],
      comments: [
        {
          id: 3,
          body: 'Great work!',
          user: 'manager',
          createdAt: new Date('2024-01-15T12:00:00Z'),
          reactions: 5,
        },
        {
          id: 4,
          body: 'Approved',
          user: 'lead',
          createdAt: new Date('2024-01-15T13:00:00Z'),
          reactions: 2,
        },
      ],
    },
    issues: [
      {
        number: 10,
        title: 'Need performance improvements',
        body: 'The current implementation is too slow.',
        state: 'closed',
        labels: ['bug', 'performance'],
        comments: [
          {
            id: 5,
            body: 'This is blocking production',
            user: 'user1',
            createdAt: new Date('2024-01-10T10:00:00Z'),
            reactions: 10,
          },
        ],
      },
      {
        number: 20,
        title: 'Related feature request',
        body: 'Would be nice to have this feature.',
        state: 'closed',
        labels: ['enhancement'],
        comments: [],
      },
    ],
    repoOwner: 'test-org',
    repo: 'test-repo',
  };
}

describe('buildContext', () => {
  describe('commit information', () => {
    it('should include commit SHA', () => {
      const trail = createMinimalTrail();
      const context = buildContext(trail);
      expect(context).toContain('abc123def456789');
    });

    it('should include author name', () => {
      const trail = createMinimalTrail();
      const context = buildContext(trail);
      expect(context).toContain('Test User');
    });

    it('should include author email', () => {
      const trail = createMinimalTrail();
      const context = buildContext(trail);
      expect(context).toContain('test@example.com');
    });

    it('should include commit message', () => {
      const trail = createMinimalTrail();
      const context = buildContext(trail);
      expect(context).toContain('feat: add feature');
    });

    it('should include diff', () => {
      const trail = createMinimalTrail();
      const context = buildContext(trail);
      expect(context).toContain('new code');
    });

    it('should include commit date', () => {
      const trail = createMinimalTrail();
      const context = buildContext(trail);
      expect(context).toContain('2024-01-15');
    });
  });

  describe('PR information', () => {
    it('should include PR number and title', () => {
      const trail = createFullTrail();
      const context = buildContext(trail);
      expect(context).toContain('PR #42');
      expect(context).toContain('Add new feature');
    });

    it('should include PR state', () => {
      const trail = createFullTrail();
      const context = buildContext(trail);
      expect(context).toContain('merged');
    });

    it('should include PR labels', () => {
      const trail = createFullTrail();
      const context = buildContext(trail);
      expect(context).toContain('enhancement');
      expect(context).toContain('reviewed');
    });

    it('should include PR body', () => {
      const trail = createFullTrail();
      const context = buildContext(trail);
      expect(context).toContain('introduces a new feature');
    });

    it('should handle missing PR gracefully', () => {
      const trail = createMinimalTrail({ pr: null });
      const context = buildContext(trail);
      expect(context).toContain('No PR found');
      expect(context).toContain('pushed directly to the main branch');
    });

    it('should handle PR with empty body', () => {
      const trail = createMinimalTrail({
        pr: {
          number: 1,
          title: 'Test PR',
          body: '',
          labels: [],
          state: 'open',
          reviewComments: [],
          comments: [],
        },
      });
      const context = buildContext(trail);
      expect(context).toContain('PR #1');
    });
  });

  describe('review comments', () => {
    it('should include review comments', () => {
      const trail = createFullTrail();
      const context = buildContext(trail);
      expect(context).toContain('LGTM!');
      expect(context).toContain('reviewer1');
    });

    it('should include file path in review comments', () => {
      const trail = createFullTrail();
      const context = buildContext(trail);
      expect(context).toContain('src/feature.ts');
    });

    it('should include line number in review comments', () => {
      const trail = createFullTrail();
      const context = buildContext(trail);
      expect(context).toContain(':10');
    });

    it('should handle review comments without line number', () => {
      const trail = createMinimalTrail({
        pr: {
          number: 1,
          title: 'Test',
          body: '',
          labels: [],
          state: 'open',
          reviewComments: [
            {
              id: 1,
              body: 'General comment',
              user: 'reviewer',
              path: 'file.ts',
              line: null,
              createdAt: new Date(),
            },
          ],
          comments: [],
        },
      });
      const context = buildContext(trail);
      expect(context).toContain('General comment');
    });
  });

  describe('PR comments', () => {
    it('should include PR comments', () => {
      const trail = createFullTrail();
      const context = buildContext(trail);
      expect(context).toContain('Great work!');
      expect(context).toContain('manager');
    });

    it('should include reaction count', () => {
      const trail = createFullTrail();
      const context = buildContext(trail);
      expect(context).toContain('5 reactions');
    });

    it('should not show reactions when count is 0', () => {
      const trail = createMinimalTrail({
        pr: {
          number: 1,
          title: 'Test',
          body: '',
          labels: [],
          state: 'open',
          reviewComments: [],
          comments: [
            {
              id: 1,
              body: 'Comment',
              user: 'user',
              createdAt: new Date(),
              reactions: 0,
            },
          ],
        },
      });
      const context = buildContext(trail);
      expect(context).not.toContain('0 reactions');
    });
  });

  describe('issues', () => {
    it('should include issue number and title', () => {
      const trail = createFullTrail();
      const context = buildContext(trail);
      expect(context).toContain('Issue #10');
      expect(context).toContain('Need performance improvements');
    });

    it('should include issue state', () => {
      const trail = createFullTrail();
      const context = buildContext(trail);
      expect(context).toContain('closed');
    });

    it('should include issue labels', () => {
      const trail = createFullTrail();
      const context = buildContext(trail);
      expect(context).toContain('bug');
      expect(context).toContain('performance');
    });

    it('should include issue body', () => {
      const trail = createFullTrail();
      const context = buildContext(trail);
      expect(context).toContain('current implementation is too slow');
    });

    it('should include issue comments', () => {
      const trail = createFullTrail();
      const context = buildContext(trail);
      expect(context).toContain('blocking production');
    });

    it('should handle issues with empty body', () => {
      const trail = createMinimalTrail({
        issues: [
          {
            number: 1,
            title: 'Test Issue',
            body: '',
            state: 'open',
            labels: [],
            comments: [],
          },
        ],
      });
      const context = buildContext(trail);
      expect(context).toContain('Issue #1');
    });

    it('should handle empty issues array', () => {
      const trail = createMinimalTrail({ issues: [] });
      const context = buildContext(trail);
      expect(context).not.toContain('Linked Issues');
    });
  });

  describe('truncation', () => {
    it('should truncate very long commit messages', () => {
      const longMessage = 'x'.repeat(1000);
      const trail = createMinimalTrail({
        blame: {
          sha: 'abc123',
          commitMessage: longMessage,
          diff: '',
          authorName: 'Test',
          authorEmail: 'test@test.com',
          authorDate: new Date(),
        },
      });
      const context = buildContext(trail);
      // Should be truncated with ellipsis
      expect(context.length).toBeLessThan(longMessage.length + 1000);
    });

    it('should truncate very long diffs', () => {
      const longDiff = '+ ' + 'x'.repeat(5000);
      const trail = createMinimalTrail({
        blame: {
          sha: 'abc123',
          commitMessage: 'test',
          diff: longDiff,
          authorName: 'Test',
          authorEmail: 'test@test.com',
          authorDate: new Date(),
        },
      });
      const context = buildContext(trail);
      expect(context.length).toBeLessThan(longDiff.length + 1000);
    });
  });

  describe('structure', () => {
    it('should include header section', () => {
      const trail = createMinimalTrail();
      const context = buildContext(trail);
      expect(context).toContain('# Code Decision Trail');
    });

    it('should include Git Commit section', () => {
      const trail = createMinimalTrail();
      const context = buildContext(trail);
      expect(context).toContain('## Git Commit');
    });

    it('should include Pull Request section', () => {
      const trail = createMinimalTrail();
      const context = buildContext(trail);
      expect(context).toContain('## Pull Request');
    });

    it('should include diff in code block', () => {
      const trail = createMinimalTrail();
      const context = buildContext(trail);
      expect(context).toContain('```diff');
    });
  });
});

describe('buildSystemPrompt', () => {
  it('should return a non-empty string', () => {
    const prompt = buildSystemPrompt();
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('should include sentence limit guideline', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('3-5 sentences');
  });

  it('should focus on the "why"', () => {
    const prompt = buildSystemPrompt();
    expect(prompt.toLowerCase()).toContain('why');
  });

  it('should mention alternatives', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('alternatives');
  });

  it('should mention gotchas', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('gotchas');
  });

  it('should instruct not to make up information', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('Never make up information');
  });

  it('should mention acknowledging limitations', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('limitations');
  });
});

describe('getVerboseContext', () => {
  it('should include repository info', () => {
    const trail = createMinimalTrail();
    const context = buildContext(trail);
    const verbose = getVerboseContext(trail, context);
    expect(verbose).toContain('test-org/test-repo');
  });

  it('should include commit SHA', () => {
    const trail = createMinimalTrail();
    const context = buildContext(trail);
    const verbose = getVerboseContext(trail, context);
    expect(verbose).toContain('abc123def456789');
  });

  it('should include PR info', () => {
    const trail = createFullTrail();
    const context = buildContext(trail);
    const verbose = getVerboseContext(trail, context);
    expect(verbose).toContain('#42');
  });

  it('should show "None found" for missing PR', () => {
    const trail = createMinimalTrail({ pr: null });
    const context = buildContext(trail);
    const verbose = getVerboseContext(trail, context);
    expect(verbose).toContain('None found');
  });

  it('should include issue numbers', () => {
    const trail = createFullTrail();
    const context = buildContext(trail);
    const verbose = getVerboseContext(trail, context);
    expect(verbose).toContain('#10');
    expect(verbose).toContain('#20');
  });

  it('should include the built context', () => {
    const trail = createMinimalTrail();
    const context = buildContext(trail);
    const verbose = getVerboseContext(trail, context);
    expect(verbose).toContain(context);
  });

  it('should have visual separators', () => {
    const trail = createMinimalTrail();
    const context = buildContext(trail);
    const verbose = getVerboseContext(trail, context);
    expect(verbose).toContain('═══');
    expect(verbose).toContain('───');
  });

  it('should include section headers', () => {
    const trail = createMinimalTrail();
    const context = buildContext(trail);
    const verbose = getVerboseContext(trail, context);
    expect(verbose).toContain('FULL CONTEXT TRAIL');
    expect(verbose).toContain('PROMPT SENT TO CLAUDE');
  });

  it('should show "None found" for empty issues array', () => {
    const trail = createMinimalTrail({ issues: [] });
    const context = buildContext(trail);
    const verbose = getVerboseContext(trail, context);
    expect(verbose).toContain('None found');
  });

  it('should list all issue numbers when multiple issues present', () => {
    const trail = createFullTrail();
    const context = buildContext(trail);
    const verbose = getVerboseContext(trail, context);
    expect(verbose).toContain('#10');
    expect(verbose).toContain('#20');
  });

  it('should include all required metadata fields', () => {
    const trail = createFullTrail();
    const context = buildContext(trail);
    const verbose = getVerboseContext(trail, context);
    expect(verbose).toContain('Repository:');
    expect(verbose).toContain('Commit:');
    expect(verbose).toContain('PR:');
    expect(verbose).toContain('Issues:');
  });
});

// ---------------------------------------------------------------------------
// truncate() — tested indirectly via buildContext since the helper is private
// ---------------------------------------------------------------------------
describe('truncate helper (via buildContext)', () => {
  it('should not truncate text that is exactly at the limit', () => {
    // commit message limit is 500 chars — a 500-char message should appear unmodified
    const message = 'a'.repeat(500);
    const trail = createMinimalTrail({
      blame: {
        sha: 'abc123',
        commitMessage: message,
        diff: '',
        authorName: 'T',
        authorEmail: 't@t.com',
        authorDate: new Date(),
      },
    });
    const context = buildContext(trail);
    expect(context).toContain(message);
  });

  it('should truncate text that exceeds the limit with an ellipsis', () => {
    // commit message limit is 500 chars — 501 chars must be cut
    const message = 'b'.repeat(501);
    const trail = createMinimalTrail({
      blame: {
        sha: 'abc123',
        commitMessage: message,
        diff: '',
        authorName: 'T',
        authorEmail: 't@t.com',
        authorDate: new Date(),
      },
    });
    const context = buildContext(trail);
    expect(context).toContain('...');
    expect(context).not.toContain(message);
  });

  it('should handle an empty string without truncating', () => {
    const trail = createMinimalTrail({
      blame: {
        sha: 'abc123',
        commitMessage: '',
        diff: '',
        authorName: 'T',
        authorEmail: 't@t.com',
        authorDate: new Date(),
      },
    });
    const context = buildContext(trail);
    expect(context).toBeTruthy();
  });

  it('should truncate diff content at the 2000 char boundary', () => {
    const diff = '+' + 'x'.repeat(2001);
    const trail = createMinimalTrail({
      blame: {
        sha: 'abc123',
        commitMessage: 'test',
        diff,
        authorName: 'T',
        authorEmail: 't@t.com',
        authorDate: new Date(),
      },
    });
    const context = buildContext(trail);
    expect(context).toContain('...');
    expect(context).not.toContain(diff);
  });
});

// ---------------------------------------------------------------------------
// stripAutoGeneratedContent() — tested indirectly via buildContext
// ---------------------------------------------------------------------------
describe('stripAutoGeneratedContent (via buildContext PR body)', () => {
  function trailWithPrBody(body: string): DecisionTrail {
    return createMinimalTrail({
      pr: {
        number: 1,
        title: 'Test PR',
        body,
        labels: [],
        state: 'open',
        reviewComments: [],
        comments: [],
      },
    });
  }

  it('should strip HTML comments from PR body', () => {
    const trail = trailWithPrBody(
      '<!-- This is a template comment -->\nActual description here.'
    );
    const context = buildContext(trail);
    expect(context).toContain('Actual description here.');
    expect(context).not.toContain('This is a template comment');
  });

  it('should strip CodeRabbit summary block', () => {
    const trail = trailWithPrBody(
      '### Summary by CodeRabbit\n\nSome AI-generated text.\n\n## My real description\nImportant info.'
    );
    const context = buildContext(trail);
    expect(context).toContain('Important info.');
    expect(context).not.toContain('AI-generated text');
  });

  it('should strip Dependabot <details> blocks', () => {
    const trail = trailWithPrBody(
      'Bump lodash.\n<details><summary>Release notes</summary>\nLots of text.\n</details>\nEnd of body.'
    );
    const context = buildContext(trail);
    expect(context).toContain('Bump lodash.');
    expect(context).toContain('End of body.');
    expect(context).not.toContain('Release notes');
  });

  it('should strip the "## Changelog" heading line from PR body', () => {
    // The changelog regex strips the "## Changelog" heading itself. Content
    // items on lines after the heading are not removed by the current pattern
    // (which uses a lazy match that stops at end-of-line due to gm mode), but
    // the heading label itself is stripped.
    const trail = trailWithPrBody(
      'Fix critical bug.\n## Changelog\n- v1.0.1: fixed stuff\n\n## Overview\nShipped.'
    );
    const context = buildContext(trail);
    expect(context).toContain('Fix critical bug.');
    expect(context).toContain('Shipped.');
    // The "## Changelog" heading text itself is removed
    expect(context).not.toContain('## Changelog');
  });

  it('should preserve meaningful content when no auto-generated patterns are present', () => {
    const meaningful = 'This change fixes the authentication flow by removing the stale token check.';
    const trail = trailWithPrBody(meaningful);
    const context = buildContext(trail);
    expect(context).toContain(meaningful);
  });

  it('should handle a body that is entirely auto-generated without throwing', () => {
    const trail = trailWithPrBody('<!-- all auto-generated content -->');
    expect(() => buildContext(trail)).not.toThrow();
  });

  it('should strip auto-generated content from issue bodies too', () => {
    const trail = createMinimalTrail({
      issues: [
        {
          number: 5,
          title: 'Bug report',
          body: '<!-- template -->\nSteps to reproduce: ...',
          state: 'open',
          labels: [],
          comments: [],
        },
      ],
    });
    const context = buildContext(trail);
    expect(context).toContain('Steps to reproduce');
    expect(context).not.toContain('template');
  });
});

// ---------------------------------------------------------------------------
// Token budget enforcement in buildContext()
// ---------------------------------------------------------------------------
describe('buildContext token budget enforcement', () => {
  const originalMaxTokens = process.env.WDE_MAX_TOKENS;
  const originalCharsPerToken = process.env.WDE_CHARS_PER_TOKEN;

  afterEach(async () => {
    // Restore env vars and flush the config singleton
    if (originalMaxTokens === undefined) {
      delete process.env.WDE_MAX_TOKENS;
    } else {
      process.env.WDE_MAX_TOKENS = originalMaxTokens;
    }
    if (originalCharsPerToken === undefined) {
      delete process.env.WDE_CHARS_PER_TOKEN;
    } else {
      process.env.WDE_CHARS_PER_TOKEN = originalCharsPerToken;
    }
    const { reloadConfig } = await import('../src/configs');
    reloadConfig();
  });

  it('should truncate total output when it exceeds maxTokenBudget * charsPerToken', async () => {
    // Budget: 100 tokens * 1 char = 100 chars (minimum valid token budget)
    process.env.WDE_MAX_TOKENS = '100';
    process.env.WDE_CHARS_PER_TOKEN = '1';
    const { reloadConfig } = await import('../src/configs');
    reloadConfig(); // flush cached appInstance so loadAppConfig() re-reads env

    const trail = createMinimalTrail({
      blame: {
        sha: 'abc123',
        commitMessage: 'feat: a very important change with a long commit message that exceeds the budget',
        diff: '+lots of diff content here that is long enough to exceed the very small token budget we set',
        authorName: 'Author',
        authorEmail: 'a@example.com',
        authorDate: new Date(),
      },
    });

    const result = buildContext(trail);
    const budgetChars = 100 * 1; // 100
    const suffix = '\n\n... (context truncated to fit token budget)';
    expect(result.length).toBeLessThanOrEqual(budgetChars + suffix.length);
    expect(result).toContain('... (context truncated to fit token budget)');
  });

  it('should NOT truncate output that fits within the budget', async () => {
    process.env.WDE_MAX_TOKENS = '100000';
    process.env.WDE_CHARS_PER_TOKEN = '4';
    const { reloadConfig } = await import('../src/configs');
    reloadConfig();

    const trail = createMinimalTrail();
    const result = buildContext(trail);
    expect(result).not.toContain('context truncated to fit token budget');
  });
});

// ---------------------------------------------------------------------------
// Edge cases: missing or sparse fields
// ---------------------------------------------------------------------------
describe('buildContext edge cases', () => {
  it('should handle PR with empty body gracefully', () => {
    const trail = createMinimalTrail({
      pr: {
        number: 99,
        title: 'No description PR',
        body: '',
        labels: [],
        state: 'open',
        reviewComments: [],
        comments: [],
      },
    });
    const context = buildContext(trail);
    expect(context).toContain('PR #99');
    expect(context).toContain('No description PR');
    // Empty body means no "### PR Description" sub-section
    expect(context).not.toContain('### PR Description');
  });

  it('should handle PR with no labels without rendering a labels line', () => {
    const trail = createMinimalTrail({
      pr: {
        number: 7,
        title: 'Unlabeled PR',
        body: 'Some body.',
        labels: [],
        state: 'open',
        reviewComments: [],
        comments: [],
      },
    });
    const context = buildContext(trail);
    expect(context).not.toContain('**Labels**:');
  });

  it('should handle issues with no labels without rendering a labels line', () => {
    const trail = createMinimalTrail({
      issues: [
        {
          number: 3,
          title: 'Unlabeled issue',
          body: 'Some body.',
          state: 'open',
          labels: [],
          comments: [],
        },
      ],
    });
    const context = buildContext(trail);
    expect(context).toContain('Issue #3');
    expect(context).not.toContain('**Labels**:');
  });

  it('should cap review comments at 10 entries', () => {
    const manyComments = Array.from({ length: 15 }, (_, i) => ({
      id: i,
      body: `review comment ${i}`,
      user: `reviewer${i}`,
      path: 'file.ts',
      line: i + 1,
      createdAt: new Date(),
    }));
    const trail = createMinimalTrail({
      pr: {
        number: 1,
        title: 'PR with many review comments',
        body: '',
        labels: [],
        state: 'open',
        reviewComments: manyComments,
        comments: [],
      },
    });
    const context = buildContext(trail);
    expect(context).toContain('review comment 9');
    expect(context).not.toContain('review comment 10');
  });

  it('should cap PR discussion comments at 5 entries', () => {
    const manyComments = Array.from({ length: 8 }, (_, i) => ({
      id: i,
      body: `discussion comment ${i}`,
      user: `user${i}`,
      createdAt: new Date(),
      reactions: 0,
    }));
    const trail = createMinimalTrail({
      pr: {
        number: 1,
        title: 'PR with many comments',
        body: '',
        labels: [],
        state: 'open',
        reviewComments: [],
        comments: manyComments,
      },
    });
    const context = buildContext(trail);
    expect(context).toContain('discussion comment 4');
    expect(context).not.toContain('discussion comment 5');
  });

  it('should cap linked issues at 3 entries', () => {
    const manyIssues = Array.from({ length: 5 }, (_, i) => ({
      number: i + 1,
      title: `Issue ${i + 1}`,
      body: `Body of issue ${i + 1}`,
      state: 'open',
      labels: [],
      comments: [],
    }));
    const trail = createMinimalTrail({ issues: manyIssues });
    const context = buildContext(trail);
    expect(context).toContain('Issue #3');
    expect(context).not.toContain('Issue #4');
    expect(context).not.toContain('Issue #5');
  });

  it('should include issue body only when it is non-empty', () => {
    const trail = createMinimalTrail({
      issues: [
        {
          number: 1,
          title: 'Empty body issue',
          body: '',
          state: 'open',
          labels: [],
          comments: [],
        },
      ],
    });
    const context = buildContext(trail);
    expect(context).toContain('Issue #1');
    expect(context).not.toContain('**Description:**');
  });

  it('should cap issue comments at 3 per issue', () => {
    const manyIssueComments = Array.from({ length: 5 }, (_, i) => ({
      id: i,
      body: `issue comment ${i}`,
      user: `u${i}`,
      createdAt: new Date(),
      reactions: 0,
    }));
    const trail = createMinimalTrail({
      issues: [
        {
          number: 1,
          title: 'Issue',
          body: 'A body.',
          state: 'open',
          labels: [],
          comments: manyIssueComments,
        },
      ],
    });
    const context = buildContext(trail);
    expect(context).toContain('issue comment 2');
    expect(context).not.toContain('issue comment 3');
  });
});
