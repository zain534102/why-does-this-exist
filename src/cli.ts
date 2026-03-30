#!/usr/bin/env bun

import { defineCommand, runMain } from 'citty';
import { version, description } from '../package.json';

const main = defineCommand({
  meta: {
    name: 'wde',
    version,
    description,
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
      description: 'Claude model to use',
      default: 'claude-sonnet-4-20250514',
      alias: 'm',
    },
  },
  async run({ args }) {
    const { target, fn, json, verbose, model } = args;

    if (!target && !fn) {
      console.log('Usage: wde <file:line> [options]');
      console.log('       wde --fn <functionName> <file> [options]');
      console.log('\nRun `wde --help` for more information.');
      process.exit(1);
    }

    // TODO: Implement core functionality
    // 1. Parse target (file:line or file + --fn)
    // 2. Run git blame
    // 3. Extract PR number from commit
    // 4. Fetch PR and issues from GitHub
    // 5. Build context and call Claude API
    // 6. Render output

    console.log('wde - why does this exist?');
    console.log('');
    console.log('Target:', target);
    console.log('Function:', fn || '(none)');
    console.log('Model:', model);
    console.log('JSON output:', json);
    console.log('Verbose:', verbose);
    console.log('');
    console.log('Coming soon...');
  },
});

runMain(main);
