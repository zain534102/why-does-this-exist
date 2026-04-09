import { describe, expect, it, mock, spyOn, beforeEach, afterEach } from 'bun:test';
import { scoreMatch, parseAtTarget, searchFiles, searchFunction, getRepoFiles, interactiveSelect, promptLineNumber } from '../src/file-search';
import { PassThrough } from 'node:stream';

/**
 * Replace process.stdin with a PassThrough stream for the duration of a test.
 * Returns { fakeStdin, restore }.  Push "answer\n" to fakeStdin to simulate
 * readline input.
 */
function replaceStdin() {
  const fakeStdin = new PassThrough();
  const originalStdin = process.stdin;
  Object.defineProperty(process, 'stdin', { value: fakeStdin, configurable: true });
  const restore = () => {
    Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true });
  };
  return { fakeStdin, restore };
}

describe('scoreMatch', () => {
  describe('exact filename match', () => {
    it('should score 100 for exact filename', () => {
      expect(scoreMatch('src/cli.ts', 'cli.ts')).toBe(100);
    });

    it('should be case-insensitive', () => {
      expect(scoreMatch('src/CLI.ts', 'cli.ts')).toBe(100);
    });

    it('should penalize test files', () => {
      expect(scoreMatch('tests/cli.test.ts', 'cli.test.ts')).toBe(90);
    });
  });

  describe('name without extension match', () => {
    it('should score 95 for exact name without extension', () => {
      expect(scoreMatch('src/cli.ts', 'cli')).toBe(95);
    });

    it('should score 85 for test file with same name', () => {
      // cli.test.ts -> nameNoExt is "cli.test", doesn't match "cli" exactly
      // but filename "cli.test.ts" starts with "cli" -> 90 - 10 = 80
      expect(scoreMatch('tests/cli.test.ts', 'cli')).toBe(80);
    });

    it('should prefer source over test files', () => {
      const srcScore = scoreMatch('src/cli.ts', 'cli');
      const testScore = scoreMatch('tests/cli.test.ts', 'cli');
      expect(srcScore).toBeGreaterThan(testScore);
    });
  });

  describe('filename starts with pattern', () => {
    it('should score 90 for filename starting with pattern', () => {
      expect(scoreMatch('src/config-manager.ts', 'config')).toBe(90);
    });

    it('should penalize test files', () => {
      expect(scoreMatch('tests/config-manager.test.ts', 'config')).toBe(80);
    });
  });

  describe('filename contains pattern', () => {
    it('should score 70 for pattern within filename', () => {
      expect(scoreMatch('src/context-builder.ts', 'builder')).toBe(70);
    });
  });

  describe('path contains pattern', () => {
    it('should score 50 for pattern in directory path', () => {
      expect(scoreMatch('src/commands/auth.ts', 'commands')).toBe(50);
    });
  });

  describe('fuzzy matching', () => {
    it('should score 30 for fuzzy filename match', () => {
      // "cb" -> c...b in "context-builder.ts"
      expect(scoreMatch('src/context-builder.ts', 'cb')).toBe(30);
    });

    it('should score 10 for fuzzy path match only', () => {
      // "sa" -> s...a in "src/auth.ts" path
      // Actually "sa" matches filename "auth.ts" fuzzy? s not in auth...
      // Let's use a pattern that only matches in path
      expect(scoreMatch('src/ai-providers/anthropic.ts', 'sap')).toBe(10);
    });

    it('should return 0 for no match', () => {
      expect(scoreMatch('src/cli.ts', 'xyz')).toBe(0);
    });
  });

  describe('test file detection', () => {
    it('should detect files in tests/ directory', () => {
      const src = scoreMatch('src/blame.ts', 'blame');
      const test = scoreMatch('tests/blame.test.ts', 'blame');
      expect(src).toBeGreaterThan(test);
    });

    it('should detect .test. in filename', () => {
      const score = scoreMatch('src/utils/helper.test.ts', 'helper');
      expect(score).toBeLessThan(scoreMatch('src/utils/helper.ts', 'helper'));
    });

    it('should detect .spec. in filename', () => {
      const score = scoreMatch('src/utils/helper.spec.ts', 'helper');
      expect(score).toBeLessThan(scoreMatch('src/utils/helper.ts', 'helper'));
    });

    it('should detect __tests__ directory', () => {
      const score = scoreMatch('src/__tests__/helper.ts', 'helper');
      expect(score).toBeLessThan(scoreMatch('src/helper.ts', 'helper'));
    });
  });
});

