#!/usr/bin/env bun

import { defineCommand, runMain } from 'citty';
import { version, description } from '../package.json';
import { getBlame, extractPRNumber, findFunctionLine, getRepoInfo } from './blame';
import { fetchPR, fetchIssues, extractIssueNumbers } from './github';
import { buildContext, buildSystemPrompt, getVerboseContext } from './context-builder';
import { createProvider } from './ai-providers';
import { isConfigured } from './config-manager';
import { runAuthFlow, showAuthStatus } from './commands/auth';
import {
  printHeader,
  printFooter,
  printError,
  printVerbose,
  printSources,
  startExplanationStream,
  outputJSON,
  createSpinner,
  printFallbackInfo,
  printPlatformWarning,
} from './renderer';
import { WdeError, GitError } from './errors';
import type { DecisionTrail } from './types';

/**
 * Parse target string into file and line number
 */
function parseTarget(target: string): { file: string; line: number | null } {
  const colonIndex = target.lastIndexOf(':');
  if (colonIndex === -1) {
    return { file: target, line: null };
  }

  const file = target.slice(0, colonIndex);
  const lineStr = target.slice(colonIndex + 1);
  const line = parseInt(lineStr, 10);

  if (isNaN(line) || line < 1) {
    return { file: target, line: null };
  }

  return { file, line };
}

// Auth subcommand
const authCommand = defineCommand({
  meta: {
    name: 'auth',
    description: 'Configure authentication for AI providers and GitHub',
  },
  args: {
    status: {
      type: 'boolean',
      description: 'Show current authentication status',
      default: false,
    },
  },
  async run({ args }) {
    if (args.status) {
      await showAuthStatus();
    } else {
      await runAuthFlow();
    }
  },
});

// Main command
const main = defineCommand({
  meta: {
    name: 'wde',
    version,
    description,
  },
  subCommands: {
    auth: authCommand,
  },
  args: {
    target: {
      type: 'positional',
      description: 'File path with optional line number (e.g., src/file.ts:42)',
      required: false,
    },
    fn: {
      type: 'string',
      description: 'Function name to look up instead of line number',
      alias: 'f',
    },
    json: {
      type: 'boolean',
      description: 'Output as JSON',
      default: false,
    },
    verbose: {
      type: 'boolean',
      description: 'Show full context sent to AI',
      alias: 'v',
      default: false,
    },
    model: {
      type: 'string',
      description: 'AI model to use (provider-specific)',
      alias: 'm',
    },
    provider: {
      type: 'string',
      description: 'AI provider: anthropic, openai, or ollama',
      alias: 'p',
    },
    local: {
      type: 'boolean',
      description: 'Use local git context only (skip GitHub API)',
      default: false,
    },
  },
  async run({ args }) {
    const { target, fn, json, verbose, model, provider, local } = args;

    // Show usage if no target provided
    if (!target && !fn) {
      console.log('Usage: wde <file:line> [options]');
      console.log('       wde <file> --fn <functionName> [options]');
      console.log('       wde auth    # Configure authentication');
      console.log('\nRun `wde --help` for more information.');
      process.exit(1);
    }

    // Check if configured
    const configured = await isConfigured();
    if (!configured) {
      console.log('');
      console.log('wde is not configured yet. Let\'s set it up!');
      console.log('');
      await runAuthFlow();
      return;
    }

    try {
      // Parse target
      let file: string;
      let line: number;

      if (target) {
        const parsed = parseTarget(target);
        file = parsed.file;

        if (fn) {
          line = await findFunctionLine(file, fn);
        } else if (parsed.line) {
          line = parsed.line;
        } else {
          throw new GitError('Please provide a line number (file.ts:42) or use --fn to specify a function name');
        }
      } else if (fn) {
        throw new GitError('Please provide a file path when using --fn flag');
      } else {
        throw new GitError('Please provide a target file:line');
      }

      // Print header (unless JSON mode)
      if (!json) {
        printHeader(file, line);
      }

      // Step 1: Git blame
      const blameSpinner = !json ? createSpinner('Tracing git blame...') : null;
      const blame = await getBlame(file, line);
      blameSpinner?.stop();

      // Step 2: Get repo info
      const repoSpinner = !json ? createSpinner('Detecting repository...') : null;
      const repoInfo = await getRepoInfo();
      repoSpinner?.stop();

      // Check platform support
      if (repoInfo.platform !== 'github' && !local) {
        if (!json) {
          printPlatformWarning(repoInfo.platform.charAt(0).toUpperCase() + repoInfo.platform.slice(1));
        }
      }

      // Step 3: Extract PR number and fetch PR context
      let pr = null;
      let issues: DecisionTrail['issues'] = [];

      if (repoInfo.platform === 'github' && !local) {
        const prNumber = extractPRNumber(blame.commitMessage);

        if (prNumber) {
          const prSpinner = !json ? createSpinner(`Fetching PR #${prNumber}...`) : null;
          pr = await fetchPR(repoInfo.owner, repoInfo.repo, prNumber);
          prSpinner?.stop();

          if (pr) {
            const issueNumbers = extractIssueNumbers(pr.body);
            if (issueNumbers.length > 0) {
              const issueSpinner = !json ? createSpinner(`Fetching ${issueNumbers.length} linked issue(s)...`) : null;
              issues = await fetchIssues(repoInfo.owner, repoInfo.repo, issueNumbers);
              issueSpinner?.stop();
            }
          }
        } else if (!json) {
          printFallbackInfo();
        }
      }

      // Build decision trail
      const trail: DecisionTrail = {
        blame,
        pr,
        issues,
        repoOwner: repoInfo.owner,
        repo: repoInfo.repo,
      };

      // Step 4: Build context
      const context = buildContext(trail);
      const systemPrompt = buildSystemPrompt();

      // Show verbose context if requested
      if (verbose && !json) {
        printVerbose(getVerboseContext(trail, context));
      }

      // Step 5: Get AI explanation
      const aiProvider = await createProvider(provider as 'anthropic' | 'openai' | 'ollama' | undefined);
      const modelToUse = model || aiProvider.getDefaultModel();
      let explanation: string;

      if (json) {
        explanation = await aiProvider.getResponse(
          systemPrompt,
          `Based on the following context, explain why this code exists:\n\n${context}`,
          modelToUse
        );
        outputJSON(trail, explanation);
      } else {
        const aiSpinner = createSpinner(`Asking ${aiProvider.name}...`);
        aiSpinner.stop();

        const stream = startExplanationStream();
        explanation = await aiProvider.streamResponse(
          systemPrompt,
          `Based on the following context, explain why this code exists:\n\n${context}`,
          modelToUse,
          (chunk) => stream.write(chunk)
        );
        stream.end();

        printSources(trail);
        printFooter();
      }
    } catch (error) {
      if (error instanceof WdeError) {
        if (json) {
          console.log(JSON.stringify({ error: error.message }, null, 2));
        } else {
          printError(error);
        }
        process.exit(1);
      }

      const message = error instanceof Error ? error.message : String(error);
      if (json) {
        console.log(JSON.stringify({ error: message }, null, 2));
      } else {
        printError(new Error(message));
      }
      process.exit(1);
    }
  },
});

runMain(main);
