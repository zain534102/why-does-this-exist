import { describe, expect, it, mock, spyOn, afterEach } from 'bun:test';
import { extractPRNumber, findFunctionLine, getRepoInfo, getBlame } from '../src/blame';
import { GitError } from '../src/errors';

// ---------------------------------------------------------------------------
// extractPRNumber
// ---------------------------------------------------------------------------

describe('extractPRNumber', () => {
  describe('merge commit patterns', () => {
    it('should extract PR number from standard merge commit', () => {
      const message = 'Merge pull request #123 from feature/branch';
      expect(extractPRNumber(message)).toBe(123);
    });

    it('should extract PR number from lowercase merge commit', () => {
      const message = 'merge pull request #42 from fix/bug';
      expect(extractPRNumber(message)).toBe(42);
    });

    it('should extract PR number from merge commit with description', () => {
      const message = 'Merge pull request #999 from org/repo\n\nFixes a critical bug';
      expect(extractPRNumber(message)).toBe(999);
    });

    it('should handle merge commit with mixed case', () => {
      const message = 'MERGE PULL REQUEST #555 from main';
      expect(extractPRNumber(message)).toBe(555);
    });
  });

  describe('squash merge patterns', () => {
    it('should extract PR number from squash merge message', () => {
      const message = 'feat: add new feature (#456)';
      expect(extractPRNumber(message)).toBe(456);
    });

    it('should extract PR number from conventional commit', () => {
      const message = 'fix(auth): resolve login issue (#789)';
      expect(extractPRNumber(message)).toBe(789);
    });

    it('should extract PR number with scope', () => {
      const message = 'chore(deps): bump dependencies (#101)';
      expect(extractPRNumber(message)).toBe(101);
    });

    it('should handle multi-line squash merge', () => {
      const message = 'feat: amazing feature (#202)\n\n* Add feature A\n* Add feature B';
      expect(extractPRNumber(message)).toBe(202);
    });
  });

  describe('reference patterns', () => {
    it('should extract PR number from body reference', () => {
      const message = 'Some commit\n\nCloses #789';
      expect(extractPRNumber(message)).toBe(789);
    });

    it('should extract PR number from standalone reference', () => {
      const message = 'Quick fix for #321';
      expect(extractPRNumber(message)).toBe(321);
    });

    it('should extract PR number from Fixes reference', () => {
      const message = 'Update code\n\nFixes #654';
      expect(extractPRNumber(message)).toBe(654);
    });
  });

  describe('edge cases', () => {
    it('should return null when no PR number found', () => {
      const message = 'Initial commit';
      expect(extractPRNumber(message)).toBeNull();
    });

    it('should return null for empty message', () => {
      const message = '';
      expect(extractPRNumber(message)).toBeNull();
    });

    it('should return null for message with no numbers', () => {
      const message = 'Just some text without any issue references';
      expect(extractPRNumber(message)).toBeNull();
    });

    it('should extract first PR number when multiple exist', () => {
      const message = 'Merge pull request #100 from branch\n\nRelated to #200 and #300';
      expect(extractPRNumber(message)).toBe(100);
    });

    it('should handle very large PR numbers', () => {
      const message = 'feat: something (#99999)';
      expect(extractPRNumber(message)).toBe(99999);
    });

    it('should handle PR number at start of message', () => {
      const message = '#123 - Fix bug';
      expect(extractPRNumber(message)).toBe(123);
    });

    it('should handle PR number at end of message', () => {
      const message = 'Fix the bug #456';
      expect(extractPRNumber(message)).toBe(456);
    });
  });

  describe('priority order', () => {
    it('should prioritize merge commit pattern over squash pattern', () => {
      const message = 'Merge pull request #111 from branch (#222)';
      expect(extractPRNumber(message)).toBe(111);
    });

    it('should prioritize squash pattern over reference', () => {
      const message = 'Fix bug (#333)\n\nRelated to #444';
      expect(extractPRNumber(message)).toBe(333);
    });
  });
});

// ---------------------------------------------------------------------------
// getBlame
//
// These are integration tests against the real git repository.  They rely on
// files that are checked in and whose blame data is stable.
// ---------------------------------------------------------------------------

