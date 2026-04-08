import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test';
import { extractIssueNumbers, fetchPR, fetchIssue, fetchIssues } from '../src/github';
import { GitHubError } from '../src/errors';

// ---------------------------------------------------------------------------
// extractIssueNumbers
// ---------------------------------------------------------------------------

describe('extractIssueNumbers', () => {
  describe('Fixes keyword variations', () => {
    it('should extract from "Fixes #123"', () => {
      expect(extractIssueNumbers('Fixes #123')).toContain(123);
    });

    it('should extract from "fixes #123" (lowercase)', () => {
      expect(extractIssueNumbers('fixes #123')).toContain(123);
    });

    it('should extract from "Fix #123"', () => {
      expect(extractIssueNumbers('Fix #123')).toContain(123);
    });

    it('should extract from "FIXES #123" (uppercase)', () => {
      expect(extractIssueNumbers('FIXES #123')).toContain(123);
    });
  });

  describe('Closes keyword variations', () => {
    it('should extract from "Closes #456"', () => {
      expect(extractIssueNumbers('Closes #456')).toContain(456);
    });

    it('should extract from "closes #456" (lowercase)', () => {
      expect(extractIssueNumbers('closes #456')).toContain(456);
    });

    it('should extract from "Close #456"', () => {
      expect(extractIssueNumbers('Close #456')).toContain(456);
    });

    it('should extract from "Closed #456"', () => {
      expect(extractIssueNumbers('Closed #456')).toContain(456);
    });
  });

  describe('Resolves keyword variations', () => {
    it('should extract from "Resolves #789"', () => {
      expect(extractIssueNumbers('Resolves #789')).toContain(789);
    });

    it('should extract from "resolves #789" (lowercase)', () => {
      expect(extractIssueNumbers('resolves #789')).toContain(789);
    });

    it('should extract from "Resolve #789"', () => {
      expect(extractIssueNumbers('Resolve #789')).toContain(789);
    });

    it('should extract from "Resolved #789"', () => {
      expect(extractIssueNumbers('Resolved #789')).toContain(789);
    });
  });

  describe('Related to keyword', () => {
    it('should extract from "Related to #42"', () => {
      expect(extractIssueNumbers('Related to #42')).toContain(42);
    });

    it('should extract from "related to #42" (lowercase)', () => {
      expect(extractIssueNumbers('related to #42')).toContain(42);
    });
  });

  describe('GitHub URL format', () => {
    it('should extract from full GitHub issue URL with Fixes', () => {
      expect(extractIssueNumbers('Fixes https://github.com/owner/repo/issues/999')).toContain(999);
    });

    it('should extract from full GitHub issue URL with Closes', () => {
      expect(extractIssueNumbers('Closes https://github.com/org/project/issues/888')).toContain(888);
    });

    it('should extract from full GitHub issue URL with Resolves', () => {
      expect(extractIssueNumbers('Resolves https://github.com/user/app/issues/777')).toContain(777);
    });
  });

  describe('multiple issues', () => {
    it('should extract multiple issue numbers', () => {
      const body = 'Fixes #100, Closes #200, and Resolves #300';
      const issues = extractIssueNumbers(body);
      expect(issues).toContain(100);
      expect(issues).toContain(200);
      expect(issues).toContain(300);
    });

    it('should extract multiple issues from different lines', () => {
      const body = 'Fixes #111\nCloses #222\nResolves #333';
      const issues = extractIssueNumbers(body);
      expect(issues).toContain(111);
      expect(issues).toContain(222);
      expect(issues).toContain(333);
    });

    it('should extract issues from bullet list', () => {
      const body = '- Fixes #10\n- Closes #20\n- Resolves #30';
      const issues = extractIssueNumbers(body);
      expect(issues).toContain(10);
      expect(issues).toContain(20);
      expect(issues).toContain(30);
    });
  });

  describe('standalone references', () => {
    it('should extract standalone issue reference', () => {
      expect(extractIssueNumbers('See #555 for context')).toContain(555);
    });

    it('should extract multiple standalone references', () => {
      const body = 'Related to #100 and #200';
      const issues = extractIssueNumbers(body);
      expect(issues).toContain(100);
      expect(issues).toContain(200);
    });
  });

  describe('edge cases', () => {
    it('should return empty array for text without issues', () => {
      expect(extractIssueNumbers('No issues here')).toHaveLength(0);
    });

    it('should return empty array for empty string', () => {
      expect(extractIssueNumbers('')).toHaveLength(0);
    });

    it('should not duplicate issue numbers', () => {
      const body = 'Fixes #123, also fixes #123, closes #123';
      const issues = extractIssueNumbers(body);
      const uniqueCount = new Set(issues).size;
      expect(issues.length).toBe(uniqueCount);
    });

    it('should filter out very high numbers (likely not issues)', () => {
      const body = 'Version 1000000 released';
      const issues = extractIssueNumbers(body);
      expect(issues).not.toContain(1000000);
    });

    it('should handle issue at start of text', () => {
      expect(extractIssueNumbers('#42 is the answer')).toContain(42);
    });

    it('should handle issue at end of text', () => {
      expect(extractIssueNumbers('The answer is #42')).toContain(42);
    });

    it('should handle newlines', () => {
      const body = 'Fixes\n#123';
      // This might not match depending on regex, but let's see
      const issues = extractIssueNumbers(body);
      expect(issues).toContain(123);
    });
  });

  describe('mixed content', () => {
    it('should extract from PR template with checkbox', () => {
      const body = '- [x] Fixes #100\n- [ ] TODO';
      expect(extractIssueNumbers(body)).toContain(100);
    });

    it('should extract from markdown formatted text', () => {
      const body = '**Fixes** #200 and _closes_ #300';
      const issues = extractIssueNumbers(body);
      expect(issues).toContain(200);
      expect(issues).toContain(300);
    });

    it('should extract from code block context', () => {
      const body = 'This PR resolves #400. See `#500` for the fix.';
      const issues = extractIssueNumbers(body);
      expect(issues).toContain(400);
      expect(issues).toContain(500);
    });
  });

  describe('realistic PR bodies', () => {
    it('should extract from a typical PR body', () => {
      const body = `## Summary
This PR adds a new feature.

## Issues
Fixes #1234
Closes #5678

## Testing
- Added unit tests
- Manual testing done`;
      const issues = extractIssueNumbers(body);
      expect(issues).toContain(1234);
      expect(issues).toContain(5678);
    });

    it('should extract from dependabot PR body', () => {
      const body = `Bumps [lodash](https://github.com/lodash/lodash) from 4.17.19 to 4.17.21.

Fixes #security-123`;
      // This won't match "security-123" as it's not a number
      const issues = extractIssueNumbers(body);
      // Just make sure it doesn't crash
      expect(Array.isArray(issues)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Shared fetch-mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal Response-like object that matches what github.ts reads.
 * All header fields that handleResponse accesses are provided.
 */
function makeResponse(
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {}
): Response {
  const headers = new Headers({
    'content-type': 'application/json',
    'X-RateLimit-Remaining': '60',
    'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600),
    ...extraHeaders,
  });

  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function makePRPayload(overrides: Record<string, unknown> = {}) {
  return {
    number: 42,
    title: 'feat: add new thing',
    body: 'This PR fixes #10',
    labels: [{ name: 'enhancement' }],
    state: 'merged',
    ...overrides,
  };
}

function makeIssuePayload(number: number, overrides: Record<string, unknown> = {}) {
  return {
    number,
    title: `Issue ${number}`,
    body: 'An issue body',
    state: 'open',
    labels: [{ name: 'bug' }],
    ...overrides,
  };
}

function makeComments(logins: string[]) {
  return logins.map((login, i) => ({
    id: i + 1,
    body: `Comment from ${login}`,
    user: { login },
    created_at: '2024-01-15T10:00:00Z',
    reactions: { total_count: i },
  }));
}

function makeReviewComments(logins: string[]) {
  return logins.map((login, i) => ({
    id: i + 1,
    body: `Review by ${login}`,
    user: { login },
    path: 'src/file.ts',
    line: i + 1,
    created_at: '2024-01-15T10:00:00Z',
  }));
}

// ---------------------------------------------------------------------------
// fetchPR
// ---------------------------------------------------------------------------

describe('fetchPR', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // No GitHub token by default; tests that need one set it explicitly.
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it('should return a PRContext on a successful fetch', async () => {
    const prPayload = makePRPayload();
    const reviewComments = makeReviewComments(['alice', 'bob']);
    const prComments = makeComments(['carol']);

    let callIndex = 0;
    const responses = [
      makeResponse(200, prPayload),
      makeResponse(200, reviewComments),
      makeResponse(200, prComments),
    ];

    globalThis.fetch = mock(async () => responses[callIndex++]);

    const result = await fetchPR('acme', 'my-project', 42);

    expect(result).not.toBeNull();
    expect(result!.number).toBe(42);
    expect(result!.title).toBe('feat: add new thing');
    expect(result!.body).toBe('This PR fixes #10');
    expect(result!.labels).toContain('enhancement');
    expect(result!.state).toBe('merged');
  });

  it('should populate reviewComments from the review comments endpoint', async () => {
    const prPayload = makePRPayload();
    const reviewComments = makeReviewComments(['alice', 'bob']);
    const prComments: unknown[] = [];

    let callIndex = 0;
    const responses = [
      makeResponse(200, prPayload),
      makeResponse(200, reviewComments),
      makeResponse(200, prComments),
    ];

    globalThis.fetch = mock(async () => responses[callIndex++]);

    const result = await fetchPR('acme', 'my-project', 42);

    expect(result).not.toBeNull();
    expect(result!.reviewComments).toHaveLength(2);
    expect(result!.reviewComments[0].user).toBe('alice');
    expect(result!.reviewComments[0].path).toBe('src/file.ts');
    expect(result!.reviewComments[0].createdAt).toBeInstanceOf(Date);
  });

  it('should filter bot users out of review comments', async () => {
    const prPayload = makePRPayload();
    const reviewComments = makeReviewComments(['alice', 'renovate[bot]', 'bob']);
    const prComments: unknown[] = [];

    let callIndex = 0;
    const responses = [
      makeResponse(200, prPayload),
      makeResponse(200, reviewComments),
      makeResponse(200, prComments),
    ];

    globalThis.fetch = mock(async () => responses[callIndex++]);

    const result = await fetchPR('acme', 'my-project', 42);

    expect(result).not.toBeNull();
    const usernames = result!.reviewComments.map(c => c.user);
    expect(usernames).toContain('alice');
    expect(usernames).toContain('bob');
    expect(usernames).not.toContain('renovate[bot]');
  });

  it('should sort PR comments by reaction count descending', async () => {
    const prPayload = makePRPayload();
    const reviewComments: unknown[] = [];
    const prComments = [
      { id: 1, body: 'Low engagement', user: { login: 'user1' }, created_at: '2024-01-01T00:00:00Z', reactions: { total_count: 1 } },
      { id: 2, body: 'High engagement', user: { login: 'user2' }, created_at: '2024-01-01T00:00:00Z', reactions: { total_count: 50 } },
      { id: 3, body: 'Medium', user: { login: 'user3' }, created_at: '2024-01-01T00:00:00Z', reactions: { total_count: 5 } },
    ];

    let callIndex = 0;
    const responses = [
      makeResponse(200, prPayload),
      makeResponse(200, reviewComments),
      makeResponse(200, prComments),
    ];

    globalThis.fetch = mock(async () => responses[callIndex++]);

    const result = await fetchPR('acme', 'my-project', 42);

    expect(result).not.toBeNull();
    expect(result!.comments[0].reactions).toBe(50);
    expect(result!.comments[0].body).toBe('High engagement');
  });

  it('should filter bot comments from PR comments', async () => {
    const prPayload = makePRPayload();
    const reviewComments: unknown[] = [];
    const prComments = [
      { id: 1, body: 'Codecov report', user: { login: 'codecov[bot]' }, created_at: '2024-01-01T00:00:00Z', reactions: { total_count: 0 } },
      { id: 2, body: 'Human comment', user: { login: 'developer' }, created_at: '2024-01-01T00:00:00Z', reactions: { total_count: 2 } },
      { id: 3, body: 'Dependabot note', user: { login: 'dependabot[bot]' }, created_at: '2024-01-01T00:00:00Z', reactions: { total_count: 0 } },
    ];

    let callIndex = 0;
    const responses = [
      makeResponse(200, prPayload),
      makeResponse(200, reviewComments),
      makeResponse(200, prComments),
    ];

    globalThis.fetch = mock(async () => responses[callIndex++]);

    const result = await fetchPR('acme', 'my-project', 42);

    expect(result).not.toBeNull();
    const users = result!.comments.map(c => c.user);
    expect(users).toContain('developer');
    expect(users).not.toContain('codecov[bot]');
    expect(users).not.toContain('dependabot[bot]');
  });

  it('should return null for a 404 response', async () => {
    let callIndex = 0;
    globalThis.fetch = mock(async () => {
      callIndex++;
      return makeResponse(404, { message: 'Not Found' });
    });

    const result = await fetchPR('acme', 'my-project', 99999);
    expect(result).toBeNull();
  });

  it('should throw GitHubError on a 401 response', async () => {
    globalThis.fetch = mock(async () => makeResponse(401, { message: 'Bad credentials' }));

    await expect(fetchPR('acme', 'my-project', 1)).rejects.toBeInstanceOf(GitHubError);
  });

  it('should throw GitHubError with statusCode 401 on bad credentials', async () => {
    globalThis.fetch = mock(async () => makeResponse(401, { message: 'Bad credentials' }));

    await expect(fetchPR('acme', 'my-project', 1)).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('should include "authentication failed" in the 401 error message', async () => {
    globalThis.fetch = mock(async () => makeResponse(401, { message: 'Bad credentials' }));

    let error: GitHubError | null = null;
    try {
      await fetchPR('acme', 'my-project', 1);
    } catch (e) {
      if (e instanceof GitHubError) error = e;
    }

    expect(error).not.toBeNull();
    expect(error!.message.toLowerCase()).toContain('authentication failed');
  });

  it('should throw GitHubError with rateLimitRemaining of 0 on 403 rate-limited response', async () => {
    globalThis.fetch = mock(async () =>
      makeResponse(403, { message: 'rate limit exceeded' }, {
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600),
      })
    );

    await expect(fetchPR('acme', 'my-project', 1)).rejects.toMatchObject({
      statusCode: 403,
      rateLimitRemaining: 0,
    });
  });

  it('should suggest running wde auth in rate-limit error when no token is set', async () => {
    delete process.env.GITHUB_TOKEN;

    globalThis.fetch = mock(async () =>
      makeResponse(403, { message: 'rate limit exceeded' }, {
        'X-RateLimit-Remaining': '0',
      })
    );

    let caughtError: GitHubError | null = null;
    try {
      await fetchPR('acme', 'my-project', 1);
    } catch (e) {
      if (e instanceof GitHubError) caughtError = e;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError!.message).toContain('wde auth');
  });

  it('should coerce a null PR body to an empty string', async () => {
    const prPayload = makePRPayload({ body: null });
    let callIndex = 0;
    const responses = [
      makeResponse(200, prPayload),
      makeResponse(200, []),
      makeResponse(200, []),
    ];

    globalThis.fetch = mock(async () => responses[callIndex++]);

    const result = await fetchPR('acme', 'my-project', 42);
    expect(result).not.toBeNull();
    expect(result!.body).toBe('');
  });

  it('should throw GitHubError for 500 server errors and include the status code', async () => {
    globalThis.fetch = mock(async () => makeResponse(500, 'Internal Server Error'));

    await expect(fetchPR('acme', 'my-project', 1)).rejects.toMatchObject({
      message: expect.stringContaining('500'),
    });
  });

  it('should handle a PR with no review comments and no comments', async () => {
    const prPayload = makePRPayload();
    let callIndex = 0;
    const responses = [
      makeResponse(200, prPayload),
      makeResponse(200, []),
      makeResponse(200, []),
    ];

    globalThis.fetch = mock(async () => responses[callIndex++]);

    const result = await fetchPR('acme', 'my-project', 42);

    expect(result).not.toBeNull();
    expect(result!.reviewComments).toHaveLength(0);
    expect(result!.comments).toHaveLength(0);
  });

  it('should preserve line numbers on review comments', async () => {
    const prPayload = makePRPayload();
    const reviewComments = [
      { id: 1, body: 'Fix this', user: { login: 'reviewer' }, path: 'src/main.ts', line: 42, created_at: '2024-01-15T10:00:00Z' },
      { id: 2, body: 'Here too', user: { login: 'reviewer' }, path: 'src/other.ts', line: null, created_at: '2024-01-15T11:00:00Z' },
    ];

    let callIndex = 0;
    const responses = [
      makeResponse(200, prPayload),
      makeResponse(200, reviewComments),
      makeResponse(200, []),
    ];

    globalThis.fetch = mock(async () => responses[callIndex++]);

    const result = await fetchPR('acme', 'my-project', 42);

    expect(result).not.toBeNull();
    expect(result!.reviewComments[0].line).toBe(42);
    expect(result!.reviewComments[1].line).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fetchIssue
// ---------------------------------------------------------------------------

describe('fetchIssue', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it('should return an IssueContext on success', async () => {
    const issuePayload = makeIssuePayload(10);
    const comments = makeComments(['alice', 'bob']);

    let callIndex = 0;
    const responses = [
      makeResponse(200, issuePayload),
      makeResponse(200, comments),
    ];

    globalThis.fetch = mock(async () => responses[callIndex++]);

    const result = await fetchIssue('acme', 'my-project', 10);

    expect(result).not.toBeNull();
    expect(result!.number).toBe(10);
    expect(result!.title).toBe('Issue 10');
    expect(result!.state).toBe('open');
    expect(result!.labels).toContain('bug');
  });

  it('should include comments with correct shape', async () => {
    const issuePayload = makeIssuePayload(10);
    const comments = makeComments(['alice']);

    let callIndex = 0;
    const responses = [
      makeResponse(200, issuePayload),
      makeResponse(200, comments),
    ];

    globalThis.fetch = mock(async () => responses[callIndex++]);

    const result = await fetchIssue('acme', 'my-project', 10);

    expect(result).not.toBeNull();
    expect(result!.comments[0]).toHaveProperty('id');
    expect(result!.comments[0]).toHaveProperty('body');
    expect(result!.comments[0]).toHaveProperty('user');
    expect(result!.comments[0]).toHaveProperty('createdAt');
    expect(result!.comments[0]).toHaveProperty('reactions');
    expect(result!.comments[0].createdAt).toBeInstanceOf(Date);
  });

  it('should return null when the issue is actually a pull request', async () => {
    const issuePayload = { ...makeIssuePayload(5), pull_request: { url: 'https://...' } };

    let callIndex = 0;
    const responses = [
      makeResponse(200, issuePayload),
      makeResponse(200, []),
    ];

    globalThis.fetch = mock(async () => responses[callIndex++]);

    const result = await fetchIssue('acme', 'my-project', 5);
    expect(result).toBeNull();
  });

  it('should return null on 404', async () => {
    globalThis.fetch = mock(async () => makeResponse(404, { message: 'Not Found' }));

    const result = await fetchIssue('acme', 'my-project', 9999);
    expect(result).toBeNull();
  });

  it('should coerce a null issue body to an empty string', async () => {
    const issuePayload = makeIssuePayload(7, { body: null });
    let callIndex = 0;
    const responses = [
      makeResponse(200, issuePayload),
      makeResponse(200, []),
    ];

    globalThis.fetch = mock(async () => responses[callIndex++]);

    const result = await fetchIssue('acme', 'my-project', 7);
    expect(result).not.toBeNull();
    expect(result!.body).toBe('');
  });

  it('should filter bot comments from issue', async () => {
    const issuePayload = makeIssuePayload(11);
    const comments = [
      { id: 1, body: 'snyk found an issue', user: { login: 'snyk-bot' }, created_at: '2024-01-01T00:00:00Z', reactions: { total_count: 0 } },
      { id: 2, body: 'Human insight', user: { login: 'developer' }, created_at: '2024-01-01T00:00:00Z', reactions: { total_count: 3 } },
    ];

    let callIndex = 0;
    const responses = [
      makeResponse(200, issuePayload),
      makeResponse(200, comments),
    ];

    globalThis.fetch = mock(async () => responses[callIndex++]);

    const result = await fetchIssue('acme', 'my-project', 11);
    expect(result).not.toBeNull();
    const users = result!.comments.map(c => c.user);
    expect(users).toContain('developer');
    expect(users).not.toContain('snyk-bot');
  });

  it('should sort issue comments by reaction count descending', async () => {
    const issuePayload = makeIssuePayload(12);
    const comments = [
      { id: 1, body: 'Rarely liked', user: { login: 'user1' }, created_at: '2024-01-01T00:00:00Z', reactions: { total_count: 1 } },
      { id: 2, body: 'Very popular', user: { login: 'user2' }, created_at: '2024-01-01T00:00:00Z', reactions: { total_count: 99 } },
    ];

    let callIndex = 0;
    const responses = [
      makeResponse(200, issuePayload),
      makeResponse(200, comments),
    ];

    globalThis.fetch = mock(async () => responses[callIndex++]);

    const result = await fetchIssue('acme', 'my-project', 12);
    expect(result).not.toBeNull();
    expect(result!.comments[0].reactions).toBe(99);
    expect(result!.comments[0].body).toBe('Very popular');
  });

  it('should throw GitHubError on 401', async () => {
    globalThis.fetch = mock(async () => makeResponse(401, { message: 'Unauthorized' }));

    await expect(fetchIssue('acme', 'my-project', 1)).rejects.toBeInstanceOf(GitHubError);
  });

  it('should return an empty comments array when there are no comments', async () => {
    const issuePayload = makeIssuePayload(20);
    let callIndex = 0;
    const responses = [
      makeResponse(200, issuePayload),
      makeResponse(200, []),
    ];

    globalThis.fetch = mock(async () => responses[callIndex++]);

    const result = await fetchIssue('acme', 'my-project', 20);
    expect(result).not.toBeNull();
    expect(result!.comments).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// fetchIssues (batching)
//
// fetchIssues calls fetchIssue for each number concurrently within a batch.
// Each fetchIssue call makes two sequential fetch() calls:
//   1. GET /repos/{owner}/{repo}/issues/{n}
//   2. GET /repos/{owner}/{repo}/issues/{n}/comments?...
//
// To avoid index-ordering issues under concurrent Promise.all execution we
// use a URL-dispatch map rather than a sequential response array.
// ---------------------------------------------------------------------------

/**
 * Build a fetch mock that dispatches responses based on URL substrings.
 * Each entry is checked in order; the first matching entry is used.
 * Entries that provide an array of responses cycle through them on repeat calls.
 */
function makeUrlDispatchMock(
  routes: Array<{ match: string; responses: Response[] }>
): typeof fetch {
  const counters = routes.map(() => 0);

  return mock(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    for (let i = 0; i < routes.length; i++) {
      if (url.includes(routes[i].match)) {
        const idx = counters[i]++ % routes[i].responses.length;
        return routes[i].responses[idx];
      }
    }
    throw new Error(`Unmatched fetch URL in test: ${url}`);
  }) as unknown as typeof fetch;
}

describe('fetchIssues', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it('should return an empty array when given no issue numbers', async () => {
    // fetch is never called for an empty list
    globalThis.fetch = mock(async () => { throw new Error('fetch should not be called'); }) as unknown as typeof fetch;

    const results = await fetchIssues('acme', 'my-project', []);
    expect(results).toHaveLength(0);
  });

  it('should fetch and return all requested issues', async () => {
    globalThis.fetch = makeUrlDispatchMock([
      { match: '/issues/1/comments', responses: [makeResponse(200, [])] },
      { match: '/issues/2/comments', responses: [makeResponse(200, [])] },
      { match: '/issues/1', responses: [makeResponse(200, makeIssuePayload(1))] },
      { match: '/issues/2', responses: [makeResponse(200, makeIssuePayload(2))] },
    ]);

    const results = await fetchIssues('acme', 'my-project', [1, 2]);
    expect(results).toHaveLength(2);
    expect(results.map(i => i.number)).toContain(1);
    expect(results.map(i => i.number)).toContain(2);
  });

  it('should skip issues that return null (404)', async () => {
    globalThis.fetch = makeUrlDispatchMock([
      { match: '/issues/1/comments', responses: [makeResponse(200, [])] },
      { match: '/issues/1', responses: [makeResponse(200, makeIssuePayload(1))] },
      { match: '/issues/2', responses: [makeResponse(404, { message: 'Not Found' })] },
    ]);

    const results = await fetchIssues('acme', 'my-project', [1, 2]);
    expect(results).toHaveLength(1);
    expect(results[0].number).toBe(1);
  });

  it('should skip issues that are actually pull requests', async () => {
    const prPayload = { ...makeIssuePayload(3), pull_request: { url: 'https://...' } };

    globalThis.fetch = makeUrlDispatchMock([
      { match: '/issues/1/comments', responses: [makeResponse(200, [])] },
      { match: '/issues/3/comments', responses: [makeResponse(200, [])] },
      { match: '/issues/1', responses: [makeResponse(200, makeIssuePayload(1))] },
      { match: '/issues/3', responses: [makeResponse(200, prPayload)] },
    ]);

    const results = await fetchIssues('acme', 'my-project', [1, 3]);
    expect(results).toHaveLength(1);
    expect(results[0].number).toBe(1);
  });

  it('should process multiple issues and return all that resolve', async () => {
    // WDE_GITHUB_BATCH_SIZE defaults to 5, so all 4 issues are in one batch
    globalThis.fetch = makeUrlDispatchMock([
      { match: '/issues/1/comments', responses: [makeResponse(200, [])] },
      { match: '/issues/2/comments', responses: [makeResponse(200, [])] },
      { match: '/issues/3/comments', responses: [makeResponse(200, [])] },
      { match: '/issues/4/comments', responses: [makeResponse(200, [])] },
      { match: '/issues/1', responses: [makeResponse(200, makeIssuePayload(1))] },
      { match: '/issues/2', responses: [makeResponse(200, makeIssuePayload(2))] },
      { match: '/issues/3', responses: [makeResponse(200, makeIssuePayload(3))] },
      { match: '/issues/4', responses: [makeResponse(200, makeIssuePayload(4))] },
    ]);

    const results = await fetchIssues('acme', 'my-project', [1, 2, 3, 4]);
    expect(results).toHaveLength(4);
    expect(results.map(i => i.number).sort()).toEqual([1, 2, 3, 4]);
  });

  it('should process issues across multiple batches when batch size is small', async () => {
    // Force batch size to 2: issues [1,2] are first batch, [3,4] are second batch
    process.env.WDE_GITHUB_BATCH_SIZE = '2';
    // Reload config singleton to pick up new env var
    const { reloadConfig } = await import('../src/configs');
    reloadConfig();

    try {
      globalThis.fetch = makeUrlDispatchMock([
        { match: '/issues/1/comments', responses: [makeResponse(200, [])] },
        { match: '/issues/2/comments', responses: [makeResponse(200, [])] },
        { match: '/issues/3/comments', responses: [makeResponse(200, [])] },
        { match: '/issues/4/comments', responses: [makeResponse(200, [])] },
        { match: '/issues/1', responses: [makeResponse(200, makeIssuePayload(1))] },
        { match: '/issues/2', responses: [makeResponse(200, makeIssuePayload(2))] },
        { match: '/issues/3', responses: [makeResponse(200, makeIssuePayload(3))] },
        { match: '/issues/4', responses: [makeResponse(200, makeIssuePayload(4))] },
      ]);

      const results = await fetchIssues('acme', 'my-project', [1, 2, 3, 4]);
      expect(results).toHaveLength(4);
      expect(results.map(i => i.number).sort()).toEqual([1, 2, 3, 4]);
    } finally {
      delete process.env.WDE_GITHUB_BATCH_SIZE;
      reloadConfig();
    }
  });

  it('should return results for a single issue number', async () => {
    globalThis.fetch = makeUrlDispatchMock([
      { match: '/issues/99/comments', responses: [makeResponse(200, [])] },
      { match: '/issues/99', responses: [makeResponse(200, makeIssuePayload(99))] },
    ]);

    const results = await fetchIssues('acme', 'my-project', [99]);
    expect(results).toHaveLength(1);
    expect(results[0].number).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// Bot-detection edge cases
// ---------------------------------------------------------------------------

describe('bot comment filtering', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const botLogins = [
    'dependabot[bot]',
    'renovate[bot]',
    'github-actions[bot]',
    'codecov[bot]',
    'sonarcloud[bot]',
    'snyk-bot',
  ];

  for (const botLogin of botLogins) {
    it(`should filter out "${botLogin}" from both review and PR comments`, async () => {
      const prPayload = makePRPayload();
      const reviewComments = makeReviewComments([botLogin, 'human-dev']);
      const prComments = makeComments([botLogin, 'human-dev']);

      let callIndex = 0;
      const responses = [
        makeResponse(200, prPayload),
        makeResponse(200, reviewComments),
        makeResponse(200, prComments),
      ];

      globalThis.fetch = mock(async () => responses[callIndex++]);

      const result = await fetchPR('acme', 'my-project', 42);
      expect(result).not.toBeNull();

      const reviewUsers = result!.reviewComments.map(c => c.user);
      const commentUsers = result!.comments.map(c => c.user);

      expect(reviewUsers).not.toContain(botLogin);
      expect(commentUsers).not.toContain(botLogin);
      expect(reviewUsers).toContain('human-dev');
      expect(commentUsers).toContain('human-dev');
    });
  }

  it('should keep comments from users whose names resemble bots but are not', async () => {
    // "robot-dave" is not a bot (no [bot] suffix, not a known pattern)
    const prPayload = makePRPayload();
    const reviewComments = makeReviewComments(['robot-dave']);
    const prComments: unknown[] = [];

    let callIndex = 0;
    const responses = [
      makeResponse(200, prPayload),
      makeResponse(200, reviewComments),
      makeResponse(200, prComments),
    ];

    globalThis.fetch = mock(async () => responses[callIndex++]);

    const result = await fetchPR('acme', 'my-project', 42);
    expect(result).not.toBeNull();

    const reviewUsers = result!.reviewComments.map(c => c.user);
    expect(reviewUsers).toContain('robot-dave');
  });

  it('should handle comments with null user gracefully', async () => {
    const prPayload = makePRPayload();
    const reviewComments = [
      { id: 1, body: 'Anonymous comment', user: null, path: 'src/file.ts', line: 1, created_at: '2024-01-15T10:00:00Z' },
    ];
    const prComments: unknown[] = [];

    let callIndex = 0;
    const responses = [
      makeResponse(200, prPayload),
      makeResponse(200, reviewComments),
      makeResponse(200, prComments),
    ];

    globalThis.fetch = mock(async () => responses[callIndex++]);

    const result = await fetchPR('acme', 'my-project', 42);
    expect(result).not.toBeNull();
    // null user should be coerced to 'unknown' and not crash
    if (result!.reviewComments.length > 0) {
      expect(result!.reviewComments[0].user).toBe('unknown');
    }
  });
});

// ---------------------------------------------------------------------------
// Rate limit detection
// ---------------------------------------------------------------------------

describe('rate limit detection', () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it('should include rateLimitRemaining of 0 on the thrown GitHubError', async () => {
    globalThis.fetch = mock(async () =>
      makeResponse(403, { message: 'rate limit exceeded' }, {
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 3600),
      })
    );

    let error: GitHubError | null = null;
    try {
      await fetchPR('acme', 'repo', 1);
    } catch (e) {
      if (e instanceof GitHubError) error = e;
    }

    expect(error).not.toBeNull();
    expect(error!.rateLimitRemaining).toBe(0);
    expect(error!.rateLimitReset).toBeInstanceOf(Date);
  });

  it('should not treat 403 as a rate limit when remaining is greater than 0', async () => {
    globalThis.fetch = mock(async () =>
      makeResponse(403, { message: 'forbidden' }, {
        'X-RateLimit-Remaining': '5',
      })
    );

    let error: GitHubError | null = null;
    try {
      await fetchPR('acme', 'repo', 1);
    } catch (e) {
      if (e instanceof GitHubError) error = e;
    }

    expect(error).not.toBeNull();
    expect(error!.message).not.toContain('rate limit');
  });

  it('should include the reset time string in the rate-limit error message', async () => {
    const resetTimestamp = Math.floor(Date.now() / 1000) + 7200;
    globalThis.fetch = mock(async () =>
      makeResponse(403, { message: 'rate limit exceeded' }, {
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(resetTimestamp),
      })
    );

    let error: GitHubError | null = null;
    try {
      await fetchPR('acme', 'repo', 1);
    } catch (e) {
      if (e instanceof GitHubError) error = e;
    }

    expect(error).not.toBeNull();
    expect(error!.message).toContain('Resets at');
  });

  it('should set the rateLimitReset Date to the correct timestamp', async () => {
    const resetTimestamp = Math.floor(Date.now() / 1000) + 3600;
    globalThis.fetch = mock(async () =>
      makeResponse(403, { message: 'rate limit exceeded' }, {
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(resetTimestamp),
      })
    );

    let error: GitHubError | null = null;
    try {
      await fetchPR('acme', 'repo', 1);
    } catch (e) {
      if (e instanceof GitHubError) error = e;
    }

    expect(error).not.toBeNull();
    expect(error!.rateLimitReset).toBeInstanceOf(Date);
    // Allow 1 second of tolerance for the timestamp conversion
    expect(Math.abs(error!.rateLimitReset!.getTime() - resetTimestamp * 1000)).toBeLessThan(1000);
  });

  it('should throw GitHubError (not a plain Error) for rate limit', async () => {
    globalThis.fetch = mock(async () =>
      makeResponse(403, { message: 'rate limit exceeded' }, {
        'X-RateLimit-Remaining': '0',
      })
    );

    await expect(fetchPR('acme', 'repo', 1)).rejects.toBeInstanceOf(GitHubError);
  });
});
