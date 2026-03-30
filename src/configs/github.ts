export interface GitHubConfig {
  apiBase: string;
  userAgent: string;
  perPage: number;
  maxReviewComments: number;
  maxPRComments: number;
  maxIssueComments: number;
  batchSize: number;
}

export function loadGitHubConfig(): GitHubConfig {
  return {
    apiBase: process.env.GITHUB_API_BASE ?? 'https://api.github.com',
    userAgent: process.env.WDE_USER_AGENT ?? 'wde-cli',
    perPage: parseInt(process.env.WDE_GITHUB_PER_PAGE ?? '100', 10),
    maxReviewComments: parseInt(process.env.WDE_MAX_REVIEW_COMMENTS ?? '10', 10),
    maxPRComments: parseInt(process.env.WDE_MAX_PR_COMMENTS ?? '10', 10),
    maxIssueComments: parseInt(process.env.WDE_MAX_ISSUE_COMMENTS ?? '5', 10),
    batchSize: parseInt(process.env.WDE_GITHUB_BATCH_SIZE ?? '5', 10),
  };
}
