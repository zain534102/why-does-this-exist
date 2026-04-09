import { $ } from 'bun';
import { resolve } from 'path';

import type { BlameResult, RepoInfo } from './types';

import { app } from './configs';
import { GitError } from './errors';

const SHA_PATTERN = /^[0-9a-f]{40}$/;

/**
 * Parse git blame porcelain output for a specific line
 */
function parseBlameOutput(output: string): {
  sha: string;
  authorName: string;
  authorEmail: string;
  authorTime: number;
} {
  const lines = output.trim().split('\n');
  const sha = lines[0]?.split(' ')[0] ?? '';

  let authorName = '';
  let authorEmail = '';
  let authorTime = 0;

  for (const line of lines) {
    if (line.startsWith('author ')) {
      authorName = line.slice(7);
    } else if (line.startsWith('author-mail ')) {
      authorEmail = line.slice(12).replace(/[<>]/g, '');
    } else if (line.startsWith('author-time ')) {
      authorTime = parseInt(line.slice(12), 10);
    }
  }

  return { sha, authorName, authorEmail, authorTime };
}

/**
 * Run git blame on a file:line and get the commit SHA
 */
export async function getBlame(file: string, line: number): Promise<BlameResult> {
  try {
    // Run git blame in porcelain format for the specific line
    const blameOutput = await $`git blame -L ${line},${line} --porcelain ${file}`.text();
    const { sha, authorName, authorEmail, authorTime } = parseBlameOutput(blameOutput);

    if (!sha || sha === '0000000000000000000000000000000000000000') {
      throw new GitError(
        `Line ${line} in ${file} has not been committed yet (uncommitted changes)`,
      );
    }

    if (!SHA_PATTERN.test(sha)) {
      throw new GitError(`Invalid commit SHA from git blame: ${sha}`);
    }

    // Get commit message and diff
    const showOutput = await $`git show ${sha} --no-patch --format=%B`.text();
    const commitMessage = showOutput.trim();

    // Get the diff for this commit (limit to configured max lines)
    const maxDiffLines = app().maxDiffLines;
    const diffOutput = await $`git show ${sha} --format= --stat --patch`.text();
    const diffLines = diffOutput.split('\n');
    const diff =
      diffLines.slice(0, maxDiffLines).join('\n') +
      (diffLines.length > maxDiffLines ? '\n... (truncated)' : '');

    return {
      sha,
      commitMessage,
      diff,
      authorName,
      authorEmail,
      authorDate: new Date(authorTime * 1000),
    };
  } catch (error) {
    if (error instanceof GitError) throw error;

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('no such path') || message.includes('does not exist')) {
      throw new GitError(`File not found: ${file}`);
    }
    if (message.includes('fatal: not a git repository')) {
      throw new GitError('Not a git repository. Run this command from within a git repo.');
    }
    if (message.includes('no such ref') || message.includes('bad revision')) {
      throw new GitError(`Invalid line number ${line} for file ${file}`);
    }
    throw new GitError(`Git blame failed: ${message}`);
  }
}

/**
 * Extract PR number from commit message
 * Supports formats:
 * - "Merge pull request #123"
 * - "feat: something (#123)"
 * - "Something something (fixes #123)"
 */
