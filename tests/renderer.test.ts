import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import type { DecisionTrail, ExplainResult } from '../src/types';
import { WdeError } from '../src/errors';

// We'll test the output functions by checking what they would produce
// Since they write to stdout, we'll mock console.log

describe('renderer module', () => {
  // Store original console methods
  const originalLog = console.log;
  const originalError = console.error;
  let logOutput: string[] = [];
  let errorOutput: string[] = [];

  beforeEach(() => {
    logOutput = [];
    errorOutput = [];
    console.log = (...args: unknown[]) => {
      logOutput.push(args.map(String).join(' '));
    };
    console.error = (...args: unknown[]) => {
      errorOutput.push(args.map(String).join(' '));
    };
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
  });

  // Import after mocking — force non-interactive so spinner uses console.log
  const getRenderer = async () => {
    const origNoColor = process.env.NO_COLOR;
    process.env.NO_COLOR = '1';
    delete require.cache[require.resolve('../src/renderer')];
    const mod = await import('../src/renderer');
    if (origNoColor === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = origNoColor;
    }
    return mod;
  };

  describe('printHeader', () => {
    it('should print file and line number', async () => {
      const renderer = await getRenderer();
      renderer.printHeader('src/test.ts', 42);
      const output = logOutput.join('\n');
      expect(output).toContain('src/test.ts');
      expect(output).toContain('42');
    });

    it('should include wde branding', async () => {
      const renderer = await getRenderer();
      renderer.printHeader('file.ts', 1);
      const output = logOutput.join('\n');
      expect(output).toContain('wde');
    });

    it('should include the word Analyzing', async () => {
      const renderer = await getRenderer();
      renderer.printHeader('src/index.ts', 10);
      const output = logOutput.join('\n');
      expect(output).toContain('Analyzing');
    });

    it('should emit at least one blank line before the header bar', async () => {
      const renderer = await getRenderer();
      renderer.printHeader('src/foo.ts', 1);
      // First console.log call is console.log('') which gives ''
      expect(logOutput[0]).toBe('');
    });

    it('should include the separator bar character ━', async () => {
      const renderer = await getRenderer();
      renderer.printHeader('x.ts', 99);
      const output = logOutput.join('\n');
      expect(output).toContain('━');
    });

    it('should reference both the file name and line number', async () => {
      const renderer = await getRenderer();
      renderer.printHeader('src/renderer.ts', 77);
      const output = logOutput.join('\n');
      expect(output).toContain('src/renderer.ts');
      expect(output).toContain('77');
    });
  });

  describe('printFooter', () => {
    it('should print a separator line', async () => {
      const renderer = await getRenderer();
      renderer.printFooter();
      const output = logOutput.join('\n');
      expect(output).toContain('━');
    });

    it('should produce at least two console.log calls (separator + blank line)', async () => {
      const renderer = await getRenderer();
      renderer.printFooter();
      expect(logOutput.length).toBeGreaterThanOrEqual(2);
    });

    it('should end with a blank line', async () => {
      const renderer = await getRenderer();
      renderer.printFooter();
      expect(logOutput[logOutput.length - 1]).toBe('');
    });
  });

  describe('printError', () => {
    it('should print error message', async () => {
      const renderer = await getRenderer();
      const error = new Error('Test error message');
      renderer.printError(error);
      const output = errorOutput.join('\n');
      expect(output).toContain('Test error message');
    });

    it('should include Error label', async () => {
      const renderer = await getRenderer();
      const error = new Error('Something went wrong');
      renderer.printError(error);
      const output = errorOutput.join('\n');
      expect(output).toContain('Error');
    });

    it('should use console.error, not console.log', async () => {
      const renderer = await getRenderer();
      renderer.printError(new Error('check channel'));
      expect(errorOutput.some(line => line.includes('check channel'))).toBe(true);
      expect(logOutput.some(line => line.includes('check channel'))).toBe(false);
    });

    it('should print a WdeError message correctly', async () => {
      const renderer = await getRenderer();
      const error = new WdeError('wde-specific failure');
      renderer.printError(error);
      const output = errorOutput.join('\n');
      expect(output).toContain('wde-specific failure');
    });

    it('should emit blank lines around the error for readability', async () => {
      const renderer = await getRenderer();
      renderer.printError(new Error('spacing check'));
      expect(errorOutput[0]).toBe('');
      expect(errorOutput[errorOutput.length - 1]).toBe('');
    });
  });

  describe('printVerbose', () => {
    it('should print the context', async () => {
      const renderer = await getRenderer();
      renderer.printVerbose('Verbose context content here');
      const output = logOutput.join('\n');
      expect(output).toContain('Verbose context content here');
    });

    it('should surround content with blank lines', async () => {
      const renderer = await getRenderer();
      renderer.printVerbose('some verbose text');
      expect(logOutput[0]).toBe('');
      expect(logOutput[logOutput.length - 1]).toBe('');
    });

    it('should not write to console.error', async () => {
      const renderer = await getRenderer();
      renderer.printVerbose('verbose only');
      expect(errorOutput.length).toBe(0);
    });
  });

  describe('printSources', () => {
    it('should print commit information', async () => {
      const renderer = await getRenderer();
      const trail: DecisionTrail = {
        blame: {
          sha: 'abc123def456',
          commitMessage: 'test commit',
          diff: '',
          authorName: 'Test Author',
          authorEmail: 'test@example.com',
          authorDate: new Date(),
        },
        pr: null,
        issues: [],
        repoOwner: 'owner',
        repo: 'repo',
      };
      renderer.printSources(trail);
      const output = logOutput.join('\n');
      expect(output).toContain('abc123d'); // short SHA
      expect(output).toContain('Test Author');
    });

    it('should print PR information when available', async () => {
      const renderer = await getRenderer();
      const trail: DecisionTrail = {
        blame: {
          sha: 'abc123',
          commitMessage: 'test',
          diff: '',
          authorName: 'Author',
          authorEmail: 'a@b.com',
          authorDate: new Date(),
        },
        pr: {
          number: 42,
          title: 'Test PR Title',
          body: '',
          labels: [],
          state: 'merged',
          reviewComments: [],
          comments: [],
        },
        issues: [],
        repoOwner: 'owner',
        repo: 'repo',
      };
      renderer.printSources(trail);
      const output = logOutput.join('\n');
      expect(output).toContain('PR #42');
      expect(output).toContain('Test PR Title');
    });

    it('should not print a PR section when pr is null', async () => {
      const renderer = await getRenderer();
      const trail: DecisionTrail = {
        blame: {
          sha: 'abc123',
          commitMessage: 'test',
          diff: '',
          authorName: 'Author',
          authorEmail: 'a@b.com',
          authorDate: new Date(),
        },
        pr: null,
        issues: [],
        repoOwner: 'owner',
        repo: 'repo',
      };
      renderer.printSources(trail);
      const output = logOutput.join('\n');
      expect(output).not.toContain('PR #');
    });

    it('should print issue information', async () => {
      const renderer = await getRenderer();
      const trail: DecisionTrail = {
        blame: {
          sha: 'abc123',
          commitMessage: 'test',
          diff: '',
          authorName: 'Author',
          authorEmail: 'a@b.com',
          authorDate: new Date(),
        },
        pr: null,
        issues: [
          {
            number: 100,
            title: 'Bug report title',
            body: '',
            state: 'closed',
            labels: [],
            comments: [],
          },
        ],
        repoOwner: 'owner',
        repo: 'repo',
      };
      renderer.printSources(trail);
      const output = logOutput.join('\n');
      expect(output).toContain('Issue #100');
      expect(output).toContain('Bug report title');
    });

    it('should print multiple issues', async () => {
      const renderer = await getRenderer();
      const trail: DecisionTrail = {
        blame: {
          sha: 'abc123',
          commitMessage: '',
          diff: '',
          authorName: 'Author',
          authorEmail: 'a@b.com',
          authorDate: new Date(),
        },
        pr: null,
        issues: [
          { number: 1, title: 'First issue', body: '', state: 'closed', labels: [], comments: [] },
          { number: 2, title: 'Second issue', body: '', state: 'open', labels: [], comments: [] },
        ],
        repoOwner: 'owner',
        repo: 'repo',
      };
      renderer.printSources(trail);
      const output = logOutput.join('\n');
      expect(output).toContain('Issue #1');
      expect(output).toContain('Issue #2');
    });

    it('should truncate long PR titles with an ellipsis', async () => {
      const renderer = await getRenderer();
      const longTitle = 'A'.repeat(60);
      const trail: DecisionTrail = {
        blame: {
          sha: 'abc123',
          commitMessage: '',
          diff: '',
          authorName: 'Author',
          authorEmail: 'a@b.com',
          authorDate: new Date(),
        },
        pr: {
          number: 1,
          title: longTitle,
          body: '',
          labels: [],
          state: 'merged',
          reviewComments: [],
          comments: [],
        },
        issues: [],
        repoOwner: 'owner',
        repo: 'repo',
      };
      renderer.printSources(trail);
      const output = logOutput.join('\n');
      expect(output).toContain('...');
    });

    it('should include GitHub URLs', async () => {
      const renderer = await getRenderer();
      const trail: DecisionTrail = {
        blame: {
          sha: 'abc123',
          commitMessage: 'test',
          diff: '',
          authorName: 'Author',
          authorEmail: 'a@b.com',
          authorDate: new Date(),
        },
        pr: null,
        issues: [],
        repoOwner: 'test-owner',
        repo: 'test-repo',
      };
      renderer.printSources(trail);
      const output = logOutput.join('\n');
      expect(output).toContain('github.com/test-owner/test-repo');
    });

    it('should print the Sources heading', async () => {
      const renderer = await getRenderer();
      const trail: DecisionTrail = {
        blame: {
          sha: 'abc123',
          commitMessage: '',
          diff: '',
          authorName: 'Author',
          authorEmail: 'a@b.com',
          authorDate: new Date(),
        },
        pr: null,
        issues: [],
        repoOwner: 'o',
        repo: 'r',
      };
      renderer.printSources(trail);
      const output = logOutput.join('\n');
      expect(output).toContain('Sources');
    });

    it('should include the full commit URL', async () => {
      const renderer = await getRenderer();
      const trail: DecisionTrail = {
        blame: {
          sha: 'deadbeef1234',
          commitMessage: '',
          diff: '',
          authorName: 'Author',
          authorEmail: 'a@b.com',
          authorDate: new Date(),
        },
        pr: null,
        issues: [],
        repoOwner: 'myorg',
        repo: 'myrepo',
      };
      renderer.printSources(trail);
      const output = logOutput.join('\n');
      expect(output).toContain('github.com/myorg/myrepo/commit/deadbeef1234');
    });

    it('should include PR URL when pr is present', async () => {
      const renderer = await getRenderer();
      const trail: DecisionTrail = {
        blame: {
          sha: 'abc123',
          commitMessage: '',
          diff: '',
          authorName: 'Author',
          authorEmail: 'a@b.com',
          authorDate: new Date(),
        },
        pr: {
          number: 77,
          title: 'some pr',
          body: '',
          labels: [],
          state: 'merged',
          reviewComments: [],
          comments: [],
        },
        issues: [],
        repoOwner: 'myorg',
        repo: 'myrepo',
      };
      renderer.printSources(trail);
      const output = logOutput.join('\n');
      expect(output).toContain('github.com/myorg/myrepo/pull/77');
    });
  });

  describe('startExplanationStream', () => {
    it('should return write and end functions', async () => {
      const renderer = await getRenderer();
      const stream = renderer.startExplanationStream();
      expect(typeof stream.write).toBe('function');
      expect(typeof stream.end).toBe('function');
      stream.end();
    });

    it('should print Explanation header', async () => {
      const renderer = await getRenderer();
      renderer.startExplanationStream();
      const output = logOutput.join('\n');
      expect(output).toContain('Explanation');
    });

    it('should write chunks to stdout via process.stdout.write', async () => {
      const originalWrite = process.stdout.write.bind(process.stdout);
      const written: string[] = [];
      process.stdout.write = (chunk: string | Uint8Array) => {
        written.push(typeof chunk === 'string' ? chunk : String(chunk));
        return true;
      };

      const renderer = await getRenderer();
      const stream = renderer.startExplanationStream();
      stream.write('hello ');
      stream.write('world');
      stream.end();

      process.stdout.write = originalWrite;

      expect(written.join('')).toContain('hello ');
      expect(written.join('')).toContain('world');
    });

    it('should call end without throwing', async () => {
      const renderer = await getRenderer();
      const stream = renderer.startExplanationStream();
      expect(() => stream.end()).not.toThrow();
    });

    it('should print a blank line after the Explanation heading', async () => {
      const renderer = await getRenderer();
      renderer.startExplanationStream();
      // First call: 'Explanation:', second: '' (blank line)
      expect(logOutput.length).toBeGreaterThanOrEqual(2);
      expect(logOutput[1]).toBe('');
    });
  });

  describe('outputJSON', () => {
    it('should output valid JSON', async () => {
      const renderer = await getRenderer();
      const trail: DecisionTrail = {
        blame: {
          sha: 'abc123',
          commitMessage: 'test',
          diff: '',
          authorName: 'Author',
          authorEmail: 'a@b.com',
          authorDate: new Date(),
        },
        pr: { number: 42, title: 'PR', body: '', labels: [], state: 'merged', reviewComments: [], comments: [] },
        issues: [{ number: 10, title: 'Issue', body: '', state: 'closed', labels: [], comments: [] }],
        repoOwner: 'owner',
        repo: 'repo',
      };
      renderer.outputJSON(trail, 'Test explanation');
      const output = logOutput.join('\n');

      // Should be valid JSON
      const parsed = JSON.parse(output);
      expect(parsed).toBeDefined();
    });

    it('should include explanation in JSON', async () => {
      const renderer = await getRenderer();
      const trail: DecisionTrail = {
        blame: { sha: 'abc', commitMessage: '', diff: '', authorName: '', authorEmail: '', authorDate: new Date() },
        pr: null,
        issues: [],
        repoOwner: 'o',
        repo: 'r',
      };
      renderer.outputJSON(trail, 'This is the explanation');
      const output = logOutput.join('\n');
      const parsed = JSON.parse(output);
      expect(parsed.explanation).toBe('This is the explanation');
    });

    it('should include sources in JSON', async () => {
      const renderer = await getRenderer();
      const trail: DecisionTrail = {
        blame: { sha: 'abc123', commitMessage: '', diff: '', authorName: '', authorEmail: '', authorDate: new Date() },
        pr: { number: 99, title: '', body: '', labels: [], state: 'open', reviewComments: [], comments: [] },
        issues: [
          { number: 1, title: '', body: '', state: 'open', labels: [], comments: [] },
          { number: 2, title: '', body: '', state: 'open', labels: [], comments: [] },
        ],
        repoOwner: 'o',
        repo: 'r',
      };
      renderer.outputJSON(trail, 'Explanation');
      const output = logOutput.join('\n');
      const parsed = JSON.parse(output) as ExplainResult;
      expect(parsed.sources.sha).toBe('abc123');
      expect(parsed.sources.prNumber).toBe(99);
      expect(parsed.sources.issueNumbers).toEqual([1, 2]);
    });

    it('should handle null PR in JSON', async () => {
      const renderer = await getRenderer();
      const trail: DecisionTrail = {
        blame: { sha: 'abc', commitMessage: '', diff: '', authorName: '', authorEmail: '', authorDate: new Date() },
        pr: null,
        issues: [],
        repoOwner: 'o',
        repo: 'r',
      };
      renderer.outputJSON(trail, 'Test');
      const output = logOutput.join('\n');
      const parsed = JSON.parse(output) as ExplainResult;
      expect(parsed.sources.prNumber).toBeNull();
    });

    it('should output empty issueNumbers array when no issues', async () => {
      const renderer = await getRenderer();
      const trail: DecisionTrail = {
        blame: { sha: 'abc', commitMessage: '', diff: '', authorName: '', authorEmail: '', authorDate: new Date() },
        pr: null,
        issues: [],
        repoOwner: 'o',
        repo: 'r',
      };
      renderer.outputJSON(trail, 'Test');
      const output = logOutput.join('\n');
      const parsed = JSON.parse(output) as ExplainResult;
      expect(parsed.sources.issueNumbers).toEqual([]);
    });

    it('should produce pretty-printed JSON with indentation', async () => {
      const renderer = await getRenderer();
      const trail: DecisionTrail = {
        blame: { sha: 'abc', commitMessage: '', diff: '', authorName: '', authorEmail: '', authorDate: new Date() },
        pr: null,
        issues: [],
        repoOwner: 'o',
        repo: 'r',
      };
      renderer.outputJSON(trail, 'Test');
      const output = logOutput.join('\n');
      expect(output).toContain('\n');
      expect(output).toContain('  ');
    });

    it('should have exactly the explanation and sources keys at the top level', async () => {
      const renderer = await getRenderer();
      const trail: DecisionTrail = {
        blame: { sha: 'deadbeef', commitMessage: '', diff: '', authorName: '', authorEmail: '', authorDate: new Date() },
        pr: null,
        issues: [],
        repoOwner: 'o',
        repo: 'r',
      };
      renderer.outputJSON(trail, 'my explanation');
      const output = logOutput.join('\n');
      const parsed = JSON.parse(output) as ExplainResult;

      expect(parsed).toHaveProperty('explanation');
      expect(parsed).toHaveProperty('sources');
      expect(parsed.sources).toHaveProperty('sha');
      expect(parsed.sources).toHaveProperty('prNumber');
      expect(parsed.sources).toHaveProperty('issueNumbers');
    });
  });

  describe('printWarning', () => {
    it('should print warning message', async () => {
      const renderer = await getRenderer();
      renderer.printWarning('This is a warning');
      const output = logOutput.join('\n');
      expect(output).toContain('This is a warning');
    });
  });

  describe('printFallbackInfo', () => {
    it('should mention no PR found', async () => {
      const renderer = await getRenderer();
      renderer.printFallbackInfo();
      const output = logOutput.join('\n');
      expect(output).toContain('No PR found');
    });

    it('should mention commit message as fallback context', async () => {
      const renderer = await getRenderer();
      renderer.printFallbackInfo();
      const output = logOutput.join('\n');
      expect(output).toContain('commit');
    });

    it('should write to console.log, not console.error', async () => {
      const renderer = await getRenderer();
      renderer.printFallbackInfo();
      expect(logOutput.length).toBeGreaterThan(0);
      expect(errorOutput.length).toBe(0);
    });
  });

  describe('printPlatformWarning', () => {
    it('should mention the platform', async () => {
      const renderer = await getRenderer();
      renderer.printPlatformWarning('GitLab');
      const output = logOutput.join('\n');
      expect(output).toContain('GitLab');
    });

    it('should mention v2 support', async () => {
      const renderer = await getRenderer();
      renderer.printPlatformWarning('Bitbucket');
      const output = logOutput.join('\n');
      expect(output).toContain('v2');
    });

    it('should correctly embed the platform name passed in', async () => {
      const renderer = await getRenderer();
      renderer.printPlatformWarning('Azure DevOps');
      const output = logOutput.join('\n');
      expect(output).toContain('Azure DevOps');
    });

    it('should write to console.log, not console.error', async () => {
      const renderer = await getRenderer();
      renderer.printPlatformWarning('GitLab');
      expect(logOutput.length).toBeGreaterThan(0);
      expect(errorOutput.length).toBe(0);
    });
  });

  describe('createSpinner', () => {
    it('should return an object with stop and update methods', async () => {
      const renderer = await getRenderer();
      const spinner = renderer.createSpinner('Loading...');
      expect(typeof spinner.stop).toBe('function');
      expect(typeof spinner.update).toBe('function');
      spinner.stop();
    });

    it('should print the initial message in non-TTY mode', async () => {
      const renderer = await getRenderer();
      renderer.createSpinner('Test message');
      const output = logOutput.join('\n');
      expect(output).toContain('Test message');
    });

    it('should not throw when stop is called with success=true', async () => {
      const renderer = await getRenderer();
      const spinner = renderer.createSpinner('Working...');
      expect(() => spinner.stop(true)).not.toThrow();
    });

    it('should not throw when stop is called with success=false', async () => {
      const renderer = await getRenderer();
      const spinner = renderer.createSpinner('Working...');
      expect(() => spinner.stop(false)).not.toThrow();
    });

    it('should not throw when stop is called with no argument', async () => {
      const renderer = await getRenderer();
      const spinner = renderer.createSpinner('Working...');
      expect(() => spinner.stop()).not.toThrow();
    });

    it('should not throw when update is called with a new message', async () => {
      const renderer = await getRenderer();
      const spinner = renderer.createSpinner('Initial message');
      expect(() => spinner.update('Updated message')).not.toThrow();
      spinner.stop();
    });

    it('should print updated message via console.log in non-TTY mode', async () => {
      const renderer = await getRenderer();
      const spinner = renderer.createSpinner('First');
      spinner.update('Updated value');
      const output = logOutput.join('\n');
      expect(output).toContain('Updated value');
      spinner.stop();
    });
  });
});