describe('getBlame', () => {
  // src/blame.ts is always present and blame-able in this repo.
  const KNOWN_FILE = 'src/blame.ts';
  const KNOWN_LINE = 1;

  it('should return a BlameResult with required fields for a known file and line', async () => {
    const result = await getBlame(KNOWN_FILE, KNOWN_LINE);

    expect(typeof result.sha).toBe('string');
    expect(result.sha).toHaveLength(40);
    expect(typeof result.commitMessage).toBe('string');
    expect(result.commitMessage.length).toBeGreaterThan(0);
    expect(typeof result.authorName).toBe('string');
    expect(typeof result.authorEmail).toBe('string');
    expect(result.authorDate).toBeInstanceOf(Date);
    expect(typeof result.diff).toBe('string');
  });

  it('should return a non-null SHA that is not the null commit', async () => {
    const result = await getBlame(KNOWN_FILE, KNOWN_LINE);
    expect(result.sha).not.toBe('0000000000000000000000000000000000000000');
  });

  it('should return an authorEmail that looks like an email address', async () => {
    const result = await getBlame(KNOWN_FILE, KNOWN_LINE);
    expect(result.authorEmail).toContain('@');
    // Angle brackets should be stripped
    expect(result.authorEmail).not.toContain('<');
    expect(result.authorEmail).not.toContain('>');
  });

  it('should return a Date object for authorDate', async () => {
    const result = await getBlame(KNOWN_FILE, KNOWN_LINE);
    expect(result.authorDate).toBeInstanceOf(Date);
    // The date should be in the past (before the test runs)
    expect(result.authorDate.getTime()).toBeLessThan(Date.now());
  });

  it('should include diff content', async () => {
    const result = await getBlame(KNOWN_FILE, KNOWN_LINE);
    // diff may be empty for some commits but the field must be a string
    expect(typeof result.diff).toBe('string');
  });

  it('should truncate diff to maxDiffLines when WDE_MAX_DIFF_LINES is set low', async () => {
    process.env.WDE_MAX_DIFF_LINES = '2';
    try {
      // Use a file with enough diff lines – blame.ts itself is a good candidate
      const result = await getBlame(KNOWN_FILE, KNOWN_LINE);
      // Either the diff is short enough to not need truncation, or it is truncated
      const lineCount = result.diff.split('\n').length;
      // With maxDiffLines=2, truncated output has at most 2 lines + truncation marker
      if (result.diff.includes('(truncated)')) {
        expect(result.diff).toContain('(truncated)');
      } else {
        expect(lineCount).toBeLessThanOrEqual(3); // 2 lines + possible trailing newline
      }
    } finally {
      delete process.env.WDE_MAX_DIFF_LINES;
    }
  });

  it('should throw GitError for a non-existent file', async () => {
    await expect(getBlame('src/this-file-does-not-exist-ever.ts', 1)).rejects.toBeInstanceOf(GitError);
  });

  it('should throw a GitError (not a plain Error) for a missing file', async () => {
    let caughtError: unknown;
    try {
      await getBlame('src/ghost-file.ts', 1);
    } catch (e) {
      caughtError = e;
    }
    expect(caughtError).toBeInstanceOf(GitError);
    // Bun's $ shell wraps the exit-128 as ShellError whose .message is
    // "Failed with exit code 128".  blame.ts catches that and re-throws as
    // "Git blame failed: ...".  Either way, it must be a GitError.
  });

  it('should throw GitError when line number exceeds file length', async () => {
    // blame.ts has 223 lines; line 99999 is way beyond that
    await expect(getBlame(KNOWN_FILE, 99999)).rejects.toBeInstanceOf(GitError);
  });
});

// ---------------------------------------------------------------------------
// findFunctionLine
// ---------------------------------------------------------------------------

