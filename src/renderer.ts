import pc from 'picocolors';

import type { DecisionTrail, ExplainResult } from './types';

// Check if output should be colorized
const isInteractive = process.stdout.isTTY && !process.env.NO_COLOR;

/**
 * Color helper that respects NO_COLOR and pipe detection
 */
const c = {
  bold: (s: string) => (isInteractive ? pc.bold(s) : s),
  dim: (s: string) => (isInteractive ? pc.dim(s) : s),
  cyan: (s: string) => (isInteractive ? pc.cyan(s) : s),
  green: (s: string) => (isInteractive ? pc.green(s) : s),
  yellow: (s: string) => (isInteractive ? pc.yellow(s) : s),
  blue: (s: string) => (isInteractive ? pc.blue(s) : s),
  magenta: (s: string) => (isInteractive ? pc.magenta(s) : s),
  red: (s: string) => (isInteractive ? pc.red(s) : s),
  gray: (s: string) => (isInteractive ? pc.gray(s) : s),
};

/**
 * Spinner characters for progress indication
 */
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Create a simple spinner for async operations
 */
export function createSpinner(message: string): {
  stop: (success?: boolean) => void;
  update: (msg: string) => void;
} {
  if (!isInteractive) {
    console.log(message);
    return {
      stop: () => {},
      update: (msg: string) => console.log(msg),
    };
  }

  let frameIndex = 0;
  let currentMessage = message;

  const interval = setInterval(() => {
    const frame = SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length];
    process.stdout.write(`\r${c.cyan(frame)} ${currentMessage}`);
    frameIndex++;
  }, 80);

  return {
    stop: (success = true) => {
      clearInterval(interval);
      const icon = success ? c.green('✓') : c.red('✗');
      process.stdout.write(`\r${icon} ${currentMessage}\n`);
    },
    update: (msg: string) => {
      currentMessage = msg;
    },
  };
}

/**
 * Print the header bar
 */
export function printHeader(file: string, line: number): void {
  console.log('');
  console.log(c.bold(c.cyan('━━━ wde ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')));
  console.log(c.dim(`Analyzing: ${c.bold(file)}:${line}`));
  console.log('');
}

/**
 * Print the explanation with streaming support
 */
export function startExplanationStream(): { write: (chunk: string) => void; end: () => void } {
  console.log(c.bold('Explanation:'));
  console.log('');

  return {
    write: (chunk: string) => {
      process.stdout.write(chunk);
    },
    end: () => {
      console.log('');
      console.log('');
    },
  };
}

/**
 * Print the explanation (non-streaming)
 */
export function printExplanation(explanation: string): void {
  console.log(c.bold('Explanation:'));
  console.log('');
  console.log(explanation);
  console.log('');
}

/**
 * Print source citations
 */
export function printSources(trail: DecisionTrail): void {
  const { repoOwner, repo, blame, pr, issues } = trail;

  console.log(c.dim('─────────────────────────────────────────────────────────────────'));
  console.log(c.bold('Sources:'));

  // Commit
  const commitUrl = `https://github.com/${repoOwner}/${repo}/commit/${blame.sha}`;
  console.log(`  ${c.yellow('•')} Commit ${c.cyan(blame.sha.slice(0, 7))} by ${blame.authorName}`);
  console.log(`    ${c.dim(commitUrl)}`);

  // PR
  if (pr) {
    const prUrl = `https://github.com/${repoOwner}/${repo}/pull/${pr.number}`;
    console.log(
      `  ${c.green('•')} PR #${pr.number}: ${pr.title.slice(0, 50)}${pr.title.length > 50 ? '...' : ''}`,
    );
    console.log(`    ${c.dim(prUrl)}`);
  }

  // Issues
  for (const issue of issues) {
    const issueUrl = `https://github.com/${repoOwner}/${repo}/issues/${issue.number}`;
    console.log(
      `  ${c.magenta('•')} Issue #${issue.number}: ${issue.title.slice(0, 50)}${issue.title.length > 50 ? '...' : ''}`,
    );
    console.log(`    ${c.dim(issueUrl)}`);
  }

  console.log('');
}

/**
 * Print the footer
 */
export function printFooter(): void {
  console.log(c.dim('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log('');
}

/**
 * Output JSON result
 */
export function outputJSON(trail: DecisionTrail, explanation: string): void {
  const result: ExplainResult = {
    explanation,
    sources: {
      sha: trail.blame.sha,
      prNumber: trail.pr?.number ?? null,
      issueNumbers: trail.issues.map((i) => i.number),
    },
  };

  console.log(JSON.stringify(result, null, 2));
}

/**
 * Print an error message
 */
export function printError(error: Error): void {
  console.error('');
  console.error(c.red(c.bold('Error:')), error.message);
  console.error('');
}

/**
 * Print verbose context
 */
export function printVerbose(context: string): void {
  console.log('');
  console.log(c.dim(context));
  console.log('');
}

/**
 * Print a warning message
 */
export function printWarning(message: string): void {
  console.log(c.yellow('⚠'), c.yellow(message));
}

/**
 * Print info about fallback mode (no PR found)
 */
export function printFallbackInfo(): void {
  printWarning('No PR found for this commit. Using commit message and diff only.');
}

/**
 * Print info about platform not being supported
 */
export function printPlatformWarning(platform: string): void {
  printWarning(`${platform} support coming in v2. Using local git context only.`);
}
