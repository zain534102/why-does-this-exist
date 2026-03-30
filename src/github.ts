import type { PRContext, IssueContext, Comment, ReviewComment } from './types';
import { GitHubError } from './errors';
import { github } from './configs';
import { getGitHubToken } from './config-manager';

type GitHubHeaders = Record<string, string>;

// Cached token to avoid repeated keychain lookups
let cachedToken: string | null | undefined = undefined;

/**
 * Get GitHub token (from keychain or env)
 */
async function resolveToken(): Promise<string | null> {
  if (cachedToken === undefined) {
    cachedToken = await getGitHubToken();
  }
  return cachedToken;
}

/**
 * Check if GitHub token is available
 */
async function hasToken(): Promise<boolean> {
  return !!(await resolveToken());
}

/**
 * Get headers for GitHub API requests
 */
async function getHeaders(): Promise<GitHubHeaders> {
  const cfg = github();
  const token = await resolveToken();

  const headers: GitHubHeaders = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': cfg.userAgent,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Get GitHub API base URL from config
 */
function getApiBase(): string {
  return github().apiBase;
}

/**
 * Handle GitHub API response errors
 */
async function handleResponse(response: Response): Promise<unknown> {
  const rateLimitRemaining = parseInt(response.headers.get('X-RateLimit-Remaining') ?? '0', 10);
  const rateLimitResetTimestamp = parseInt(response.headers.get('X-RateLimit-Reset') ?? '0', 10);
  const rateLimitReset = new Date(rateLimitResetTimestamp * 1000);

  if (!response.ok) {
    if (response.status === 404) {
      if (!(await hasToken())) {
        throw new GitHubError(
          'Resource not found. If this is a private repo, run `wde auth` to set up GitHub token.',
          404
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
        rateLimitReset
      );
    }

    if (response.status === 401) {
      throw new GitHubError(
        'GitHub authentication failed. Check your GITHUB_TOKEN.',
        401
      );
    }

    const body = await response.text();
    throw new GitHubError(`GitHub API error: ${response.status} - ${body}`, response.status);
  }

  return response.json();
}

/**
 * Fetch a Pull Request from GitHub
 */
export async function fetchPR(owner: string, repo: string, prNumber: number): Promise<PRContext | null> {
  try {
    const url = `${getApiBase()}/repos/${owner}/${repo}/pulls/${prNumber}`;
    const response = await fetch(url, { headers: await getHeaders() });
    const pr = await handleResponse(response) as {
      number: number;
      title: string;
      body: string | null;
      labels: Array<{ name: string }>;
      state: string;
    };

    // Fetch review comments
    const reviewComments = await fetchReviewComments(owner, repo, prNumber);

    // Fetch general comments
    const comments = await fetchPRComments(owner, repo, prNumber);

    return {
      number: pr.number,
      title: pr.title,
      body: pr.body ?? '',
      labels: pr.labels.map(l => l.name),
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

/**
 * Fetch PR review comments (inline code comments)
 */
async function fetchReviewComments(owner: string, repo: string, prNumber: number): Promise<ReviewComment[]> {
  const cfg = github();
  const url = `${getApiBase()}/repos/${owner}/${repo}/pulls/${prNumber}/comments?per_page=${cfg.perPage}`;
  const response = await fetch(url, { headers: await getHeaders() });
  const data = await handleResponse(response) as Array<{
    id: number;
    body: string;
    user: { login: string } | null;
    path: string;
    line: number | null;
    created_at: string;
  }>;

  return data
    .filter(c => !isBot(c.user?.login))
    .slice(0, cfg.maxReviewComments)
    .map(c => ({
      id: c.id,
      body: c.body,
      user: c.user?.login ?? 'unknown',
      path: c.path,
      line: c.line,
      createdAt: new Date(c.created_at),
    }));
}

/**
 * Fetch PR general comments (conversation)
 */
async function fetchPRComments(owner: string, repo: string, prNumber: number): Promise<Comment[]> {
  const cfg = github();
  const url = `${getApiBase()}/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=${cfg.perPage}`;
  const response = await fetch(url, { headers: await getHeaders() });
  const data = await handleResponse(response) as Array<{
    id: number;
    body: string;
    user: { login: string } | null;
    created_at: string;
    reactions: { total_count: number };
  }>;

  return data
    .filter(c => !isBot(c.user?.login))
    .sort((a, b) => (b.reactions?.total_count ?? 0) - (a.reactions?.total_count ?? 0))
    .slice(0, cfg.maxPRComments)
    .map(c => ({
      id: c.id,
      body: c.body,
      user: c.user?.login ?? 'unknown',
      createdAt: new Date(c.created_at),
      reactions: c.reactions?.total_count ?? 0,
    }));
}

/**
 * Extract issue numbers from PR body
 * Supports: Fixes #123, Closes #123, Resolves #123, Related to #123
 */
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

  // Also match standalone issue references #123 (but be more conservative)
  const standalonePattern = /#(\d+)/g;
  let match;
  while ((match = standalonePattern.exec(prBody)) !== null) {
    const num = parseInt(match[1], 10);
    // Only include if it looks like an issue number (not too high)
    if (num < 100000) {
      issues.add(num);
    }
  }

  return Array.from(issues);
}

/**
 * Fetch an issue from GitHub
 */
export async function fetchIssue(owner: string, repo: string, issueNumber: number): Promise<IssueContext | null> {
  try {
    const url = `${getApiBase()}/repos/${owner}/${repo}/issues/${issueNumber}`;
    const response = await fetch(url, { headers: await getHeaders() });
    const issue = await handleResponse(response) as {
      number: number;
      title: string;
      body: string | null;
      state: string;
      labels: Array<{ name: string }>;
      pull_request?: unknown;
    };

    // Skip if this is actually a PR
    if (issue.pull_request) {
      return null;
    }

    // Fetch issue comments
    const comments = await fetchIssueComments(owner, repo, issueNumber);

    return {
      number: issue.number,
      title: issue.title,
      body: issue.body ?? '',
      state: issue.state,
      labels: issue.labels.map(l => l.name),
      comments,
    };
  } catch (error) {
    if (error instanceof GitHubError && error.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Fetch issue comments
 */
async function fetchIssueComments(owner: string, repo: string, issueNumber: number): Promise<Comment[]> {
  const cfg = github();
  const url = `${getApiBase()}/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=${cfg.perPage}`;
  const response = await fetch(url, { headers: await getHeaders() });
  const data = await handleResponse(response) as Array<{
    id: number;
    body: string;
    user: { login: string } | null;
    created_at: string;
    reactions: { total_count: number };
  }>;

  return data
    .filter(c => !isBot(c.user?.login))
    .sort((a, b) => (b.reactions?.total_count ?? 0) - (a.reactions?.total_count ?? 0))
    .slice(0, cfg.maxIssueComments)
    .map(c => ({
      id: c.id,
      body: c.body,
      user: c.user?.login ?? 'unknown',
      createdAt: new Date(c.created_at),
      reactions: c.reactions?.total_count ?? 0,
    }));
}

/**
 * Fetch multiple issues
 */
export async function fetchIssues(owner: string, repo: string, issueNumbers: number[]): Promise<IssueContext[]> {
  const issues: IssueContext[] = [];
  const cfg = github();

  // Fetch issues in parallel (but limit concurrency)
  for (let i = 0; i < issueNumbers.length; i += cfg.batchSize) {
    const batch = issueNumbers.slice(i, i + cfg.batchSize);
    const results = await Promise.all(
      batch.map(num => fetchIssue(owner, repo, num))
    );
    for (const issue of results) {
      if (issue) issues.push(issue);
    }
  }

  return issues;
}

/**
 * Check if a username looks like a bot
 */
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
  return botPatterns.some(p => p.test(username));
}