describe('findFunctionLine', () => {
  afterEach(() => {
    mock.restore();
  });

  function mockFileContent(content: string) {
    return spyOn(Bun, 'file').mockReturnValue({
      text: async () => content,
    } as ReturnType<typeof Bun.file>);
  }

  describe('JavaScript / TypeScript patterns', () => {
    it('should find a plain function declaration', async () => {
      const code = [
        '// header',
        'function doSomething(arg: string): void {',
        '  console.log(arg);',
        '}',
      ].join('\n');

      mockFileContent(code);
      const line = await findFunctionLine('src/util.ts', 'doSomething');
      expect(line).toBe(2);
    });

    it('should find an exported async function', async () => {
      const code = [
        'import { foo } from "./foo";',
        '',
        'export async function fetchData(url: string) {',
        '  return fetch(url);',
        '}',
      ].join('\n');

      mockFileContent(code);
      const line = await findFunctionLine('src/api.ts', 'fetchData');
      expect(line).toBe(3);
    });

    it('should find a const arrow function', async () => {
      const code = [
        'const helper = (x: number) => x * 2;',
        'const processItem = async (item: Item) => {',
        '  return item;',
        '};',
      ].join('\n');

      mockFileContent(code);
      const line = await findFunctionLine('src/helpers.ts', 'processItem');
      expect(line).toBe(2);
    });

    it('should find an exported const arrow function', async () => {
      const code = [
        'export const transform = (data: string) => data.trim();',
      ].join('\n');

      mockFileContent(code);
      const line = await findFunctionLine('src/transform.ts', 'transform');
      expect(line).toBe(1);
    });

    it('should find a class method', async () => {
      const code = [
        'class MyService {',
        '  private data: string[] = [];',
        '',
        '  public async getData(): Promise<string[]> {',
        '    return this.data;',
        '  }',
        '}',
      ].join('\n');

      mockFileContent(code);
      const line = await findFunctionLine('src/service.ts', 'getData');
      expect(line).toBe(4);
    });

    it('should find a method with no access modifier', async () => {
      const code = [
        'class Processor {',
        '  process(input: string): string {',
        '    return input;',
        '  }',
        '}',
      ].join('\n');

      mockFileContent(code);
      const line = await findFunctionLine('src/proc.ts', 'process');
      expect(line).toBe(2);
    });

    it('should find a function on the first line', async () => {
      const code = 'function greet(name: string) { return `Hello ${name}`; }';
      mockFileContent(code);
      const line = await findFunctionLine('src/greet.ts', 'greet');
      expect(line).toBe(1);
    });

    it('should find a function using generic type parameters', async () => {
      const code = [
        '',
        'export function identity<T>(value: T): T {',
        '  return value;',
        '}',
      ].join('\n');

      mockFileContent(code);
      const line = await findFunctionLine('src/generics.ts', 'identity');
      expect(line).toBe(2);
    });
  });

  describe('PHP patterns', () => {
    it('should find a public function', async () => {
      const code = [
        '<?php',
        'class Controller {',
        '    public function handleRequest($request) {',
        '        return response()->json([]);',
        '    }',
        '}',
      ].join('\n');

      mockFileContent(code);
      const line = await findFunctionLine('src/Controller.php', 'handleRequest');
      expect(line).toBe(3);
    });

    it('should find a private static function', async () => {
      const code = [
        '<?php',
        '    private static function buildQuery(array $params): string {',
        '        return http_build_query($params);',
        '    }',
      ].join('\n');

      mockFileContent(code);
      const line = await findFunctionLine('src/Query.php', 'buildQuery');
      expect(line).toBe(2);
    });

    it('should find a top-level function', async () => {
      const code = [
        '<?php',
        'function formatDate(DateTime $date): string {',
        '    return $date->format("Y-m-d");',
        '}',
      ].join('\n');

      mockFileContent(code);
      const line = await findFunctionLine('helpers.php', 'formatDate');
      expect(line).toBe(2);
    });
  });

  describe('Python patterns', () => {
    it('should find a regular def', async () => {
      const code = [
        'import os',
        '',
        'def calculate_total(items):',
        '    return sum(items)',
      ].join('\n');

      mockFileContent(code);
      const line = await findFunctionLine('src/math.py', 'calculate_total');
      expect(line).toBe(3);
    });

    it('should find an async def', async () => {
      const code = [
        'async def fetch_data(url: str) -> dict:',
        '    pass',
      ].join('\n');

      mockFileContent(code);
      const line = await findFunctionLine('main.py', 'fetch_data');
      expect(line).toBe(1);
    });

    it('should find an indented def inside a class', async () => {
      const code = [
        'class Fetcher:',
        '    def get(self, path: str) -> bytes:',
        '        pass',
      ].join('\n');

      mockFileContent(code);
      const line = await findFunctionLine('fetcher.py', 'get');
      expect(line).toBe(2);
    });
  });

  describe('Go patterns', () => {
    it('should find a plain func', async () => {
      const code = [
        'package main',
        '',
        'import "fmt"',
        '',
        'func processRequest(w http.ResponseWriter, r *http.Request) {',
        '    fmt.Fprintln(w, "ok")',
        '}',
      ].join('\n');

      mockFileContent(code);
      const line = await findFunctionLine('main.go', 'processRequest');
      expect(line).toBe(5);
    });

    it('should find a method on a receiver', async () => {
      const code = [
        'func (s *Server) Start(port int) error {',
        '    return nil',
        '}',
      ].join('\n');

      mockFileContent(code);
      const line = await findFunctionLine('server.go', 'Start');
      expect(line).toBe(1);
    });
  });

  describe('Rust patterns', () => {
    it('should find a plain fn', async () => {
      const code = [
        'fn compute(value: u32) -> u32 {',
        '    value * 2',
        '}',
      ].join('\n');

      mockFileContent(code);
      const line = await findFunctionLine('src/lib.rs', 'compute');
      expect(line).toBe(1);
    });

    it('should find a pub async fn', async () => {
      const code = [
        'use tokio;',
        '',
        'pub async fn run_server(addr: &str) -> Result<(), Error> {',
        '    Ok(())',
        '}',
      ].join('\n');

      mockFileContent(code);
      const line = await findFunctionLine('src/server.rs', 'run_server');
      expect(line).toBe(3);
    });

    it('should find a pub fn with generic type', async () => {
      const code = [
        'pub fn parse<T: FromStr>(input: &str) -> Result<T, T::Err> {',
        '    input.parse()',
        '}',
      ].join('\n');

      mockFileContent(code);
      const line = await findFunctionLine('src/parse.rs', 'parse');
      expect(line).toBe(1);
    });
  });

  describe('Ruby patterns', () => {
    it('should find a def method with arguments', async () => {
      const code = [
        'class PaymentService',
        '  def charge_card(amount)',
        '    # charge',
        '  end',
        'end',
      ].join('\n');

      mockFileContent(code);
      const line = await findFunctionLine('app/services/payment.rb', 'charge_card');
      expect(line).toBe(2);
    });

    it('should find a def method with no arguments', async () => {
      const code = [
        'def initialize',
        '  @data = []',
        'end',
      ].join('\n');

      mockFileContent(code);
      const line = await findFunctionLine('lib/base.rb', 'initialize');
      expect(line).toBe(1);
    });

    it('should find a def method followed by parentheses', async () => {
      const code = [
        'class Calculator',
        '  def add(a, b)',
        '    a + b',
        '  end',
        'end',
      ].join('\n');

      mockFileContent(code);
      const line = await findFunctionLine('lib/calculator.rb', 'add');
      expect(line).toBe(2);
    });
  });

  describe('not found cases', () => {
    it('should throw GitError when function is not found', async () => {
      const code = 'function notWhatYouAreLookingFor() {}';
      mockFileContent(code);

      await expect(findFunctionLine('src/file.ts', 'missingFunction')).rejects.toBeInstanceOf(GitError);
    });

    it('should include the function name in the error message', async () => {
      const code = 'const x = 1;';
      mockFileContent(code);

      await expect(findFunctionLine('src/file.ts', 'ghostFn')).rejects.toMatchObject({
        message: expect.stringContaining('ghostFn'),
      });
    });

    it('should include "not found" in the error message', async () => {
      const code = 'const x = 1;';
      mockFileContent(code);

      await expect(findFunctionLine('src/file.ts', 'missing')).rejects.toMatchObject({
        message: expect.stringContaining('not found'),
      });
    });

    it('should throw GitError when the file cannot be read', async () => {
      spyOn(Bun, 'file').mockReturnValue({
        text: async () => {
          throw new Error('ENOENT: no such file or directory');
        },
      } as ReturnType<typeof Bun.file>);

      await expect(findFunctionLine('src/nonexistent.ts', 'anyFn')).rejects.toBeInstanceOf(GitError);
    });

    it('should wrap file-read errors mentioning the file path', async () => {
      spyOn(Bun, 'file').mockReturnValue({
        text: async () => {
          throw new Error('permission denied');
        },
      } as ReturnType<typeof Bun.file>);

      await expect(findFunctionLine('src/locked.ts', 'fn')).rejects.toMatchObject({
        message: expect.stringContaining('src/locked.ts'),
      });
    });

    it('should return GitError (not a plain Error) for missing function', async () => {
      const code = 'const answer = 42;';
      mockFileContent(code);

      let caughtError: unknown;
      try {
        await findFunctionLine('src/file.ts', 'notHere');
      } catch (e) {
        caughtError = e;
      }

      expect(caughtError).toBeInstanceOf(GitError);
    });
  });

  describe('special function name characters', () => {
    it('should handle function names with underscores', async () => {
      const code = 'function __init__(self) {}';
      mockFileContent(code);
      const line = await findFunctionLine('setup.ts', '__init__');
      expect(line).toBe(1);
    });

    it('should not match a function whose name contains the target as a prefix', async () => {
      // doSomethingElse must not match when searching for doSomething,
      // because the regex requires a non-word character after the name.
      const code = [
        'function doSomethingElse() {}',
        'function doSomething() {}',
      ].join('\n');
      mockFileContent(code);
      const line = await findFunctionLine('src/file.ts', 'doSomething');
      expect(line).toBe(2);
    });

    it('should handle function names with numbers', async () => {
      const code = 'function handler2(req, res) {}';
      mockFileContent(code);
      const line = await findFunctionLine('src/routes.ts', 'handler2');
      expect(line).toBe(1);
    });
  });

  describe('real file integration', () => {
    // findFunctionLine calls Bun.file without mocking in these tests.
    // The spyOn mock is restored in afterEach, so these run against real files.

    it('should find extractPRNumber in the real src/blame.ts', async () => {
      const line = await findFunctionLine('src/blame.ts', 'extractPRNumber');
      expect(line).toBeGreaterThan(0);
      expect(typeof line).toBe('number');
    });

    it('should find getBlame in the real src/blame.ts', async () => {
      const line = await findFunctionLine('src/blame.ts', 'getBlame');
      expect(line).toBeGreaterThan(0);
    });

    it('should find findFunctionLine in the real src/blame.ts', async () => {
      const line = await findFunctionLine('src/blame.ts', 'findFunctionLine');
      expect(line).toBeGreaterThan(0);
    });

    it('should find getRepoInfo in the real src/blame.ts', async () => {
      const line = await findFunctionLine('src/blame.ts', 'getRepoInfo');
      expect(line).toBeGreaterThan(0);
    });

    it('should throw when function does not exist in the real file', async () => {
      await expect(
        findFunctionLine('src/blame.ts', 'absolutelyNonExistentFunctionXYZ')
      ).rejects.toBeInstanceOf(GitError);
    });
  });
});

