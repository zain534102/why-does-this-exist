import pc from 'picocolors';
import { scoreMatch, getRepoFiles } from './file-search';

const MAX_VISIBLE = 8;

interface PickerResult {
  file: string;
  line: number | null;
}

/**
 * Interactive fuzzy file picker with real-time search.
 * Type to filter, arrow keys to navigate, Enter to select, Esc to cancel.
 */
export async function fuzzyPicker(initialQuery: string = ''): Promise<PickerResult | null> {
  const allFiles = await getRepoFiles();

  let query = initialQuery;
  let selectedIndex = 0;
  let matches = filterFiles(allFiles, query);
  let lineInput = '';
  let enteringLine = false;

  // Enable raw mode for keystroke capture
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  // Hide cursor
  process.stdout.write('\x1B[?25l');

  render();

  return new Promise<PickerResult | null>((resolve) => {
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onKey);
      // Show cursor
      process.stdout.write('\x1B[?25h');
      // Clear the picker UI
      clearScreen();
    };

    const onKey = (key: string) => {
      const charCode = key.charCodeAt(0);

      // Esc or Ctrl+C
      if (key === '\x1B' || key === '\x03') {
        cleanup();
        if (key === '\x03') {
          process.exit(0);
        }
        resolve(null);
        return;
      }

      if (enteringLine) {
        handleLineInput(key, charCode, cleanup, resolve);
        return;
      }

      // Enter — select current match
      if (key === '\r' || key === '\n') {
        if (matches.length > 0) {
          // Ask for line number (current match is matches[selectedIndex])
          enteringLine = true;
          lineInput = '';
          render();
        }
        return;
      }

      // Tab — also select (common UX pattern)
      if (key === '\t') {
        if (matches.length > 0) {
          query = matches[selectedIndex];
          selectedIndex = 0;
          matches = filterFiles(allFiles, query);
          render();
        }
        return;
      }

      // Arrow up / Ctrl+P
      if (key === '\x1B[A' || key === '\x10') {
        if (selectedIndex > 0) selectedIndex--;
        render();
        return;
      }

      // Arrow down / Ctrl+N
      if (key === '\x1B[B' || key === '\x0E') {
        if (selectedIndex < matches.length - 1 && selectedIndex < MAX_VISIBLE - 1) selectedIndex++;
        render();
        return;
      }

      // Backspace
      if (key === '\x7F' || key === '\b') {
        if (query.length > 0) {
          query = query.slice(0, -1);
          selectedIndex = 0;
          matches = filterFiles(allFiles, query);
        }
        render();
        return;
      }

      // Regular character input
      if (charCode >= 32 && charCode < 127) {
        // Check if user is typing :linenum at the end
        if (key === ':' && matches.length > 0) {
          // Switch to line input mode with current selection
          enteringLine = true;
          lineInput = '';
          render();
          return;
        }
        query += key;
        selectedIndex = 0;
        matches = filterFiles(allFiles, query);
        render();
        return;
      }

      // Handle escape sequences for arrow keys (multi-byte)
      if (key.length > 1 && key[0] === '\x1B') {
        // Already handled above for [A and [B
        return;
      }
    };

    const handleLineInput = (key: string, charCode: number, cleanup: () => void, resolve: (r: PickerResult | null) => void) => {
      // Enter — submit line number
      if (key === '\r' || key === '\n') {
        cleanup();
        const line = parseInt(lineInput, 10);
        resolve({
          file: matches[selectedIndex],
          line: (isNaN(line) || line < 1) ? null : line,
        });
        return;
      }

      // Esc — go back to search
      if (key === '\x1B') {
        enteringLine = false;
        lineInput = '';
        render();
        return;
      }

      // Ctrl+C
      if (key === '\x03') {
        cleanup();
        process.exit(0);
      }

      // Backspace
      if (key === '\x7F' || key === '\b') {
        if (lineInput.length > 0) {
          lineInput = lineInput.slice(0, -1);
        } else {
          // Go back to search mode
          enteringLine = false;
        }
        render();
        return;
      }

      // Only accept digits
      if (charCode >= 48 && charCode <= 57) {
        lineInput += key;
        render();
      }
    };

    process.stdin.on('data', onKey);
  });

  function clearScreen() {
    // Move up and clear all the lines we rendered
    const totalLines = MAX_VISIBLE + 4; // header + matches + footer
    for (let i = 0; i < totalLines; i++) {
      process.stdout.write('\x1B[2K'); // Clear line
      if (i < totalLines - 1) process.stdout.write('\x1B[A'); // Move up
    }
    process.stdout.write('\x1B[2K'); // Clear the first line
    process.stdout.write('\r');
  }

  function render() {
    // Move cursor to the start of our render area
    clearScreen();

    const visible = matches.slice(0, MAX_VISIBLE);
    const hasMore = matches.length > MAX_VISIBLE;

    // Header / search input
    if (enteringLine) {
      const selected = matches[selectedIndex];
      process.stdout.write(`  ${pc.cyan('File:')} ${selected}\n`);
      process.stdout.write(`  ${pc.cyan('Line:')} ${lineInput}${pc.dim('█')}\n`);
      process.stdout.write(`\n`);
      process.stdout.write(pc.dim('  Enter to confirm • Esc to go back\n'));
    } else {
      process.stdout.write(`  ${pc.cyan('Search:')} ${query}${pc.dim('█')}\n`);
      process.stdout.write(`\n`);

      if (matches.length === 0) {
        process.stdout.write(pc.dim('  No matches found\n'));
      } else {
        for (let i = 0; i < MAX_VISIBLE; i++) {
          if (i < visible.length) {
            const isSelected = i === selectedIndex;
            const prefix = isSelected ? pc.cyan('❯ ') : '  ';
            const text = isSelected ? pc.bold(visible[i]) : pc.dim(visible[i]);
            process.stdout.write(`${prefix}${text}\n`);
          } else {
            process.stdout.write('\n');
          }
        }
      }

      if (hasMore) {
        process.stdout.write(pc.dim(`  +${matches.length - MAX_VISIBLE} more\n`));
      } else {
        process.stdout.write('\n');
      }

      process.stdout.write(pc.dim('  ↑↓ navigate • Enter/: select • Esc cancel\n'));
    }
  }
}

function filterFiles(allFiles: string[], query: string): string[] {
  if (!query) return allFiles.slice(0, 50); // Show first 50 when no query

  return allFiles
    .map(f => ({ file: f, score: scoreMatch(f, query) }))
    .filter(f => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(f => f.file);
}
