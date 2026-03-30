/**
 * Result from git blame operation
 */
export interface BlameResult {
  sha: string;
  commitMessage: string;
  diff: string;
  authorName: string;
  authorEmail: string;
  authorDate: Date;
}

/**
 * GitHub Pull Request context
 */
export interface PRContext {
  number: number;
  title: string;
  body: string;
  labels: string[];
  state: string;
  reviewComments: ReviewComment[];
  comments: Comment[];
}

/**
 * GitHub Review Comment
 */
export interface ReviewComment {
  id: number;
  body: string;
  user: string;
  path: string;
  line: number | null;
  createdAt: Date;
}

/**
 * GitHub Comment
 */
export interface Comment {
  id: number;
  body: string;
  user: string;
  createdAt: Date;
  reactions: number;
}

/**
 * GitHub Issue context
 */
export interface IssueContext {
  number: number;
  title: string;
  body: string;
  state: string;
  labels: string[];
  comments: Comment[];
}

/**
 * Complete decision trail assembled from all sources
 */
export interface DecisionTrail {
  blame: BlameResult;
  pr: PRContext | null;
  issues: IssueContext[];
  repoOwner: string;
  repo: string;
}

/**
 * Final explanation result
 */
export interface ExplainResult {
  explanation: string;
  sources: {
    sha: string;
    prNumber: number | null;
    issueNumbers: number[];
  };
}

/**
 * CLI options
 */
export interface WdeOptions {
  file: string;
  line?: number;
  fn?: string;
  json: boolean;
  verbose: boolean;
  model: string;
}

/**
 * GitHub repository info extracted from git remote
 */
export interface RepoInfo {
  owner: string;
  repo: string;
  platform: 'github' | 'gitlab' | 'bitbucket' | 'unknown';
}