export function extractPRNumber(commitMessage: string): number | null {
  // Merge commit pattern: "Merge pull request #123"
  const mergeMatch = commitMessage.match(/Merge pull request #(\d+)/i);
  if (mergeMatch) {
    return parseInt(mergeMatch[1], 10);
  }

  // Squash merge pattern: "Something (#123)"
  const squashMatch = commitMessage.match(/\(#(\d+)\)/);
  if (squashMatch) {
    return parseInt(squashMatch[1], 10);
  }

  // PR reference anywhere in message: #123
  const refMatch = commitMessage.match(/#(\d+)/);
  if (refMatch) {
    return parseInt(refMatch[1], 10);
  }

  return null;
}

/**
 * Find line number for a function name in a file
 */
export async function findFunctionLine(file: string, functionName: string): Promise<number> {
  // Validate file path stays within the current directory
  const resolved = resolve(file);
  const cwd = process.cwd();
  if (!resolved.startsWith(cwd + '/') && resolved !== cwd) {
    throw new GitError(`File path escapes the current directory: ${file}`);
  }
  if (file.includes('\0')) {
    throw new GitError('Invalid file path: contains null byte');
  }

  try {
    const content = await Bun.file(file).text();
    const lines = content.split('\n');

    // Common function patterns
    const patterns = [
      // JavaScript/TypeScript: function name(
      new RegExp(`^\\s*(export\\s+)?(async\\s+)?function\\s+${escapeRegex(functionName)}\\s*[(<]`),
      // Arrow function: const name = (
      new RegExp(
        `^\\s*(export\\s+)?(const|let|var)\\s+${escapeRegex(functionName)}\\s*=\\s*(async\\s+)?[(<]`,
      ),
      // Method: name(
      new RegExp(
        `^\\s*(public|private|protected)?\\s*(async\\s+)?${escapeRegex(functionName)}\\s*[(<]`,
      ),
      // PHP: function name(
      new RegExp(
        `^\\s*(public|private|protected)?\\s*(static\\s+)?function\\s+${escapeRegex(functionName)}\\s*\\(`,
      ),
      // Python: def name(
      new RegExp(`^\\s*(async\\s+)?def\\s+${escapeRegex(functionName)}\\s*\\(`),
      // Ruby: def name
      new RegExp(`^\\s*def\\s+${escapeRegex(functionName)}\\s*(\\(|$)`),
      // Go: func name(
      new RegExp(`^\\s*func\\s+(\\([^)]+\\)\\s+)?${escapeRegex(functionName)}\\s*\\(`),
      // Rust: fn name(
      new RegExp(`^\\s*(pub\\s+)?(async\\s+)?fn\\s+${escapeRegex(functionName)}\\s*[(<]`),
    ];

    for (let i = 0; i < lines.length; i++) {
      for (const pattern of patterns) {
        if (pattern.test(lines[i])) {
          return i + 1; // Line numbers are 1-indexed
        }
      }
    }

    throw new GitError(`Function '${functionName}' not found in ${file}`);
  } catch (error) {
    if (error instanceof GitError) throw error;
    throw new GitError(
      `Failed to read file ${file}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get repository info from git remote
 */
export async function getRepoInfo(): Promise<RepoInfo> {
  try {
    const remoteOutput = await $`git remote get-url origin`.text();
    const remoteUrl = remoteOutput.trim();

    // Parse different remote URL formats
    // SSH: git@github.com:owner/repo.git
    // HTTPS: https://github.com/owner/repo.git
    // HTTPS with token: https://token@github.com/owner/repo.git

    let platform: RepoInfo['platform'] = 'unknown';
    let owner = '';
    let repo = '';

    // GitHub patterns
    const githubSSH = remoteUrl.match(/git@github\.com:([^/]+)\/([^.]+)(\.git)?$/);
    const githubHTTPS = remoteUrl.match(
      /https:\/\/(?:[^@]+@)?github\.com\/([^/]+)\/([^.]+)(\.git)?$/,
    );

    if (githubSSH) {
      platform = 'github';
      owner = githubSSH[1];
      repo = githubSSH[2];
    } else if (githubHTTPS) {
      platform = 'github';
      owner = githubHTTPS[1];
      repo = githubHTTPS[2];
    }

    // GitLab patterns
    const gitlabSSH = remoteUrl.match(/git@gitlab\.com:([^/]+)\/([^.]+)(\.git)?$/);
    const gitlabHTTPS = remoteUrl.match(
      /https:\/\/(?:[^@]+@)?gitlab\.com\/([^/]+)\/([^.]+)(\.git)?$/,
    );

    if (gitlabSSH || gitlabHTTPS) {
      platform = 'gitlab';
      const match = gitlabSSH || gitlabHTTPS;
      if (match) {
        owner = match[1];
        repo = match[2];
      }
    }

    // Bitbucket patterns
    const bitbucketSSH = remoteUrl.match(/git@bitbucket\.org:([^/]+)\/([^.]+)(\.git)?$/);
    const bitbucketHTTPS = remoteUrl.match(
      /https:\/\/(?:[^@]+@)?bitbucket\.org\/([^/]+)\/([^.]+)(\.git)?$/,
    );

    if (bitbucketSSH || bitbucketHTTPS) {
      platform = 'bitbucket';
      const match = bitbucketSSH || bitbucketHTTPS;
      if (match) {
        owner = match[1];
        repo = match[2];
      }
    }

    if (!owner || !repo) {
      throw new GitError(`Could not parse repository info from remote URL: ${remoteUrl}`);
    }

    return { owner, repo, platform };
  } catch (error) {
    if (error instanceof GitError) throw error;
    throw new GitError('Could not get git remote URL. Is this a git repository with a remote?');
  }
}
