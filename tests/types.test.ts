import { describe, expect, it } from 'bun:test';
import type { BlameResult, PRContext, WdeOptions } from '../src/types';

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
