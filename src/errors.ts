/**
 * Custom error classes for wde
 */

/**
 * Base error class for wde
 */
export class WdeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WdeError';
  }
}

/**
 * Git-related errors
 */
export class GitError extends WdeError {
  constructor(message: string) {
    super(message);
    this.name = 'GitError';
  }
}

/**
 * GitHub API errors
 */
export class GitHubError extends WdeError {
  public statusCode?: number;
  public rateLimitRemaining?: number;
  public rateLimitReset?: Date;

  constructor(
    message: string,
    statusCode?: number,
    rateLimitRemaining?: number,
    rateLimitReset?: Date,
  ) {
    super(message);
    this.name = 'GitHubError';
    this.statusCode = statusCode;
    this.rateLimitRemaining = rateLimitRemaining;
    this.rateLimitReset = rateLimitReset;
  }
}

/**
 * AI API errors
 */
export class AIError extends WdeError {
  constructor(message: string) {
    super(message);
    this.name = 'AIError';
  }
}

/**
 * Configuration errors (missing env vars, etc.)
 */
export class ConfigError extends WdeError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}