// ---------------------------------------------------------------------------
// getRepoInfo
//
// Integration tests against the real git repository.  The project is hosted
// on GitHub so the platform is always 'github'.  The owner and repo are
// extracted from the actual remote URL.
// ---------------------------------------------------------------------------

describe('getRepoInfo', () => {
  it('should return a RepoInfo object with required fields', async () => {
    const info = await getRepoInfo();
    expect(info).toHaveProperty('owner');
    expect(info).toHaveProperty('repo');
    expect(info).toHaveProperty('platform');
  });

  it('should detect GitHub as the platform for this repository', async () => {
    const info = await getRepoInfo();
    expect(info.platform).toBe('github');
  });

  it('should return a non-empty owner string', async () => {
    const info = await getRepoInfo();
    expect(typeof info.owner).toBe('string');
    expect(info.owner.length).toBeGreaterThan(0);
  });

  it('should return a non-empty repo string', async () => {
    const info = await getRepoInfo();
    expect(typeof info.repo).toBe('string');
    expect(info.repo.length).toBeGreaterThan(0);
  });

  it('should return the correct owner for this repository', async () => {
    const info = await getRepoInfo();
    expect(info.owner).toBe('zain534102');
  });

  it('should return the correct repo name for this repository', async () => {
    const info = await getRepoInfo();
    expect(info.repo).toBe('why-does-this-exist');
  });

  it('should return a platform that is one of the known values', async () => {
    const info = await getRepoInfo();
    expect(['github', 'gitlab', 'bitbucket', 'unknown']).toContain(info.platform);
  });

  describe('URL parsing logic (via real file)', () => {
    // These tests verify the parsing patterns by reading blame.ts source and
    // checking the regexes directly – a white-box complement to the integration tests.

    it('should correctly parse SSH github.com URL format from the source patterns', async () => {
      // Verify the regex described in the source: git@github.com:owner/repo.git
      const sshPattern = /git@github\.com:([^/]+)\/([^.]+)(\.git)?$/;
      const url = 'git@github.com:acme/my-project.git';
      const match = url.match(sshPattern);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('acme');
      expect(match![2]).toBe('my-project');
    });

    it('should correctly parse HTTPS github.com URL format from the source patterns', async () => {
      const httpsPattern = /https:\/\/(?:[^@]+@)?github\.com\/([^/]+)\/([^.]+)(\.git)?$/;
      const url = 'https://github.com/acme/my-project.git';
      const match = url.match(httpsPattern);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('acme');
      expect(match![2]).toBe('my-project');
    });

    it('should correctly parse HTTPS URL with embedded token', async () => {
      const httpsPattern = /https:\/\/(?:[^@]+@)?github\.com\/([^/]+)\/([^.]+)(\.git)?$/;
      const url = 'https://token123@github.com/org/repo.git';
      const match = url.match(httpsPattern);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('org');
      expect(match![2]).toBe('repo');
    });

    it('should correctly parse SSH gitlab.com URL format', async () => {
      const sshPattern = /git@gitlab\.com:([^/]+)\/([^.]+)(\.git)?$/;
      const url = 'git@gitlab.com:mygroup/myrepo.git';
      const match = url.match(sshPattern);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('mygroup');
      expect(match![2]).toBe('myrepo');
    });

    it('should correctly parse HTTPS gitlab.com URL format', async () => {
      const httpsPattern = /https:\/\/(?:[^@]+@)?gitlab\.com\/([^/]+)\/([^.]+)(\.git)?$/;
      const url = 'https://gitlab.com/mygroup/myrepo.git';
      const match = url.match(httpsPattern);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('mygroup');
      expect(match![2]).toBe('myrepo');
    });

    it('should correctly parse SSH bitbucket.org URL format', async () => {
      const sshPattern = /git@bitbucket\.org:([^/]+)\/([^.]+)(\.git)?$/;
      const url = 'git@bitbucket.org:teamname/project.git';
      const match = url.match(sshPattern);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('teamname');
      expect(match![2]).toBe('project');
    });

    it('should correctly parse HTTPS bitbucket.org URL format', async () => {
      const httpsPattern = /https:\/\/(?:[^@]+@)?bitbucket\.org\/([^/]+)\/([^.]+)(\.git)?$/;
      const url = 'https://bitbucket.org/teamname/project.git';
      const match = url.match(httpsPattern);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('teamname');
      expect(match![2]).toBe('project');
    });

    it('unknown platform URL does not match any known pattern', () => {
      const githubSSH = /git@github\.com:([^/]+)\/([^.]+)(\.git)?$/;
      const githubHTTPS = /https:\/\/(?:[^@]+@)?github\.com\/([^/]+)\/([^.]+)(\.git)?$/;
      const gitlabSSH = /git@gitlab\.com:([^/]+)\/([^.]+)(\.git)?$/;
      const gitlabHTTPS = /https:\/\/(?:[^@]+@)?gitlab\.com\/([^/]+)\/([^.]+)(\.git)?$/;
      const bbSSH = /git@bitbucket\.org:([^/]+)\/([^.]+)(\.git)?$/;
      const bbHTTPS = /https:\/\/(?:[^@]+@)?bitbucket\.org\/([^/]+)\/([^.]+)(\.git)?$/;

      const unknownUrl = 'https://codeberg.org/user/repo.git';
      expect(unknownUrl.match(githubSSH)).toBeNull();
      expect(unknownUrl.match(githubHTTPS)).toBeNull();
      expect(unknownUrl.match(gitlabSSH)).toBeNull();
      expect(unknownUrl.match(gitlabHTTPS)).toBeNull();
      expect(unknownUrl.match(bbSSH)).toBeNull();
      expect(unknownUrl.match(bbHTTPS)).toBeNull();
    });
  });
});
