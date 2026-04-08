import * as readline from 'node:readline';
import { resolve } from 'path';
import pc from 'picocolors';

/**
 * Get all tracked files in the git repo
 */
export async function getRepoFiles(): Promise<string[]> {
  const proc = Bun.spawn(['git', 'ls-files'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const output = await new Response(proc.stdout).text();
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error('Not a git repository or git is not installed');
  }
  return output.trim().split('\n').filter(Boolean);
}

/**
 * Score a file path against a search pattern.
 * Higher score = better match. Returns 0 for no match.
 */
export function scoreMatch(filePath: string, pattern: string): number {
  const lowerPath = filePath.toLowerCase();
  const lowerPattern = pattern.toLowerCase();

  const isTestFile = /(^|\/)tests?\//i.test(filePath) || /(\.|\/)(spec|__tests?__)\//i.test(filePath) || /\.(test|spec)\./i.test(filePath);
  const testPenalty = isTestFile ? 10 : 0;

  // Exact filename match (highest priority)
  const fileName = filePath.split('/').pop() || '';
  const lowerFileName = fileName.toLowerCase();
  if (lowerFileName === lowerPattern) return 100 - testPenalty;

  // Filename without extension matches exactly
  const nameNoExt = lowerFileName.replace(/\.[^.]+$/, '');
  if (nameNoExt === lowerPattern) return 95 - testPenalty;

  // Filename starts with pattern
  if (lowerFileName.startsWith(lowerPattern)) return 90 - testPenalty;

  // Filename without extension starts with pattern
  if (nameNoExt.startsWith(lowerPattern)) return 85 - testPenalty;

  // Filename contains pattern
  if (lowerFileName.includes(lowerPattern)) return 70 - testPenalty;

  // Full path contains pattern
  if (lowerPath.includes(lowerPattern)) return 50 - testPenalty;

  // Fuzzy: all chars of pattern appear in order in filename
  let patternIdx = 0;
  for (let i = 0; i < lowerFileName.length && patternIdx < lowerPattern.length; i++) {
    if (lowerFileName[i] === lowerPattern[patternIdx]) {
      patternIdx++;
    }
  }
  if (patternIdx === lowerPattern.length) return 30 - testPenalty;

  // Fuzzy: all chars in full path
  patternIdx = 0;
  for (let i = 0; i < lowerPath.length && patternIdx < lowerPattern.length; i++) {
    if (lowerPath[i] === lowerPattern[patternIdx]) {
      patternIdx++;
    }
  }
  if (patternIdx === lowerPattern.length) return 10 - testPenalty;

  return 0;
}

/**
 * Search for files matching a pattern.
 * Returns results sorted by relevance. If the top result is a strong match
 * (score gap >= 15 over second result), returns only that file.
 */
export async function searchFiles(pattern: string): Promise<string[]> {
  const files = await getRepoFiles();
  const scored = files
    .map(f => ({ file: f, score: scoreMatch(f, pattern) }))
    .filter(f => f.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return [];

  // Auto-select if the top result is significantly better
  if (scored.length >= 2 && scored[0].score - scored[1].score >= 15) {
    return [scored[0].file];
  }

  return scored.map(s => s.file);
}

/**
 * Search for a function name across all repo files
 */
export async function searchFunction(
  functionName: string,
  filePattern?: string
): Promise<Array<{ file: string; line: number }>> {
  const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`^\\s*(export\\s+)?(async\\s+)?function\\s+${escaped}\\s*[(<]`),
    new RegExp(`^\\s*(export\\s+)?(const|let|var)\\s+${escaped}\\s*=\\s*(async\\s+)?[(<]`),
    new RegExp(`^\\s*(public|private|protected)?\\s*(async\\s+)?${escaped}\\s*[(<]`),
    new RegExp(`^\\s*(public|private|protected)?\\s*(static\\s+)?function\\s+${escaped}\\s*\\(`),
    new RegExp(`^\\s*(async\\s+)?def\\s+${escaped}\\s*\\(`),
    new RegExp(`^\\s*def\\s+${escaped}\\s*(\\(|$)`),
    new RegExp(`^\\s*func\\s+(\\([^)]+\\)\\s+)?${escaped}\\s*\\(`),
    new RegExp(`^\\s*(pub\\s+)?(async\\s+)?fn\\s+${escaped}\\s*[(<]`),
  ];

  let files = await getRepoFiles();

  // If a file pattern is provided, filter files first
  if (filePattern) {
    const matchedFiles = await searchFiles(filePattern);
    if (matchedFiles.length > 0) {
      files = matchedFiles;
    }
  }

  // Only search text files with common code extensions
  const codeExtensions = new Set([
    'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
    'py', 'rb', 'go', 'rs', 'java', 'kt',
    'php', 'c', 'cpp', 'h', 'hpp', 'cs',
    'swift', 'scala', 'lua', 'sh', 'bash',
    'vue', 'svelte',
  ]);

  const cwd = process.cwd();
  const codeFiles = files.filter(f => {
    const ext = f.split('.').pop()?.toLowerCase() || '';
    if (!codeExtensions.has(ext)) return false;
    const abs = resolve(f);
    return abs.startsWith(cwd + '/') || abs === cwd;
  });

  const results: Array<{ file: string; line: number }> = [];

  for (const file of codeFiles) {
    try {
      const content = await Bun.file(file).text();
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        for (const pattern of patterns) {
          if (pattern.test(lines[i])) {
            results.push({ file, line: i + 1 });
            break;
          }
        }
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return results;
}

/**
 * Interactive prompt for selecting from a list
 */
export async function interactiveSelect(
  message: string,
  options: string[],
  maxDisplay: number = 10
): Promise<string | null> {
  const displayOptions = options.slice(0, maxDisplay);
  const hasMore = options.length > maxDisplay;

  console.log('');
  console.log(pc.bold(message));
  console.log('');
  displayOptions.forEach((opt, i) => {
    console.log(`  ${pc.cyan(`${i + 1})`)} ${opt}`);
  });
  if (hasMore) {
    console.log(pc.dim(`  ... and ${options.length - maxDisplay} more. Refine your search for better results.`));
  }
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`Select (1-${displayOptions.length}): `, (answer) => {
      rl.close();
      const index = parseInt(answer.trim(), 10) - 1;
      if (index >= 0 && index < displayOptions.length) {
        resolve(displayOptions[index]);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Interactive prompt for a line number
 */
export async function promptLineNumber(): Promise<number | null> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`Enter line number: `, (answer) => {
      rl.close();
      const line = parseInt(answer.trim(), 10);
      if (!isNaN(line) && line > 0) {
        resolve(line);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Parse an @pattern target.
 * Supports: @pattern, @pattern:42
 */
const MAX_SEARCH_PATTERN_LENGTH = 256;

export function parseAtTarget(target: string): { pattern: string; line: number | null } {
  const raw = target.slice(1); // Remove @
  if (raw.length > MAX_SEARCH_PATTERN_LENGTH) {
    throw new Error(`Search pattern too long (max ${MAX_SEARCH_PATTERN_LENGTH} characters)`);
  }
  const colonIndex = raw.lastIndexOf(':');

  if (colonIndex === -1) {
    return { pattern: raw, line: null };
  }

  const lineStr = raw.slice(colonIndex + 1);
  const line = parseInt(lineStr, 10);

  if (isNaN(line) || line < 1) {
    return { pattern: raw, line: null };
  }

  return { pattern: raw.slice(0, colonIndex), line };
}
