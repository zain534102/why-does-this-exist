# wde - why-does-this-exist

> This file is read by both **Claude Code** (as CLAUDE.md) and **OpenAI Codex** (as AGENTS.md via symlink).

A CLI tool that traces git blame → PRs → issues → reviews and explains legacy code decisions using AI.

## Quick Reference

```bash
bun install              # Install dependencies
bun run src/cli.ts       # Run locally
bun test                 # Run tests (176 tests)
bun run typecheck        # Type check
bun run build            # Build binary
```

## Getting Started

```bash
# First time setup (interactive)
wde auth

# Then analyze any code
wde src/file.ts:42
wde src/file.ts --fn myFunction
```

## Tech Stack

- **Runtime**: Bun (fast startup, native TS, safe shell execution)
- **Language**: TypeScript (strict mode)
- **AI**: Multiple providers - Anthropic, OpenAI, Ollama (local)
- **CLI**: citty (lightweight, TypeScript-first)
- **Testing**: bun:test

## Project Structure

```
src/
├── cli.ts              # Entry point with subcommands
├── types.ts            # TypeScript interfaces
├── errors.ts           # Custom error classes
├── config-manager.ts   # User config (~/.config/wde/config.json)
├── commands/
│   └── auth.ts         # Interactive auth setup
├── ai-providers/       # Multi-provider AI support
│   ├── index.ts        # Provider factory
│   ├── types.ts        # Provider interface
│   ├── anthropic.ts    # Claude API
│   ├── openai.ts       # GPT API
│   └── ollama.ts       # Local Ollama
├── configs/            # App config (env overrides)
├── blame.ts            # Git blame operations
├── github.ts           # GitHub API client
├── context-builder.ts  # Prompt assembly
└── renderer.ts         # Terminal output
```

## Key Features

1. **Zero Config Start**: Just run `wde auth` once
2. **Multiple AI Providers**: Anthropic, OpenAI, or local Ollama
3. **Config File**: Settings saved in `~/.config/wde/config.json`
4. **Env Overrides**: Environment variables override config file
5. **Graceful Degradation**: Works without GitHub token
6. **Streaming AI**: Real-time response display

## Available Skills

- `/security` - Security guidelines and secure coding patterns
- `/contribute` - Coding standards and contribution workflow
- `wde-dev` - Architecture and implementation details (auto-loaded)

## Environment Variables (Optional)

All config is done via `wde auth`. These override the config file:

```bash
ANTHROPIC_API_KEY=sk-ant-...  # Override Anthropic key
OPENAI_API_KEY=sk-...         # Override OpenAI key
GITHUB_TOKEN=ghp_...          # Override GitHub token
OLLAMA_HOST=http://...        # Override Ollama host
```

## Current Status

**Complete**:
- ✅ Interactive auth setup (`wde auth`)
- ✅ Multi-provider AI support (Anthropic, OpenAI, Ollama)
- ✅ User config file (~/.config/wde/)
- ✅ Git blame with PR extraction
- ✅ GitHub API integration
- ✅ Streaming AI responses
- ✅ 176 tests passing

**Next**: Distribution & launch
