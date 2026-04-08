import { describe, expect, it } from 'bun:test';
import type {
  BlameResult,
  PRContext,
  ReviewComment,
  Comment,
  IssueContext,
  DecisionTrail,
  ExplainResult,
  WdeOptions,
  RepoInfo,
} from '../src/types';

describe('Types', () => {
  it('BlameResult should have required fields', () => {
    const blame: BlameResult = {
      sha: 'abc123',
      commitMessage: 'fix: something',
      diff: '+ added line',
      authorName: 'Test User',
      authorEmail: 'test@example.com',
      authorDate: new Date(),
    };

    expect(blame.sha).toBe('abc123');
    expect(blame.commitMessage).toBe('fix: something');
  });

  it('PRContext should accept null review comments', () => {
    const pr: PRContext = {
      number: 123,
      title: 'Test PR',
      body: 'Description',
      labels: ['bug'],
      state: 'merged',
      reviewComments: [],
      comments: [],
    };

    expect(pr.number).toBe(123);
    expect(pr.reviewComments).toHaveLength(0);
  });

  it('WdeOptions should have defaults', () => {
    const options: WdeOptions = {
      file: 'src/test.ts',
      line: 42,
      json: false,
      verbose: false,
      model: 'claude-sonnet-4-20250514',
    };

    expect(options.file).toBe('src/test.ts');
    expect(options.json).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BlameResult - additional coverage
// ---------------------------------------------------------------------------
describe('BlameResult', () => {
  it('should accept any string sha', () => {
    const blame: BlameResult = {
      sha: 'deadbeef1234567890abcdef',
      commitMessage: 'chore: update deps',
      diff: '',
      authorName: 'Alice',
      authorEmail: 'alice@example.com',
      authorDate: new Date('2024-01-01'),
    };
    expect(blame.sha).toBe('deadbeef1234567890abcdef');
  });

  it('should accept a Date object for authorDate', () => {
    const date = new Date('2023-06-15T10:00:00Z');
    const blame: BlameResult = {
      sha: 'a1b2c3',
      commitMessage: 'feat: new feature',
      diff: '- removed\n+ added',
      authorName: 'Bob',
      authorEmail: 'bob@example.com',
      authorDate: date,
    };
    expect(blame.authorDate).toBe(date);
    expect(blame.authorDate instanceof Date).toBe(true);
  });

  it('should accept an empty diff string', () => {
    const blame: BlameResult = {
      sha: '000000',
      commitMessage: 'Initial commit',
      diff: '',
      authorName: 'Init',
      authorEmail: 'init@example.com',
      authorDate: new Date(),
    };
    expect(blame.diff).toBe('');
  });

  it('should store authorEmail correctly', () => {
    const blame: BlameResult = {
      sha: 'xyz',
      commitMessage: 'msg',
      diff: '',
      authorName: 'Dev',
      authorEmail: 'dev@company.org',
      authorDate: new Date(),
    };
    expect(blame.authorEmail).toBe('dev@company.org');
  });
});

// ---------------------------------------------------------------------------
// ReviewComment
// ---------------------------------------------------------------------------
describe('ReviewComment', () => {
  it('should accept a non-null line number', () => {
    const comment: ReviewComment = {
      id: 1,
      body: 'Looks good',
      user: 'reviewer',
      path: 'src/foo.ts',
      line: 42,
      createdAt: new Date(),
    };
    expect(comment.line).toBe(42);
  });

  it('should accept null for line', () => {
    const comment: ReviewComment = {
      id: 2,
      body: 'General comment',
      user: 'reviewer',
      path: 'src/bar.ts',
      line: null,
      createdAt: new Date(),
    };
    expect(comment.line).toBeNull();
  });

  it('should store all required fields', () => {
    const now = new Date();
    const comment: ReviewComment = {
      id: 99,
      body: 'Please fix this',
      user: 'alice',
      path: 'README.md',
      line: 10,
      createdAt: now,
    };
    expect(comment.id).toBe(99);
    expect(comment.body).toBe('Please fix this');
    expect(comment.user).toBe('alice');
    expect(comment.path).toBe('README.md');
    expect(comment.createdAt).toBe(now);
  });
});

// ---------------------------------------------------------------------------
// Comment
// ---------------------------------------------------------------------------
describe('Comment', () => {
  it('should store all required fields', () => {
    const now = new Date();
    const comment: Comment = {
      id: 7,
      body: 'Great work!',
      user: 'bob',
      createdAt: now,
      reactions: 5,
    };
    expect(comment.id).toBe(7);
    expect(comment.body).toBe('Great work!');
    expect(comment.user).toBe('bob');
    expect(comment.createdAt).toBe(now);
    expect(comment.reactions).toBe(5);
  });

  it('should accept zero reactions', () => {
    const comment: Comment = {
      id: 1,
      body: 'No reactions',
      user: 'anon',
      createdAt: new Date(),
      reactions: 0,
    };
    expect(comment.reactions).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PRContext - additional coverage
// ---------------------------------------------------------------------------
describe('PRContext (additional)', () => {
  it('should accept a non-empty labels array', () => {
    const pr: PRContext = {
      number: 1,
      title: 'feat: add thing',
      body: '',
      labels: ['enhancement', 'approved'],
      state: 'open',
      reviewComments: [],
      comments: [],
    };
    expect(pr.labels).toContain('enhancement');
    expect(pr.labels).toContain('approved');
  });

  it('should store multiple review comments', () => {
    const rc: ReviewComment = {
      id: 1,
      body: 'nit',
      user: 'alice',
      path: 'src/a.ts',
      line: 5,
      createdAt: new Date(),
    };
    const pr: PRContext = {
      number: 42,
      title: 'refactor',
      body: 'description',
      labels: [],
      state: 'closed',
      reviewComments: [rc],
      comments: [],
    };
    expect(pr.reviewComments).toHaveLength(1);
    expect(pr.reviewComments[0].id).toBe(1);
  });

  it('should accept any string for state', () => {
    const states = ['open', 'closed', 'merged', 'draft'];
    states.forEach(state => {
      const pr: PRContext = {
        number: 1,
        title: 't',
        body: '',
        labels: [],
        state,
        reviewComments: [],
        comments: [],
      };
      expect(pr.state).toBe(state);
    });
  });
});

// ---------------------------------------------------------------------------
// IssueContext
// ---------------------------------------------------------------------------
describe('IssueContext', () => {
  it('should store all required fields', () => {
    const issue: IssueContext = {
      number: 7,
      title: 'Bug: something broken',
      body: 'Steps to reproduce...',
      state: 'open',
      labels: ['bug', 'high-priority'],
      comments: [],
    };
    expect(issue.number).toBe(7);
    expect(issue.title).toBe('Bug: something broken');
    expect(issue.state).toBe('open');
    expect(issue.labels).toHaveLength(2);
  });

  it('should accept an empty comments array', () => {
    const issue: IssueContext = {
      number: 1,
      title: 'No comments',
      body: '',
      state: 'closed',
      labels: [],
      comments: [],
    };
    expect(issue.comments).toHaveLength(0);
  });

  it('should accept populated comments', () => {
    const c: Comment = {
      id: 1,
      body: 'Fixed in #42',
      user: 'maintainer',
      createdAt: new Date(),
      reactions: 1,
    };
    const issue: IssueContext = {
      number: 3,
      title: 'Some issue',
      body: 'details',
      state: 'closed',
      labels: ['wontfix'],
      comments: [c],
    };
    expect(issue.comments[0].body).toBe('Fixed in #42');
  });
});

// ---------------------------------------------------------------------------
// DecisionTrail
// ---------------------------------------------------------------------------
describe('DecisionTrail', () => {
  const blameFixture: BlameResult = {
    sha: 'cafe1234',
    commitMessage: 'fix: edge case',
    diff: '+fixed',
    authorName: 'Dev',
    authorEmail: 'dev@example.com',
    authorDate: new Date(),
  };

  it('should accept a null pr', () => {
    const trail: DecisionTrail = {
      blame: blameFixture,
      pr: null,
      issues: [],
      repoOwner: 'octocat',
      repo: 'hello-world',
    };
    expect(trail.pr).toBeNull();
  });

  it('should accept a populated pr', () => {
    const pr: PRContext = {
      number: 1,
      title: 'My PR',
      body: '',
      labels: [],
      state: 'merged',
      reviewComments: [],
      comments: [],
    };
    const trail: DecisionTrail = {
      blame: blameFixture,
      pr,
      issues: [],
      repoOwner: 'org',
      repo: 'repo',
    };
    expect(trail.pr?.number).toBe(1);
  });

  it('should store multiple issues', () => {
    const issue: IssueContext = {
      number: 10,
      title: 'Issue 10',
      body: '',
      state: 'closed',
      labels: [],
      comments: [],
    };
    const trail: DecisionTrail = {
      blame: blameFixture,
      pr: null,
      issues: [issue],
      repoOwner: 'org',
      repo: 'repo',
    };
    expect(trail.issues).toHaveLength(1);
    expect(trail.issues[0].number).toBe(10);
  });

  it('should store repoOwner and repo', () => {
    const trail: DecisionTrail = {
      blame: blameFixture,
      pr: null,
      issues: [],
      repoOwner: 'my-org',
      repo: 'my-repo',
    };
    expect(trail.repoOwner).toBe('my-org');
    expect(trail.repo).toBe('my-repo');
  });
});

// ---------------------------------------------------------------------------
// ExplainResult
// ---------------------------------------------------------------------------
describe('ExplainResult', () => {
  it('should store explanation string', () => {
    const result: ExplainResult = {
      explanation: 'This code was added to fix a race condition.',
      sources: {
        sha: 'abc',
        prNumber: 5,
        issueNumbers: [12, 13],
      },
    };
    expect(result.explanation).toContain('race condition');
  });

  it('should accept null prNumber', () => {
    const result: ExplainResult = {
      explanation: 'Some explanation.',
      sources: {
        sha: 'def456',
        prNumber: null,
        issueNumbers: [],
      },
    };
    expect(result.sources.prNumber).toBeNull();
  });

  it('should store multiple issue numbers', () => {
    const result: ExplainResult = {
      explanation: 'Explanation.',
      sources: {
        sha: '111',
        prNumber: 3,
        issueNumbers: [1, 2, 3],
      },
    };
    expect(result.sources.issueNumbers).toHaveLength(3);
  });

  it('should accept an empty issueNumbers array', () => {
    const result: ExplainResult = {
      explanation: 'No linked issues.',
      sources: {
        sha: '222',
        prNumber: null,
        issueNumbers: [],
      },
    };
    expect(result.sources.issueNumbers).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// WdeOptions - additional coverage
// ---------------------------------------------------------------------------
describe('WdeOptions (additional)', () => {
  it('should allow line to be omitted (optional)', () => {
    const options: WdeOptions = {
      file: 'src/foo.ts',
      json: true,
      verbose: true,
      model: 'gpt-4o',
    };
    expect(options.line).toBeUndefined();
  });

  it('should allow fn to be omitted (optional)', () => {
    const options: WdeOptions = {
      file: 'src/bar.ts',
      line: 10,
      json: false,
      verbose: false,
      model: 'claude-opus-4-5',
    };
    expect(options.fn).toBeUndefined();
  });

  it('should accept fn as a string when provided', () => {
    const options: WdeOptions = {
      file: 'src/baz.ts',
      fn: 'myFunction',
      json: false,
      verbose: false,
      model: 'claude-sonnet-4-20250514',
    };
    expect(options.fn).toBe('myFunction');
  });

  it('should store json flag correctly', () => {
    const options: WdeOptions = {
      file: 'x.ts',
      json: true,
      verbose: false,
      model: 'model',
    };
    expect(options.json).toBe(true);
  });

  it('should store verbose flag correctly', () => {
    const options: WdeOptions = {
      file: 'x.ts',
      json: false,
      verbose: true,
      model: 'model',
    };
    expect(options.verbose).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RepoInfo
// ---------------------------------------------------------------------------
describe('RepoInfo', () => {
  it('should accept github platform', () => {
    const info: RepoInfo = {
      owner: 'octocat',
      repo: 'hello-world',
      platform: 'github',
    };
    expect(info.platform).toBe('github');
  });

  it('should accept gitlab platform', () => {
    const info: RepoInfo = {
      owner: 'gitlab-user',
      repo: 'my-project',
      platform: 'gitlab',
    };
    expect(info.platform).toBe('gitlab');
  });

  it('should accept bitbucket platform', () => {
    const info: RepoInfo = {
      owner: 'bb-user',
      repo: 'bb-repo',
      platform: 'bitbucket',
    };
    expect(info.platform).toBe('bitbucket');
  });

  it('should accept unknown platform', () => {
    const info: RepoInfo = {
      owner: 'some-user',
      repo: 'some-repo',
      platform: 'unknown',
    };
    expect(info.platform).toBe('unknown');
  });

  it('should store owner and repo', () => {
    const info: RepoInfo = {
      owner: 'my-org',
      repo: 'my-service',
      platform: 'github',
    };
    expect(info.owner).toBe('my-org');
    expect(info.repo).toBe('my-service');
  });
});
