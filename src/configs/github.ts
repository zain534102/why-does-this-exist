import { ConfigError } from '../errors';

export interface GitHubConfig {
  apiBase: string;
  userAgent: string;
  perPage: number;
  maxReviewComments: number;
  maxPRComments: number;
  maxIssueComments: number;
  batchSize: number;
}

function parsePositiveInt(value: string | undefined, defaultVal: number, min: number, max: number): number {
  const parsed = parseInt(value ?? String(defaultVal), 10);
  if (isNaN(parsed) || parsed < min || parsed > max) {
    return defaultVal;
  }
  return parsed;
}

function sanitizeApiBase(raw: string): string {
  const trimmed = raw.replace(/\/+$/, '');
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:') {
      throw new ConfigError('GITHUB_API_BASE must use https:// scheme');
    }
    if (url.username || url.password) {
      throw new ConfigError('GITHUB_API_BASE must not contain credentials');
    }
  } catch (e) {
    if (e instanceof ConfigError) throw e;
    throw new ConfigError(`Invalid GITHUB_API_BASE: ${raw}`);
  }
  return trimmed;
}

function sanitizeHeaderValue(value: string): string {
  if (/[\r\n]/.test(value)) {
    throw new ConfigError('WDE_USER_AGENT contains invalid characters (CRLF)');
  }
  if (value.length > 256) {
    throw new ConfigError('WDE_USER_AGENT is too long (max 256 chars)');
  }
  return value;
}

export function loadGitHubConfig(): GitHubConfig {
  return {
    apiBase: sanitizeApiBase(process.env.GITHUB_API_BASE ?? 'https://api.github.com'),
    userAgent: sanitizeHeaderValue(process.env.WDE_USER_AGENT ?? 'wde-cli'),
    perPage: parsePositiveInt(process.env.WDE_GITHUB_PER_PAGE, 100, 1, 100),
    maxReviewComments: parsePositiveInt(process.env.WDE_MAX_REVIEW_COMMENTS, 10, 0, 100),
    maxPRComments: parsePositiveInt(process.env.WDE_MAX_PR_COMMENTS, 10, 0, 100),
    maxIssueComments: parsePositiveInt(process.env.WDE_MAX_ISSUE_COMMENTS, 5, 0, 100),
    batchSize: parsePositiveInt(process.env.WDE_GITHUB_BATCH_SIZE, 5, 1, 50),
  };
}
