import type { PRContext, IssueContext, Comment, ReviewComment } from './types';

import { getGitHubToken } from './config-manager';
import { github } from './configs';
import { GitHubError } from './errors';

type GitHubHeaders = Record<string, string>;

let cachedToken: string | null | undefined = undefined;

async function resolveToken(): Promise<string | null> {
  if (cachedToken === undefined) {
    cachedToken = await getGitHubToken();
  }
  return cachedToken;
}

export function invalidateTokenCache(): void {
  cachedToken = undefined;
}

async function hasToken(): Promise<boolean> {
  return !!(await resolveToken());
}

async function getHeaders(): Promise<GitHubHeaders> {
  const cfg = github();
  const token = await resolveToken();

  const headers: GitHubHeaders = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': cfg.userAgent,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

function getApiBase(): string {
  return github().apiBase;
}

const REQUEST_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url: string, headers: GitHubHeaders): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { headers, signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new GitHubError('GitHub API request timed out', 408);
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

async function handleResponse(response: Response): Promise<unknown> {
  const rateLimitRemaining = parseInt(response.headers.get('X-RateLimit-Remaining') ?? '0', 10);
  const rateLimitResetTimestamp = parseInt(response.headers.get('X-RateLimit-Reset') ?? '0', 10);
  const rateLimitReset = new Date(rateLimitResetTimestamp * 1000);

  if (!response.ok) {
    if (response.status === 404) {
      if (!(await hasToken())) {
        throw new GitHubError(
          'Resource not found. If this is a private repo, run `wde auth` to set up GitHub token.',
          404,
        );
      }
      throw new GitHubError('Resource not found on GitHub.', 404);
    }

    if (response.status === 403 && rateLimitRemaining === 0) {
      const resetTime = rateLimitReset.toLocaleTimeString();
      const hasGitHubToken = await hasToken();
      throw new GitHubError(
        `GitHub API rate limit exceeded. Resets at ${resetTime}.${!hasGitHubToken ? ' Run `wde auth` to set up GitHub token.' : ''}`,
        403,
        rateLimitRemaining,
        rateLimitReset,
      );
    }

    if (response.status === 401) {
      throw new GitHubError('GitHub authentication failed. Check your GITHUB_TOKEN.', 401);
    }

    throw new GitHubError(
      `GitHub API error (${response.status}). Check token permissions and try again.`,
      response.status,
    );
  }

  return response.json();
}

export async function fetchPR(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PRContext | null> {
  try {
    const url = `${getApiBase()}/repos/${owner}/${repo}/pulls/${prNumber}`;
    const response = await fetchWithTimeout(url, await getHeaders());
    const pr = (await handleResponse(response)) as {
      number: number;
      title: string;
      body: string | null;
      labels: Array<{ name: string }>;
      state: string;
    };

    const reviewComments = await fetchReviewComments(owner, repo, prNumber);
    const comments = await fetchPRComments(owner, repo, prNumber);

    return {
      number: pr.number,
      title: pr.title,
      body: pr.body ?? '',
      labels: pr.labels.map((l) => l.name),
      state: pr.state,
      reviewComments,
      comments,
    };
  } catch (error) {
    if (error instanceof GitHubError && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

async function fetchReviewComments(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<ReviewComment[]> {
  const cfg = github();
  const url = `${getApiBase()}/repos/${owner}/${repo}/pulls/${prNumber}/comments?per_page=${cfg.perPage}`;
  const response = await fetchWithTimeout(url, await getHeaders());
  const data = (await handleResponse(response)) as Array<{
    id: number;
    body: string;
    user: { login: string } | null;
    path: string;
    line: number | null;
    created_at: string;
  }>;

  return data
    .filter((c) => !isBot(c.user?.login))
    .slice(0, cfg.maxReviewComments)
    .map((c) => ({
      id: c.id,
      body: c.body,
      user: c.user?.login ?? 'unknown',
      path: c.path,
      line: c.line,
      createdAt: new Date(c.created_at),
    }));
}

async function fetchPRComments(owner: string, repo: string, prNumber: number): Promise<Comment[]> {
  const cfg = github();
  const url = `${getApiBase()}/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=${cfg.perPage}`;
  const response = await fetchWithTimeout(url, await getHeaders());
  const data = (await handleResponse(response)) as Array<{
    id: number;
    body: string;
    user: { login: string } | null;
    created_at: string;
    reactions: { total_count: number };
  }>;

  return data
    .filter((c) => !isBot(c.user?.login))
    .sort((a, b) => (b.reactions?.total_count ?? 0) - (a.reactions?.total_count ?? 0))
    .slice(0, cfg.maxPRComments)
    .map((c) => ({
      id: c.id,
      body: c.body,
      user: c.user?.login ?? 'unknown',
      createdAt: new Date(c.created_at),
      reactions: c.reactions?.total_count ?? 0,
    }));
}

export function extractIssueNumbers(prBody: string): number[] {
  const patterns = [
    /(?:fix(?:es)?|close[sd]?|resolve[sd]?|related\s+to)\s+#(\d+)/gi,
    /(?:fix(?:es)?|close[sd]?|resolve[sd]?)\s+https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/gi,
  ];

  const issues = new Set<number>();

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(prBody)) !== null) {
      issues.add(parseInt(match[1], 10));
    }
  }

  const standalonePattern = /#(\d+)/g;
  let match;
  while ((match = standalonePattern.exec(prBody)) !== null) {
    const num = parseInt(match[1], 10);
    if (num < 100000) {
      issues.add(num);
    }
  }

  return Array.from(issues);
}

export async function fetchIssue(
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<IssueContext | null> {
  try {
    const url = `${getApiBase()}/repos/${owner}/${repo}/issues/${issueNumber}`;
    const response = await fetchWithTimeout(url, await getHeaders());
    const issue = (await handleResponse(response)) as {
      number: number;
      title: string;
      body: string | null;
      state: string;
      labels: Array<{ name: string }>;
      pull_request?: unknown;
    };

    if (issue.pull_request) {
      return null;
    }

    const comments = await fetchIssueComments(owner, repo, issueNumber);

    return {
      number: issue.number,
      title: issue.title,
      body: issue.body ?? '',
      state: issue.state,
      labels: issue.labels.map((l) => l.name),
      comments,
    };
  } catch (error) {
    if (error instanceof GitHubError && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

async function fetchIssueComments(
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<Comment[]> {
  const cfg = github();
  const url = `${getApiBase()}/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=${cfg.perPage}`;
  const response = await fetchWithTimeout(url, await getHeaders());
  const data = (await handleResponse(response)) as Array<{
    id: number;
    body: string;
    user: { login: string } | null;
    created_at: string;
    reactions: { total_count: number };
  }>;

  return data
    .filter((c) => !isBot(c.user?.login))
    .sort((a, b) => (b.reactions?.total_count ?? 0) - (a.reactions?.total_count ?? 0))
    .slice(0, cfg.maxIssueComments)
    .map((c) => ({
      id: c.id,
      body: c.body,
      user: c.user?.login ?? 'unknown',
      createdAt: new Date(c.created_at),
      reactions: c.reactions?.total_count ?? 0,
    }));
}

export async function fetchIssues(
  owner: string,
  repo: string,
  issueNumbers: number[],
): Promise<IssueContext[]> {
  const issues: IssueContext[] = [];
  const cfg = github();

  for (let i = 0; i < issueNumbers.length; i += cfg.batchSize) {
    const batch = issueNumbers.slice(i, i + cfg.batchSize);
    const results = await Promise.all(batch.map((num) => fetchIssue(owner, repo, num)));
    for (const issue of results) {
      if (issue) issues.push(issue);
    }
  }

  return issues;
}

function isBot(username: string | undefined | null): boolean {
  if (!username) return false;
  const botPatterns = [
    /\[bot\]$/i,
    /^dependabot/i,
    /^renovate/i,
    /^github-actions/i,
    /^codecov/i,
    /^sonarcloud/i,
    /^snyk/i,
  ];
  return botPatterns.some((p) => p.test(username));
}
