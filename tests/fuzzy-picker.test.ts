/**
 * Tests for src/fuzzy-picker.ts
 *
 * fuzzyPicker is a fully interactive raw-mode TUI.  The strategy here:
 *
 * 1. Use mock.module (called synchronously at top-level) to replace
 *    getRepoFiles so the picker has a deterministic, small file list.
 * 2. Patch process.stdin to silence setRawMode and emit keystrokes.
 * 3. Suppress process.stdout.write to keep test output clean.
 * 4. Drive the picker by emitting 'data' events on stdin.
 */

import { describe, expect, it, spyOn, mock } from 'bun:test';

const isTTY = !!process.stdin.isTTY;
const describeInteractive = isTTY ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Replace the file-search dependency BEFORE the first import of fuzzy-picker.
// mock.module is synchronous and runs before any dynamic imports in this file.
// ---------------------------------------------------------------------------
const MOCK_FILES = ['src/cli.ts', 'src/blame.ts', 'src/renderer.ts'];

// Minimal scoreMatch re-implementation so filterFiles inside fuzzy-picker works
function scoreMatchStub(filePath: string, pattern: string): number {
  const lowerPath = filePath.toLowerCase();
  const lowerPattern = pattern.toLowerCase();
  if (!lowerPattern) return 50;
  const fileName = filePath.split('/').pop() || '';
  const lowerFileName = fileName.toLowerCase();
  if (lowerFileName === lowerPattern) return 100;
  const nameNoExt = lowerFileName.replace(/\.[^.]+$/, '');
  if (nameNoExt === lowerPattern) return 95;
  if (lowerFileName.startsWith(lowerPattern)) return 90;
  if (lowerFileName.includes(lowerPattern)) return 70;
  if (lowerPath.includes(lowerPattern)) return 50;
  return 0;
}