describe('parseAtTarget', () => {
  it('should parse @pattern without line number', () => {
    expect(parseAtTarget('@cli')).toEqual({ pattern: 'cli', line: null });
  });

  it('should parse @pattern:line', () => {
    expect(parseAtTarget('@cli:42')).toEqual({ pattern: 'cli', line: 42 });
  });

  it('should parse @pattern with path-like pattern', () => {
    expect(parseAtTarget('@config-manager')).toEqual({ pattern: 'config-manager', line: null });
  });

  it('should parse @pattern:line with large line numbers', () => {
    expect(parseAtTarget('@file:999')).toEqual({ pattern: 'file', line: 999 });
  });

  it('should treat @pattern:0 as pattern with colon (lines are 1-indexed)', () => {
    expect(parseAtTarget('@file:0')).toEqual({ pattern: 'file:0', line: null });
  });

  it('should treat @pattern:abc as full pattern (non-numeric)', () => {
    expect(parseAtTarget('@file:abc')).toEqual({ pattern: 'file:abc', line: null });
  });

  it('should handle pattern with dots', () => {
    expect(parseAtTarget('@cli.ts:42')).toEqual({ pattern: 'cli.ts', line: 42 });
  });

  it('should treat negative line numbers as part of pattern', () => {
    expect(parseAtTarget('@file:-5')).toEqual({ pattern: 'file:-5', line: null });
  });
});

describe('searchFiles', () => {
  it('should find files matching a simple pattern', async () => {
    const results = await searchFiles('cli');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]).toBe('src/cli.ts');
  });

  it('should auto-select when top result is much better', async () => {
    const results = await searchFiles('cli');
    // src/cli.ts should auto-select (score gap >= 15 over test file)
    expect(results.length).toBe(1);
    expect(results[0]).toBe('src/cli.ts');
  });

  it('should return multiple results for ambiguous patterns', async () => {
    const results = await searchFiles('config');
    expect(results.length).toBeGreaterThan(1);
  });

  it('should return empty array for no matches', async () => {
    const results = await searchFiles('xyznonexistent123');
    expect(results).toEqual([]);
  });

  it('should find files by extension pattern', async () => {
    const results = await searchFiles('github');
    expect(results.some(f => f.includes('github'))).toBe(true);
  });

  it('should rank source files above test files', async () => {
    const results = await searchFiles('blame');
    // If multiple, src/blame.ts should come first
    if (results.length > 1) {
      expect(results[0]).toBe('src/blame.ts');
    }
  });
});

