<div align="center">

# why-does-this-exist

### `wde` - Decode the *why* behind legacy code

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white)](https://bun.sh/)
[![Claude API](https://img.shields.io/badge/Claude-API-blueviolet)](https://anthropic.com/)
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT-green)](https://openai.com/)
[![Ollama](https://img.shields.io/badge/Ollama-Local-orange)](https://ollama.ai/)

<br/>

**A CLI tool that traces `git blame` → PRs → issues → reviews and explains legacy code decisions in plain English using AI.**

<br/>

```
$ wde src/utils/parser.ts:142

Tracing blame... ████████████████ Done
Fetching PR #234... ████████████████ Done
Fetching issues... ████████████████ Done
Generating explanation...

┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  This null check was added to fix a production crash (Issue #198)       │
│  where parser.config could be undefined when called before init().      │
│  The team considered making init() synchronous but rejected it due      │
│  to startup performance concerns noted in PR #234 review comments.      │
│  Watch out: removing this check will break lazy initialization.         │
│                                                                         │
│  Sources: commit a3f9c21 • PR #234 • Issue #198                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

</div>

---

## The Problem

Every developer eventually stares at code where:
- The commit message says `fix`
- The author left the company
- There are zero comments
- The *what* is obvious, but the *why* is buried

The answer exists somewhere — scattered across a PR description, three issue threads, and review comments from 2 years ago. **`wde` reconstructs that trail automatically.**

---

## Why not just use Claude Code CLI?

You *could* ask Claude Code: "Why does this code exist?" But here's what you'd have to do:

```bash
# With Claude Code CLI (manual process)
claude
> read src/utils/parser.ts
> run git blame -L 142,142 src/utils/parser.ts
> "what's the PR for commit a3f9c21?"
> run gh pr view 234
> "what issues were linked?"
> run gh issue view 198
> "now explain why this code exists"
```

**With `wde`, it's one command:**

```bash
wde src/utils/parser.ts:142
```

### The Difference

| | Claude Code CLI | `wde` |
|---|---|---|
| **Purpose** | General-purpose AI assistant | Built specifically for code archaeology |
| **Context gathering** | Manual — you fetch and paste | Automatic — traces blame → PR → issues |
| **Workflow** | Interactive session | Single command, instant answer |
| **Token usage** | High (full conversation) | Low (optimized prompt ~8k tokens) |
| **Output** | Conversational | Structured with source citations |
| **Cost per query** | ~$0.05-0.15 | ~$0.01 (or free with Ollama) |
| **CI/Tooling integration** | Limited | `--json` flag for automation |
| **Provider flexibility** | Claude only | Claude, GPT, or local LLMs |

### When to use what

| Use `wde` when... | Use Claude Code when... |
|---|---|
| "Why was this written this way?" | "Refactor this function" |
| "What problem did this solve?" | "Add a new feature" |
| "Is it safe to delete this?" | "Fix this bug" |
| "What were the alternatives considered?" | "Write tests for this" |

**`wde` is a scalpel. Claude Code is a Swiss Army knife.** Use the right tool for the job.

---

## How Context is Gathered

`wde` works in layers — **local git data is always available**, GitHub API adds richer context when accessible:

### Layer 1: Local Git (No auth required)

Everything from your cloned repo:

```bash
git blame -L 142,142 file.ts    # → commit SHA, author, date
git show <sha>                   # → commit message + full diff
git log --oneline               # → commit history
```

**This alone is useful** — commit messages and diffs often contain valuable context.

### Layer 2: GitHub API (Auth required for private repos)

The *real* gold is in PR discussions:

| Data | Where it lives | Why it matters |
|------|---------------|----------------|
| PR description | GitHub only | Detailed explanation of *why* |
| Review comments | GitHub only | Debates, alternatives considered |
| Linked issues | GitHub only | Original bug reports, requirements |
| Issue comments | GitHub only | User reports, reproduction steps |

### Authentication Logic

```
┌─────────────────────────────────────────────────────────┐
│  AI Provider                                            │
│    ├─ Anthropic → Needs API key (keychain or env)       │
│    ├─ OpenAI → Needs API key (keychain or env)          │
│    └─ Ollama → No API key needed (local)                │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  GitHub Context                                         │
│    ├─ Token set → Full context (local + PR + issues)    │
│    └─ No token                                          │
│         ├─ Public repo → Full context (rate-limited)    │
│         └─ Private repo → Local-only mode               │
└─────────────────────────────────────────────────────────┘
```

### Flags for Control

```bash
# Full context (default) - uses GitHub API if available
wde src/file.ts:42

# Local only - skip GitHub entirely, works offline
wde src/file.ts:42 --local
```

**No auth? No problem.** The tool degrades gracefully — you still get explanations based on commit history and diffs.

---

## Features

| Feature | Description |
|---------|-------------|
| **Git Blame Tracing** | Automatically identifies the commit that introduced a line |
| **PR Context Fetching** | Retrieves PR title, body, labels, and all review comments |
| **Issue Linking** | Extracts and fetches all linked issues (`Fixes #123`, `Closes #456`) |
| **Multi-Provider AI** | Choose between Claude, GPT, or local LLMs via Ollama |
| **Secure Auth** | API keys stored in system keychain, not config files |
| **Streaming Output** | See AI response as it's generated |
| **Function Lookup** | Use `--fn functionName` to trace by function instead of line number |
| **JSON Output** | `--json` flag for editor/tooling integration |

---

## Installation

```bash
# Using npm
npm install -g why-does-this-exist

# Using bun
bun install -g why-does-this-exist

# Or run directly with npx
npx why-does-this-exist src/file.ts:42
```

---

## Setup

Run the interactive setup command:

```bash
wde auth
```

This will guide you through:
1. **Choose your AI provider** — Anthropic (Claude), OpenAI (GPT), or Ollama (local)
2. **Enter your API key** — Securely stored in your system keychain (not in config files!)
3. **Optional: GitHub token** — For private repo PR/issue context

```
$ wde auth

  wde - Authentication Setup

? Select AI provider:
  > Anthropic (Claude) - Best for reasoning over messy PR/issue text (recommended)
    OpenAI (GPT) - GPT-4o and other OpenAI models
    Ollama (Local) - Run locally with Llama, Mistral, etc. (free, no API key)

? Enter your Anthropic API key: sk-ant-***
✓ API key stored securely in system keychain

? Set up GitHub token? (optional, for private repos)
  > Yes
    No

? Enter your GitHub token: ghp_***
✓ GitHub token stored securely

✓ Setup complete! Run: wde src/file.ts:42
```

### Where are credentials stored?

Credentials are stored in your **system keychain** — not in plain text files:

| Platform | Storage |
|----------|---------|
| macOS | Keychain Access |
| Windows | Credential Manager |
| Linux | libsecret (GNOME Keyring / KDE Wallet) |

This means:
- ✅ Safe to commit your `~/.config/wde/config.json` (contains only preferences, no secrets)
- ✅ Credentials are encrypted at rest
- ✅ Works with existing system security policies

### Environment Variable Override

You can also use environment variables (useful for CI/CD):

```bash
export ANTHROPIC_API_KEY="sk-ant-..."  # or OPENAI_API_KEY
export GITHUB_TOKEN="ghp_..."          # optional
```

Environment variables take precedence over keychain credentials.

---

## Usage

```bash
# Explain a specific line
wde src/utils/parser.ts:142

# Explain a function (fuzzy matches function name)
wde --fn parseConfig src/utils/parser.ts

# Output as JSON (for editor integrations)
wde src/file.ts:50 --json

# Show full context sent to AI
wde src/file.ts:50 --verbose

# Use a different AI provider
wde src/file.ts:50 --provider openai
wde src/file.ts:50 --provider ollama

# Use a different model
wde src/file.ts:50 --model claude-haiku-4-20250514
wde src/file.ts:50 --provider openai --model gpt-4o-mini
```

### Flags

| Flag | Description |
|------|-------------|
| `--fn <name>` | Find function by name instead of line number |
| `--provider <name>` | AI provider: `anthropic`, `openai`, or `ollama` |
| `--local` | Use only local git data (no GitHub API, works offline) |
| `--json` | Output structured JSON |
| `--verbose` | Show the full context trail sent to AI |
| `--model <model>` | Model to use (default depends on provider) |
| `--help` | Show help |
| `--version` | Show version |

### Subcommands

| Command | Description |
|---------|-------------|
| `wde auth` | Interactive setup for API keys and GitHub token |
| `wde auth --status` | Check current credential status |
| `wde auth --logout` | Clear all stored credentials |

---

## How It Works

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  CLI Input   │────▶│  Git Blame   │────▶│  PR Number   │
│  file:line   │     │  + Commit    │     │  Extraction  │
└──────────────┘     └──────────────┘     └──────────────┘
                                                  │
                                                  ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Output     │◀────│ AI Provider  │◀────│  GitHub API  │
│  Explanation │     │ Claude/GPT/  │     │  PR + Issues │
└──────────────┘     │   Ollama     │     └──────────────┘
                     └──────────────┘
```

1. **Blame** → Runs `git blame -L N,N --porcelain` to find the commit
2. **Commit** → Fetches full commit message and diff via `git show`
3. **PR Detection** → Parses commit message for PR references (`#123`, merge commits)
4. **GitHub Fetch** → Retrieves PR body, review comments, and linked issues
5. **Context Assembly** → Builds a structured prompt within token budget
6. **AI Explanation** → Your chosen AI provider synthesizes into a clear explanation
7. **Output** → Streaming response with source citations

---

## Tech Stack

| Component | Technology | Why |
|-----------|------------|-----|
| Runtime | **Bun** | Fast CLI startup, native TS, `$\`...\`` shell helpers |
| Language | **TypeScript** | Type-safe API responses, better DX |
| AI | **Claude / GPT / Ollama** | Multi-provider support for flexibility |
| Credentials | **keytar** | Secure system keychain storage |
| CLI Parser | **citty** | Lightweight, zero deps, TypeScript-first |
| Colors | **picocolors** | Zero deps, respects `NO_COLOR` |
| Testing | **bun:test** | Built-in, no config overhead |
| CI/CD | **GitHub Actions** | Test on push, publish on tag |

---

## MVP Scope

### In Scope (v1.0)
- [x] Git blame on file + line number
- [x] GitHub PR + review comment fetching
- [x] Linked issue extraction + fetching
- [x] Claude API explanation (3-5 sentences)
- [x] Function name lookup (`--fn`)
- [x] Plain stdout + JSON output

### Added in v2.0
- [x] Multi-provider support (Anthropic, OpenAI, Ollama)
- [x] Local model support via Ollama
- [x] Secure keychain credential storage
- [x] Interactive `wde auth` setup
- [x] Streaming AI responses

### Planned (v3.0)
- [ ] GitLab / Bitbucket support
- [ ] VSCode extension
- [ ] Neovim plugin
- [ ] Caching layer
- [ ] Interactive TUI mode

---

## Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| **No PR found** | Falls back to commit message + diff (still useful) |
| **Private repo, no token** | Clear error with instructions |
| **Rate limit hit** | Shows remaining limit, suggests token |
| **Massive PR (500+ comments)** | Truncates to most relevant content |
| **Non-GitHub remote** | Friendly "GitLab support coming in v2" message |

---

## Contributing

```bash
# Clone and install
git clone https://github.com/zain534102/why-does-this-exist.git
cd why-does-this-exist
bun install

# Set up authentication
bun run src/cli.ts auth

# Run locally
bun run src/cli.ts src/example.ts:10

# Run tests
bun test

# Type check
bun run typecheck
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">

**Built by [Zain Ali](https://github.com/zain534102)**

*Stop guessing. Start understanding.*

<br/>

<a href="https://github.com/zain534102/why-does-this-exist/stargazers">
  <img src="https://img.shields.io/github/stars/zain534102/why-does-this-exist?style=social" alt="Stars"/>
</a>

</div>