mock.module('../src/file-search', () => ({
  getRepoFiles: async () => [...MOCK_FILES],
  scoreMatch: scoreMatchStub,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Swap process.stdin so setRawMode does not throw (stdin is not a TTY in tests).
 * Returns restore().
 */
function patchStdin() {
  // @ts-expect-error
  const origSetRawMode = process.stdin.setRawMode;
  const origResume = process.stdin.resume.bind(process.stdin);
  const origPause = process.stdin.pause.bind(process.stdin);
  const origSetEncoding = process.stdin.setEncoding.bind(process.stdin);

  // @ts-expect-error
  process.stdin.setRawMode = (_mode: boolean) => process.stdin;
  process.stdin.resume = () => process.stdin;
  process.stdin.pause = () => process.stdin;
  // @ts-expect-error
  process.stdin.setEncoding = (_enc: string) => process.stdin;

  return () => {
    // @ts-expect-error
    if (origSetRawMode) process.stdin.setRawMode = origSetRawMode;
    process.stdin.resume = origResume;
    process.stdin.pause = origPause;
    process.stdin.setEncoding = origSetEncoding;
  };
}

/** Suppress stdout to keep test output clean. Returns restore(). */
function silenceStdout() {
  const orig = process.stdout.write.bind(process.stdout);
  // @ts-expect-error
  process.stdout.write = () => true;
  return () => {
    process.stdout.write = orig;
  };
}

/** Emit one or more keystrokes as if the user typed them, each in their own tick. */
function typeKeys(keys: string[], delayMs = 0): void {
  let delay = 0;
  for (const key of keys) {
    setTimeout(() => process.stdin.emit('data', key), delay);
    delay += delayMs;
  }
}

// ---------------------------------------------------------------------------
// Module shape tests — no stdin patching needed
// ---------------------------------------------------------------------------

describe('fuzzy-picker module exports', () => {
  it('should export a fuzzyPicker function', async () => {
    const mod = await import('../src/fuzzy-picker');
    expect(typeof mod.fuzzyPicker).toBe('function');
  });

  it('fuzzyPicker should be an async function (returns a Promise)', async () => {
    const mod = await import('../src/fuzzy-picker');
    expect(mod.fuzzyPicker.constructor.name).toBe('AsyncFunction');
  });
});

// ---------------------------------------------------------------------------
// Esc key → resolve(null)
// ---------------------------------------------------------------------------

describeInteractive('fuzzyPicker keyboard interaction', () => {
  it('should resolve with null when Esc is pressed immediately', async () => {
    const restoreStdin = patchStdin();
    const restoreStdout = silenceStdout();
    try {
      const { fuzzyPicker } = await import('../src/fuzzy-picker');
      const p = fuzzyPicker();
      setImmediate(() => typeKeys(['\x1B']));
      expect(await p).toBeNull();
    } finally {
      restoreStdin();
      restoreStdout();
    }
  });

  it('should resolve with null when Esc is pressed after typing a query', async () => {
    const restoreStdin = patchStdin();
    const restoreStdout = silenceStdout();
    try {
      const { fuzzyPicker } = await import('../src/fuzzy-picker');
      const p = fuzzyPicker('cli');
      setImmediate(() => typeKeys(['x', '\x1B']));
      expect(await p).toBeNull();
    } finally {
      restoreStdin();
      restoreStdout();
    }
  });

  it('should call process.exit(0) when Ctrl+C is pressed', async () => {
    const restoreStdin = patchStdin();
    const restoreStdout = silenceStdout();
    const exitSpy = spyOn(process, 'exit').mockImplementation((_code?: number) => undefined as never);
    try {
      const { fuzzyPicker } = await import('../src/fuzzy-picker');
      const raceResult = await Promise.race([
        fuzzyPicker().then(() => 'resolved'),
        new Promise<string>(res => {
          setImmediate(() => {
            typeKeys(['\x03']); // Ctrl+C
            setTimeout(() => res('timeout'), 100);
          });
        }),
      ]);
      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(['resolved', 'timeout']).toContain(raceResult);
    } finally {
      exitSpy.mockRestore();
      restoreStdin();
      restoreStdout();
    }
  });

  it('should resolve with a PickerResult after Enter + line confirm', async () => {
    const restoreStdin = patchStdin();
    const restoreStdout = silenceStdout();
    try {
      const { fuzzyPicker } = await import('../src/fuzzy-picker');
      // 'cli' narrows the list to src/cli.ts
      const p = fuzzyPicker('cli');
      setImmediate(() => typeKeys([
        '\r',  // Enter — select, enter line-input mode
        '\r',  // Enter with empty line → line = null
      ]));
      const result = await p;
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('file');
      expect(result).toHaveProperty('line');
      expect(MOCK_FILES).toContain(result!.file);
    } finally {
      restoreStdin();
      restoreStdout();
    }
  });

  it('should include the typed line number in the result', async () => {
    const restoreStdin = patchStdin();
    const restoreStdout = silenceStdout();
    try {
      const { fuzzyPicker } = await import('../src/fuzzy-picker');
      const p = fuzzyPicker('cli');
      setImmediate(() => typeKeys([
        '\r',  // select
        '4',   // type "42"
        '2',
        '\r',  // confirm
      ]));
      const result = await p;
      expect(result).not.toBeNull();
      expect(result!.line).toBe(42);
    } finally {
      restoreStdin();
      restoreStdout();
    }
  });

  it('should return null line when Enter is pressed with empty line input', async () => {
    const restoreStdin = patchStdin();
    const restoreStdout = silenceStdout();
    try {
      const { fuzzyPicker } = await import('../src/fuzzy-picker');
      const p = fuzzyPicker('cli');
      setImmediate(() => typeKeys(['\r', '\r']));
      const result = await p;
      expect(result).not.toBeNull();
      expect(result!.line).toBeNull();
    } finally {
      restoreStdin();
      restoreStdout();
    }
  });

  it('should return null line when only non-digit chars are typed before confirm', async () => {
    // The picker only accepts digit keypresses; alphabetic chars are ignored.
    const restoreStdin = patchStdin();
    const restoreStdout = silenceStdout();
    try {
      const { fuzzyPicker } = await import('../src/fuzzy-picker');
      const p = fuzzyPicker('cli');
      setImmediate(() => typeKeys([
        '\r', // select
        'a',  // ignored — not a digit
        'b',  // ignored
        '\r', // confirm with still-empty input
      ]));
      const result = await p;
      expect(result).not.toBeNull();
      expect(result!.line).toBeNull();
    } finally {
      restoreStdin();
      restoreStdout();
    }
  });

  it('should go back to search mode on Esc during line-input, then cancel on second Esc', async () => {
    const restoreStdin = patchStdin();
    const restoreStdout = silenceStdout();
    try {
      const { fuzzyPicker } = await import('../src/fuzzy-picker');
      const p = fuzzyPicker('cli');
      setImmediate(() => typeKeys([
        '\r',    // Enter → line-input mode
        '\x1B',  // Esc  → back to search mode
        '\x1B',  // Esc  → cancel picker
      ]));
      expect(await p).toBeNull();
    } finally {
      restoreStdin();
      restoreStdout();
    }
  });
});

// ---------------------------------------------------------------------------
// filterFiles behaviour (via initialQuery)
// ---------------------------------------------------------------------------

describeInteractive('fuzzyPicker filterFiles behaviour', () => {
  it('should not crash and resolves to null when no files match the query', async () => {
    const restoreStdin = patchStdin();
    const restoreStdout = silenceStdout();
    try {
      const { fuzzyPicker } = await import('../src/fuzzy-picker');
      // 'zzz' won't match any MOCK_FILES
      const p = fuzzyPicker('zzz');
      setImmediate(() => typeKeys(['\r', '\x1B'])); // Enter (no-op, no matches) then Esc
      expect(await p).toBeNull();
    } finally {
      restoreStdin();
      restoreStdout();
    }
  });

  it('should filter files by initialQuery before first render', async () => {
    const restoreStdin = patchStdin();
    const restoreStdout = silenceStdout();
    try {
      const { fuzzyPicker } = await import('../src/fuzzy-picker');
      // 'cli' matches only src/cli.ts
      const p = fuzzyPicker('cli');
      setImmediate(() => typeKeys(['\r', '\r'])); // select + confirm
      const result = await p;
      expect(result).not.toBeNull();
      expect(result!.file).toBe('src/cli.ts');
    } finally {
      restoreStdin();
      restoreStdout();
    }
  });

  it('should handle large file lists without throwing', async () => {
    const restoreStdin = patchStdin();
    const restoreStdout = silenceStdout();

    // Temporarily override the mock for this test
    mock.module('../src/file-search', () => ({
      getRepoFiles: async () => Array.from({ length: 200 }, (_, i) => `src/file${i}.ts`),
      scoreMatch: scoreMatchStub,
    }));

    try {
      // Re-import to pick up the new mock (dynamic import cache will re-use
      // the module, so this test mainly verifies no crash with many files)
      const { fuzzyPicker } = await import('../src/fuzzy-picker');
      const p = fuzzyPicker();
      setImmediate(() => typeKeys(['\x1B']));
      expect(await p).toBeNull();
    } finally {
      // Restore original mock
      mock.module('../src/file-search', () => ({
        getRepoFiles: async () => [...MOCK_FILES],
        scoreMatch: scoreMatchStub,
      }));
      restoreStdin();
      restoreStdout();
    }
  });
});

// ---------------------------------------------------------------------------
// Navigation keys
// ---------------------------------------------------------------------------

describeInteractive('fuzzyPicker navigation', () => {
  it('should navigate down and still return a valid PickerResult', async () => {
    const restoreStdin = patchStdin();
    const restoreStdout = silenceStdout();
    try {
      const { fuzzyPicker } = await import('../src/fuzzy-picker');
      // Use a query that matches all MOCK_FILES to have something to navigate
      const p = fuzzyPicker('src');
      setImmediate(() => typeKeys([
        '\x1B[B', // Arrow down — move to index 1
        '\r',     // Enter — select
        '\r',     // Confirm line
      ]));
      const result = await p;
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('file');
    } finally {
      restoreStdin();
      restoreStdout();
    }
  });

  it('should not navigate above index 0 with arrow up and still resolve', async () => {
    const restoreStdin = patchStdin();
    const restoreStdout = silenceStdout();
    try {
      const { fuzzyPicker } = await import('../src/fuzzy-picker');
      const p = fuzzyPicker('cli');
      setImmediate(() => typeKeys([
        '\x1B[A', // Arrow up at index 0 — should stay at 0
        '\r',
        '\r',
      ]));
      const result = await p;
      expect(result).not.toBeNull();
    } finally {
      restoreStdin();
      restoreStdout();
    }
  });

  it('should support Ctrl+N down and Ctrl+P up navigation without throwing', async () => {
    const restoreStdin = patchStdin();
    const restoreStdout = silenceStdout();
    try {
      const { fuzzyPicker } = await import('../src/fuzzy-picker');
      const p = fuzzyPicker('src');
      setImmediate(() => typeKeys([
        '\x0E', // Ctrl+N — move down
        '\x10', // Ctrl+P — move back up
        '\x1B', // Esc — cancel
      ]));
      expect(await p).toBeNull();
    } finally {
      restoreStdin();
      restoreStdout();
    }
  });
});

// ---------------------------------------------------------------------------
// Query editing (Backspace, Tab)
// ---------------------------------------------------------------------------

describeInteractive('fuzzyPicker query editing', () => {
  it('should support Backspace to delete the last query character', async () => {
    const restoreStdin = patchStdin();
    const restoreStdout = silenceStdout();
    try {
      const { fuzzyPicker } = await import('../src/fuzzy-picker');
      // Type 'z' (no matches) then backspace back to empty, then Enter on first file
      const p = fuzzyPicker();
      setImmediate(() => typeKeys([
        'z',     // type 'z' → no matches
        '\x7F',  // Backspace → empty query
        '\r',    // Enter → select first of all files
        '\r',    // confirm line
      ]));
      const result = await p;
      expect(result).not.toBeNull();
      expect(MOCK_FILES).toContain(result!.file);
    } finally {
      restoreStdin();
      restoreStdout();
    }
  });

  it('should handle Backspace on an empty query without throwing', async () => {
    const restoreStdin = patchStdin();
    const restoreStdout = silenceStdout();
    try {
      const { fuzzyPicker } = await import('../src/fuzzy-picker');
      const p = fuzzyPicker();
      setImmediate(() => typeKeys([
        '\x7F',  // Backspace on empty query — should be a no-op
        '\x1B',  // Esc
      ]));
      expect(await p).toBeNull();
    } finally {
      restoreStdin();
      restoreStdout();
    }
  });

  it('should support Tab to autocomplete query to the selected match', async () => {
    const restoreStdin = patchStdin();
    const restoreStdout = silenceStdout();
    try {
      const { fuzzyPicker } = await import('../src/fuzzy-picker');
      const p = fuzzyPicker('cli'); // src/cli.ts is the first match
      setImmediate(() => typeKeys([
        '\t',  // Tab — autocomplete query to 'src/cli.ts'
        '\r',  // Enter — select
        '\r',  // Confirm line
      ]));
      const result = await p;
      expect(result).not.toBeNull();
    } finally {
      restoreStdin();
      restoreStdout();
    }
  });

  it('should support the colon shortcut to enter line-input mode', async () => {
    const restoreStdin = patchStdin();
    const restoreStdout = silenceStdout();
    try {
      const { fuzzyPicker } = await import('../src/fuzzy-picker');
      // ':' when a match is selected switches to line-input mode directly
      const p = fuzzyPicker('cli');
      setImmediate(() => typeKeys([
        ':',   // switch to line mode
        '7',
        '\r',  // confirm
      ]));
      const result = await p;
      expect(result).not.toBeNull();
      expect(result!.line).toBe(7);
    } finally {
      restoreStdin();
      restoreStdout();
    }
  });
});

// ---------------------------------------------------------------------------
// Line-input Backspace behaviour
// ---------------------------------------------------------------------------

describeInteractive('fuzzyPicker line-input editing', () => {
  it('should support Backspace to delete digits in line mode', async () => {
    const restoreStdin = patchStdin();
    const restoreStdout = silenceStdout();
    try {
      const { fuzzyPicker } = await import('../src/fuzzy-picker');
      const p = fuzzyPicker('cli');
      setImmediate(() => typeKeys([
        '\r',    // Enter → line-input mode
        '9',     // type '9'
        '\x7F',  // Backspace → clears '9'
        '5',     // type '5'
        '\r',    // confirm
      ]));
      const result = await p;
      expect(result).not.toBeNull();
      expect(result!.line).toBe(5);
    } finally {
      restoreStdin();
      restoreStdout();
    }
  });

  it('should return to search mode when Backspace is pressed on empty line input', async () => {
    const restoreStdin = patchStdin();
    const restoreStdout = silenceStdout();
    try {
      const { fuzzyPicker } = await import('../src/fuzzy-picker');
      const p = fuzzyPicker('cli');
      setImmediate(() => typeKeys([
        '\r',    // Enter → line-input mode
        '\x7F',  // Backspace on empty lineInput → back to search mode
        '\x1B',  // Esc → cancel
      ]));
      expect(await p).toBeNull();
    } finally {
      restoreStdin();
      restoreStdout();
    }
  });
});