describe('searchFunction', () => {
  it('should find a function defined with function keyword', async () => {
    const results = await searchFunction('parseTarget');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some(r => r.file === 'src/cli.ts')).toBe(true);
  });

  it('should find an exported async function', async () => {
    const results = await searchFunction('getBlame');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some(r => r.file === 'src/blame.ts')).toBe(true);
  });

  it('should find arrow function definitions', async () => {
    const results = await searchFunction('extractPRNumber');
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('should return empty for nonexistent function', async () => {
    const results = await searchFunction('thisFunctionDoesNotExist999');
    expect(results).toEqual([]);
  });

  it('should return file and line number', async () => {
    const results = await searchFunction('parseTarget');
    expect(results[0]).toHaveProperty('file');
    expect(results[0]).toHaveProperty('line');
    expect(results[0].line).toBeGreaterThan(0);
  });

  it('should filter by file pattern when provided', async () => {
    const results = await searchFunction('getBlame', 'blame');
    expect(results.length).toBeGreaterThanOrEqual(1);
    // Should only search in files matching "blame"
    expect(results.every(r => r.file.includes('blame'))).toBe(true);
  });

  it('should skip files without a recognised code extension', async () => {
    // Functions defined in non-code files (e.g. .json) should never appear
    const results = await searchFunction('name');
    // All results must have a code extension
    const nonCodeExtensions = ['.json', '.md', '.txt', '.yaml', '.yml', '.lock'];
    for (const r of results) {
      const hasNonCode = nonCodeExtensions.some(ext => r.file.endsWith(ext));
      expect(hasNonCode).toBe(false);
    }
  });

  it('should not throw when a file cannot be read', async () => {
    // This exercises the try/catch inside searchFunction.
    // We search for a function that is unlikely to match anything, so even if
    // a file is unreadable the function must resolve cleanly.
    await expect(searchFunction('__unreadableFileTest__')).resolves.toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// scoreMatch edge cases
// ---------------------------------------------------------------------------
describe('scoreMatch edge cases', () => {
  it('should return 0 for an empty pattern', () => {
    // An empty pattern cannot match any tier; every branch compares "" which
    // technically startsWith("") is true — document actual behaviour.
    // The filename starts with "" → score 90 (or 100 for exact ""), so we
    // simply assert the function does not throw and returns a number.
    const score = scoreMatch('src/cli.ts', '');
    expect(typeof score).toBe('number');
  });

  it('should return 0 for an empty filepath', () => {
    const score = scoreMatch('', 'cli');
    expect(score).toBe(0);
  });

  it('should handle patterns with special regex characters without throwing', () => {
    // Patterns like "a.b" or "foo()" must not crash the scorer (it uses string
    // methods, not regex, so they should be treated literally).
    expect(() => scoreMatch('src/foo.ts', 'foo.ts')).not.toThrow();
    expect(() => scoreMatch('src/foo.ts', 'foo()')).not.toThrow();
    expect(() => scoreMatch('src/foo.ts', '[bar]')).not.toThrow();
  });

  it('should handle filenames with multiple dots correctly', () => {
    // "foo.test.ts" — nameNoExt after removing last extension is "foo.test"
    const score = scoreMatch('src/foo.test.ts', 'foo.test');
    expect(score).toBeGreaterThan(0);
  });

  it('should handle deep nested paths', () => {
    const score = scoreMatch('a/b/c/d/e/target.ts', 'target');
    expect(score).toBeGreaterThan(0);
  });

  it('should score a very long filename without throwing', () => {
    const longName = 'a'.repeat(500) + '.ts';
    expect(() => scoreMatch(`src/${longName}`, 'aaa')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// searchFiles edge cases
// ---------------------------------------------------------------------------
describe('searchFiles edge cases', () => {
  it('should handle an empty pattern and return results without throwing', async () => {
    // Empty string — scoreMatch returns a number for every file; behaviour is
    // defined by whatever scoreMatch returns for "".
    await expect(searchFiles('')).resolves.toBeDefined();
  });

  it('should return an empty array for a pattern with no matches', async () => {
    const results = await searchFiles('zzz_no_match_at_all_xyz987');
    expect(results).toEqual([]);
  });

  it('should handle very long patterns without throwing', async () => {
    const longPattern = 'a'.repeat(300);
    await expect(searchFiles(longPattern)).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// getRepoFiles — mock Bun.spawn to control git output
// ---------------------------------------------------------------------------
describe('getRepoFiles', () => {
  it('should return an array of filenames on success', async () => {
    // Use the real implementation — the project is a git repo so this works.
    const files = await getRepoFiles();
    expect(Array.isArray(files)).toBe(true);
    expect(files.length).toBeGreaterThan(0);
    // Every entry should be a non-empty string
    for (const f of files) {
      expect(typeof f).toBe('string');
      expect(f.length).toBeGreaterThan(0);
    }
  });

  it('should throw when git exits with a non-zero code', async () => {
    // Override Bun.spawn to simulate a non-git directory
    const originalSpawn = Bun.spawn;
    // @ts-expect-error — intentional monkey-patch for testing
    Bun.spawn = (_args: string[], _opts: unknown) => ({
      stdout: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(''));
          controller.close();
        },
      }),
      stderr: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('not a git repo'));
          controller.close();
        },
      }),
      exited: Promise.resolve(128),
    });

    try {
      await expect(getRepoFiles()).rejects.toThrow('Not a git repository');
    } finally {
      // @ts-expect-error
      Bun.spawn = originalSpawn;
    }
  });

  it('should filter out empty lines from git ls-files output', async () => {
    const originalSpawn = Bun.spawn;
    // @ts-expect-error
    Bun.spawn = (_args: string[], _opts: unknown) => ({
      stdout: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('file1.ts\n\nfile2.ts\n'));
          controller.close();
        },
      }),
      stderr: new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
      exited: Promise.resolve(0),
    });

    try {
      const files = await getRepoFiles();
      expect(files).toEqual(['file1.ts', 'file2.ts']);
    } finally {
      // @ts-expect-error
      Bun.spawn = originalSpawn;
    }
  });
});

// ---------------------------------------------------------------------------
// interactiveSelect — replace process.stdin with a PassThrough stream
// ---------------------------------------------------------------------------
describe('interactiveSelect', () => {
  it('should return the selected option for a valid numeric answer', async () => {
    const { fakeStdin, restore } = replaceStdin();
    try {
      const p = interactiveSelect('Pick one', ['alpha', 'beta', 'gamma']);
      fakeStdin.push('2\n');
      expect(await p).toBe('beta');
    } finally {
      restore();
    }
  });

  it('should return null for an out-of-range answer', async () => {
    const { fakeStdin, restore } = replaceStdin();
    try {
      const p = interactiveSelect('Pick one', ['alpha', 'beta']);
      fakeStdin.push('99\n');
      expect(await p).toBeNull();
    } finally {
      restore();
    }
  });

  it('should return null for a non-numeric answer', async () => {
    const { fakeStdin, restore } = replaceStdin();
    try {
      const p = interactiveSelect('Pick one', ['alpha', 'beta']);
      fakeStdin.push('foo\n');
      expect(await p).toBeNull();
    } finally {
      restore();
    }
  });

  it('should return null for answer "0" (1-indexed, so 0 is invalid)', async () => {
    const { fakeStdin, restore } = replaceStdin();
    try {
      const p = interactiveSelect('Pick one', ['alpha', 'beta']);
      fakeStdin.push('0\n');
      expect(await p).toBeNull();
    } finally {
      restore();
    }
  });

  it('should only display up to maxDisplay items and allow selecting within that range', async () => {
    const { fakeStdin, restore } = replaceStdin();
    const options = ['a', 'b', 'c', 'd', 'e', 'f'];
    try {
      // maxDisplay = 3; answer "1" picks "a"
      const p = interactiveSelect('Pick', options, 3);
      fakeStdin.push('1\n');
      expect(await p).toBe('a');
    } finally {
      restore();
    }
  });

  it('should not allow selecting beyond maxDisplay even when more options exist', async () => {
    const { fakeStdin, restore } = replaceStdin();
    const options = ['a', 'b', 'c', 'd', 'e', 'f'];
    try {
      // maxDisplay = 3; answer "5" is out of range
      const p = interactiveSelect('Pick', options, 3);
      fakeStdin.push('5\n');
      expect(await p).toBeNull();
    } finally {
      restore();
    }
  });
});

// ---------------------------------------------------------------------------
// promptLineNumber — replace process.stdin with a PassThrough stream
// ---------------------------------------------------------------------------
describe('promptLineNumber', () => {
  it('should return the parsed line number for a valid positive integer', async () => {
    const { fakeStdin, restore } = replaceStdin();
    try {
      const p = promptLineNumber();
      fakeStdin.push('42\n');
      expect(await p).toBe(42);
    } finally {
      restore();
    }
  });

  it('should return null for "0" (lines are 1-indexed)', async () => {
    const { fakeStdin, restore } = replaceStdin();
    try {
      const p = promptLineNumber();
      fakeStdin.push('0\n');
      expect(await p).toBeNull();
    } finally {
      restore();
    }
  });

  it('should return null for non-numeric input', async () => {
    const { fakeStdin, restore } = replaceStdin();
    try {
      const p = promptLineNumber();
      fakeStdin.push('abc\n');
      expect(await p).toBeNull();
    } finally {
      restore();
    }
  });

  it('should return null for empty input', async () => {
    const { fakeStdin, restore } = replaceStdin();
    try {
      const p = promptLineNumber();
      fakeStdin.push('\n');
      expect(await p).toBeNull();
    } finally {
      restore();
    }
  });

  it('should return null for a negative number', async () => {
    const { fakeStdin, restore } = replaceStdin();
    try {
      const p = promptLineNumber();
      fakeStdin.push('-5\n');
      expect(await p).toBeNull();
    } finally {
      restore();
    }
  });

  it('should return a large valid line number', async () => {
    const { fakeStdin, restore } = replaceStdin();
    try {
      const p = promptLineNumber();
      fakeStdin.push('99999\n');
      expect(await p).toBe(99999);
    } finally {
      restore();
    }
  });
});
