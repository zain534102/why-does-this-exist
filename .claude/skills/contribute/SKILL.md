---
name: contribute
description: Coding standards and contribution guidelines for wde. Use when writing new features, fixing bugs, or reviewing code. Covers TypeScript patterns, testing, and PR workflow.
user-invocable: true
allowed-tools: Read, Grep, Glob, Bash(bun *)
---

# Contributing to wde

You are contributing to `wde` (why-does-this-exist), a CLI tool built with Bun and TypeScript.

## Project Structure

```
why-does-this-exist/
├── src/
│   ├── cli.ts           # Entry point, arg parsing
│   ├── blame.ts         # Git blame operations
│   ├── github.ts        # GitHub API client
│   ├── context-builder.ts # Prompt assembly
│   ├── ai.ts            # Claude API integration
│   ├── renderer.ts      # Output formatting
│   └── types.ts         # TypeScript interfaces
├── tests/
│   └── *.test.ts        # Test files
├── .claude/skills/      # AI agent skills
└── .github/workflows/   # CI/CD
```

## TypeScript Standards

### Strict Mode Required

All code must pass strict TypeScript checks:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### Type Everything

```typescript
// GOOD: Explicit types
function parseBlame(output: string): BlameResult {
  // ...
}

// BAD: Implicit any
function parseBlame(output) {
  // ...
}
```

### Use `readonly` for Immutability

```typescript
// GOOD: Immutable by default
interface BlameResult {
  readonly sha: string;
  readonly commitMessage: string;
  readonly authorDate: Date;
}

// Use Object.freeze for runtime immutability
function createResult(data: BlameResult): Readonly<BlameResult> {
  return Object.freeze({ ...data });
}
```

### Prefer `const` Assertions

```typescript
// GOOD
const ALLOWED_COMMANDS = ['git blame', 'git show', 'git log'] as const;
type AllowedCommand = typeof ALLOWED_COMMANDS[number];

// BAD
const ALLOWED_COMMANDS = ['git blame', 'git show', 'git log'];
```

### No `any` Types

```typescript
// GOOD: Use unknown for truly unknown types
function parseJSON(text: string): unknown {
  return JSON.parse(text);
}

// BAD: any disables type checking
function parseJSON(text: string): any {
  return JSON.parse(text);
}
```

---

## Code Patterns

### Error Handling

Use the typed error hierarchy:

```typescript
import { ValidationError, SecurityError, NetworkError } from './errors';

// Throw specific errors
if (!file.startsWith(cwd)) {
  throw new SecurityError('Path traversal detected');
}

// Catch and handle appropriately
try {
  await fetchPR(number);
} catch (error) {
  if (error instanceof NetworkError) {
    console.error('Network issue:', error.message);
  } else {
    throw error; // Re-throw unexpected errors
  }
}
```

### Async/Await

Always use async/await, never raw Promises:

```typescript
// GOOD
async function fetchContext(pr: number): Promise<PRContext> {
  const response = await github.fetch(`/repos/${owner}/${repo}/pulls/${pr}`);
  return response.json();
}

// BAD
function fetchContext(pr: number): Promise<PRContext> {
  return github.fetch(`/repos/${owner}/${repo}/pulls/${pr}`)
    .then(r => r.json());
}
```

### Parallel Operations

Use `Promise.allSettled` for operations that can fail independently:

```typescript
async function fetchAllContext(prNumber: number, issueNumbers: number[]) {
  const results = await Promise.allSettled([
    fetchPR(prNumber),
    ...issueNumbers.map(fetchIssue),
  ]);

  return {
    pr: results[0].status === 'fulfilled' ? results[0].value : null,
    issues: results.slice(1)
      .filter((r): r is PromiseFulfilledResult<Issue> => r.status === 'fulfilled')
      .map(r => r.value),
  };
}
```

### Shell Commands with Bun

Always use Bun's `$` for shell commands:

```typescript
import { $ } from 'bun';

// GOOD: Safe, auto-escaped
const blame = await $`git blame -L ${line},${line} --porcelain -- ${file}`.text();

// GOOD: With timeout
const result = await $`git show ${sha}`.timeout(30_000).text();

// BAD: Command injection risk
import { exec } from 'child_process';
exec(`git blame -L ${line},${line} ${file}`);
```

---

## Testing

### Test Structure

```typescript
import { describe, expect, it, beforeEach, mock } from 'bun:test';

describe('parseBlame', () => {
  it('should extract commit SHA from porcelain output', () => {
    const output = `abc123def... 1 1 1
author John Doe
...`;

    const result = parseBlame(output);

    expect(result.sha).toBe('abc123def');
  });

  it('should throw ValidationError for invalid input', () => {
    expect(() => parseBlame('')).toThrow(ValidationError);
  });
});
```

### Mock External Services

```typescript
import { mock } from 'bun:test';

// Mock GitHub API
const mockFetch = mock(() =>
  Promise.resolve(new Response(JSON.stringify({ title: 'Test PR' })))
);

beforeEach(() => {
  globalThis.fetch = mockFetch;
});
```

### Test Commands

```bash
# Run all tests
bun test

# Run specific test file
bun test tests/blame.test.ts

# Watch mode
bun test --watch

# With coverage
bun test --coverage
```

---

## Git Workflow

### Branch Naming

```
feature/add-gitlab-support
fix/path-traversal-vulnerability
docs/update-readme
refactor/extract-github-client
```

### Commit Messages

Follow conventional commits:

```
feat: add --local flag for offline mode
fix: prevent path traversal in file validation
docs: add security guidelines
refactor: extract API client to separate module
test: add tests for blame parsing
chore: update dependencies
```

### PR Process

1. Create feature branch from `main`
2. Make changes with tests
3. Run `bun test` and `bun run typecheck`
4. Push and create PR
5. Wait for CI to pass
6. Request review

---

## Adding a New Feature

### Example: Adding a New Flag

1. **Update types** in `src/types.d.ts`:

```typescript
export interface WdeOptions {
  file: string;
  line?: number;
  fn?: string;
  local: boolean;  // NEW
  json: boolean;
  verbose: boolean;
  model: string;
}
```

2. **Add to CLI** in `src/cli.ts`:

```typescript
const main = defineCommand({
  args: {
    local: {
      type: 'boolean',
      description: 'Use only local git data (no GitHub API)',
      default: false,
    },
  },
});
```

3. **Implement logic**:

```typescript
if (options.local) {
  // Skip GitHub API, use only git data
  return explainFromLocalContext(blame);
}
```

4. **Add tests**:

```typescript
describe('--local flag', () => {
  it('should not call GitHub API when --local is set', async () => {
    // ...
  });
});
```

5. **Update README**

---

## Performance Guidelines

### Lazy Loading

```typescript
// Load heavy dependencies only when needed
async function getAnthropicClient() {
  const { Anthropic } = await import('@anthropic-ai/sdk');
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}
```

### Minimize Dependencies

Current dependencies (keep it minimal):
- `@anthropic-ai/sdk` - Required for AI
- `citty` - CLI parsing (3KB)
- `picocolors` - Terminal colors (zero deps)

Before adding a dependency, ask:
1. Can this be done with Bun built-ins?
2. Is there a smaller alternative?
3. Is this actively maintained?

---

## Quick Reference

```bash
# Install dependencies
bun install

# Run locally
bun run src/cli.ts <file>:<line>

# Type check
bun run typecheck

# Run tests
bun test

# Build binary
bun run build
```
