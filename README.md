# claude-codex-runner

[![npm version](https://img.shields.io/npm/v/claude-codex-runner.svg)](https://www.npmjs.com/package/claude-codex-runner)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

MCP server that enables Claude to orchestrate parallel OpenAI Codex CLI tasks in isolated git worktrees.

## Overview

`claude-codex-runner` is an MCP (Model Context Protocol) server that acts as a task orchestrator between Claude and the Codex CLI. It allows Claude to:

- Run multiple Codex tasks in parallel with configurable concurrency
- Isolate each task in its own git worktree to prevent interference
- Validate patches and file modifications against security policies
- Collect structured results with command logs, file changes, and evidence
- Review development plans for completeness and parallelization opportunities

The server bridges Claude's planning and review capabilities with Codex's autonomous code execution, enabling safe, audited, and reproducible multi-step code generation workflows.

## Architecture

```
Claude (Manager)
    |
    | MCP Protocol (stdio)
    |
    v
claude-codex-runner (MCP Server)
    |
    +-- Config Validator (security policies, limits)
    |
    +-- Task Orchestrator (concurrency control, scheduling)
    |
    +-- Worktree Manager (creates/cleanup git worktrees)
    |
    +-- Codex Launcher (spawns parallel Codex CLI processes)
    |
    +-- Result Aggregator (collects and validates outputs)
    |
    v
Task 1 (Worktree A) --> Codex CLI --> [Execution + Logs]
Task 2 (Worktree B) --> Codex CLI --> [Execution + Logs]
Task 3 (Worktree C) --> Codex CLI --> [Execution + Logs]
```

Each task runs independently in its own isolated worktree, preventing state leakage while allowing parallel execution. Results are collected, validated, and returned to Claude with full audit trails.

## Features

- **Parallel Task Execution**: Run multiple Codex CLI tasks concurrently with configurable limits
- **Git Worktree Isolation**: Each task runs in its own worktree, preventing cross-contamination
- **Security-First Design**: Command allowlist, path restrictions, environment sanitization, and post-execution validation
- **Patch Validation**: Verify patches apply cleanly to the base repository reference
- **Structured Output**: Detailed task results with command logs, file changes, execution evidence, and timing
- **Plan Review Tool**: Analyze development plans for completeness, dependencies, and parallelization gaps
- **Comprehensive Logging**: Timestamped logs for debugging, with automatic retention policies
- **Graceful Cleanup**: Automatic worktree cleanup on completion, timeout, or crash
- **Dry Run Mode**: Test task configuration without actual execution
- **Resource Limits**: Configurable concurrency, timeouts, and task count caps

## Prerequisites

- **Node.js** >= 18.0.0
- **Git** (with worktree support)
- **OpenAI Codex CLI** (installed and in PATH)
- **CODEX_API_KEY** environment variable set with valid OpenAI API key

### Verify Prerequisites

```bash
node --version          # >= 18.0.0
git --version           # any recent version
which codex             # should return path to codex binary
echo $CODEX_API_KEY     # should not be empty
```

## Installation

### Global Installation (Recommended for MCP servers)

```bash
npm install -g claude-codex-runner
```

Then run:

```bash
claude-codex-runner
```

### Using npx (No Installation)

```bash
npx -y claude-codex-runner
```

### Local Development Installation

```bash
git clone https://github.com/jsc7727/claude-codex-runner.git
cd claude-codex-runner
npm install
npm run build
npm start
```

## MCP Client Setup

### Claude Desktop Configuration

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or the equivalent on your platform:

```json
{
  "mcpServers": {
    "codex-runner": {
      "command": "npx",
      "args": ["-y", "claude-codex-runner"],
      "env": {
        "CODEX_API_KEY": "your-openai-api-key-here"
      }
    }
  }
}
```

Restart Claude Desktop. You should now see the `run_codex_tasks` and `review_plan_with_codex` tools available.

### Claude Code (oh-my-claudecode) Configuration

Add the following to your `.claude/agents.json` or in agent configuration:

```json
{
  "mcp_servers": [
    {
      "name": "codex-runner",
      "command": "npx",
      "args": ["-y", "claude-codex-runner"],
      "env": {
        "CODEX_API_KEY": "your-openai-api-key-here"
      }
    }
  ]
}
```

## Project Configuration

Configure `claude-codex-runner` behavior with a `.mcp-codex.json` file in your repository root.

### Configuration File Example

```json
{
  "allowed_commands": [
    "npm test",
    "npm run lint",
    "npm run build",
    "npx tsc --noEmit"
  ],
  "default_allowed_paths": [
    "src/**",
    "tests/**",
    "package.json",
    "tsconfig.json"
  ],
  "default_concurrency": 2,
  "default_timeout_sec": 300,
  "resource_policy": "conservative",
  "network_policy": "deny",
  "codex_command": "codex",
  "codex_model": "o4-mini",
  "codex_full_auto": true,
  "codex_ephemeral": true,
  "sandbox_mode": "workspace-write",
  "max_runs_retained": 20,
  "max_tasks_per_run": 10
}
```

### Configuration Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `allowed_commands` | string[] | `["npm test", "npm run lint", "npx tsc --noEmit"]` | Command prefix allowlist. Codex can only run commands starting with these prefixes. |
| `default_allowed_paths` | string[] | `["src/**", "tests/**", "package.json"]` | Glob patterns for file modifications. Files modified by Codex must match one pattern. |
| `default_concurrency` | number | `2` | Max parallel tasks per run (1-8). |
| `default_timeout_sec` | number | `300` | Per-task timeout in seconds (10-1800). |
| `resource_policy` | string | `"conservative"` | Resource allocation strategy: `"conservative"` or `"normal"`. |
| `network_policy` | string | `"deny"` | Network access policy: `"deny"` or `"allow"`. |
| `codex_command` | string | `"codex"` | Path or command to invoke Codex CLI. |
| `codex_model` | string | `"o4-mini"` | Model to use for Codex tasks. |
| `codex_full_auto` | boolean | `true` | Enable `--full-auto` flag for autonomous execution. |
| `codex_ephemeral` | boolean | `true` | Enable `--ephemeral` flag (no conversation history). |
| `sandbox_mode` | string | `"workspace-write"` | Sandbox level: `"read-only"`, `"workspace-write"`, or `"danger-full-access"`. |
| `max_runs_retained` | number | `20` | Maximum log directories to retain. Older logs are deleted. |
| `max_tasks_per_run` | number | `10` | Maximum tasks allowed per `run_codex_tasks` call (1-50). |

## MCP Tools

### run_codex_tasks

Execute multiple Codex CLI tasks in parallel with full isolation and security validation.

**Input Schema:**

```typescript
{
  run_id?: string;                    // Optional run identifier (auto-generated if omitted)
  base_ref?: string;                  // Git reference for patch validation (default: "HEAD")
  concurrency?: number;               // Override default concurrency (1-8)
  resource_policy?: "conservative" | "normal";  // Override resource policy
  tasks: {
    task_id: string;                  // Unique identifier within the run
    prompt: string;                   // Codex prompt
    allowed_paths?: string[];         // Override default allowed paths
    allowed_commands?: string[];      // Override default allowed commands
    timeout_sec?: number;             // Override default timeout (10-600)
  }[];
  dry_run?: boolean;                  // If true, validate but don't execute
}
```

**Output Schema:**

```typescript
{
  run_id: string;
  results: {
    task_id: string;
    status: "success" | "failed" | "timeout" | "skipped";
    exit_code: number | null;
    files_changed: string[];
    patch: string;                    // Redacted after validation
    patch_applicable: boolean;
    apply_check_log: string;
    commands_run: {
      cmd: string;
      exit_code: number | null;
    }[];
    evidence: string;
    logs: {
      stdout: string;
      stderr: string;
      tail: string;                   // Last 500 chars of combined output
    };
    workspace_path: string;           // Path to worktree
    duration_ms: number;
    summary: string;
    notes_for_manager: string;        // Security violations, errors, etc.
  }[];
  total_duration_ms: number;
}
```

**Example Usage:**

```javascript
const result = await mcp.callTool("run_codex_tasks", {
  run_id: "feature-auth-v2",
  tasks: [
    {
      task_id: "add-login-endpoint",
      prompt: "Add POST /auth/login endpoint with bcrypt password hashing",
      timeout_sec: 120
    },
    {
      task_id: "add-jwt-middleware",
      prompt: "Add JWT middleware for route protection",
      timeout_sec: 120
    }
  ],
  concurrency: 2,
  dry_run: false
});
```

### review_plan_with_codex

Review a development plan for completeness, dependencies, parallelization opportunities, and risks.

**Input Schema:**

```typescript
{
  plan_text: string;              // Development plan to review
  repo_context?: string;          // Optional repository context (architecture, tech stack, etc.)
}
```

**Output Schema:**

```typescript
{
  report: {
    missing_tasks: string[];                      // Tasks that should be added
    dependency_issues: string[];                  // Unmet or circular dependencies
    parallelization_suggestions: string[];        // Tasks that could run in parallel
    test_gaps: string[];                          // Missing test coverage
    risk_flags: string[];                         // Identified risks
    recommended_task_splits: string[];            // Tasks that should be broken down
  }
}
```

**Example Usage:**

```javascript
const review = await mcp.callTool("review_plan_with_codex", {
  plan_text: `
    1. Add user authentication service
    2. Add login endpoint
    3. Add JWT middleware
    4. Add permission checks
    5. Write integration tests
  `,
  repo_context: "Node.js / Express API, PostgreSQL database, Jest for testing"
});
```

## Security

The `claude-codex-runner` implements six layers of defense to ensure safe code execution:

### Layer 1: Pre-flight Validation

- Validates task IDs (alphanumeric, dot, hyphen, underscore; 1-64 chars)
- Ensures unique task IDs within a run
- Validates configuration file schema
- Checks prerequisites (Node.js, git, Codex CLI, API key)

### Layer 2: Environment Sanitization

- Allowlists specific environment variables: `PATH`, `HOME`, `USER`, `LANG`, `TERM`, `SHELL`, `TMPDIR`, `NODE_ENV`
- Always passes `CODEX_API_KEY` for Codex authentication
- Strips all secret-like variables (names ending with `_KEY`, `_SECRET`, `_TOKEN`, `_PASSWORD`)
- Prevents environment-based injection attacks

### Layer 3: Command Allowlisting

- Rejects shell metacharacters: `;`, `|`, `&`, `$`, `()`, `` ` ``, newlines
- Enforces prefix matching against configured `allowed_commands`
- Validated both at task submission (pre-flight) and execution results (post-execution)
- Prevents command injection and shell escapes

### Layer 4: Path Allowlisting

- Enforces glob pattern matching against `default_allowed_paths`
- Prevents directory traversal (`..`, absolute paths)
- Validates all file modifications post-execution
- Raises violations for out-of-bounds changes

### Layer 5: Git Worktree Isolation

- Each task runs in its own git worktree at `.git/worktrees/{runId}-{taskId}`
- Prevents cross-task interference and file system pollution
- Guarantees cleanup on completion, timeout, or crash
- Base repository remains pristine

### Layer 6: Patch Validation

- Generated patches are validated against the base repository reference
- Ensures patches apply cleanly without conflicts
- Patches are redacted in results to prevent secret leakage
- Applied patches are signed and timestamped in logs

## Development

### Clone and Setup

```bash
git clone https://github.com/jsc7727/claude-codex-runner.git
cd claude-codex-runner
npm install
```

### Build

```bash
npm run build
```

Output TypeScript compiled to `dist/` directory.

### Watch Mode (Development)

```bash
npm run dev
```

Automatically recompiles on source file changes.

### Run Tests

```bash
npm test
```

Runs test suite with Vitest.

### Watch Tests

```bash
npm run test:watch
```

Runs tests and re-runs on file changes.

### Run Locally

```bash
npm start
```

Starts the MCP server on stdio. Set `CODEX_API_KEY` environment variable first:

```bash
export CODEX_API_KEY=your-key-here
npm start
```

### Project Structure

```
claude-codex-runner/
├── src/
│   ├── index.ts                 # Entry point
│   ├── server.ts                # MCP server setup
│   ├── types.ts                 # Type definitions and schemas
│   ├── config.ts                # Configuration loader
│   ├── security.ts              # Security validators
│   ├── worktree.ts              # Git worktree management
│   ├── codex-runner.ts          # Codex CLI executor
│   ├── codex-output-parser.ts   # Parse Codex JSONL output
│   ├── patch-validator.ts       # Patch validation
│   ├── log-redactor.ts          # Log sanitization
│   ├── logger.ts                # Structured logging
│   ├── active-runs.ts           # Active run tracking
│   ├── errors.ts                # Custom error types
│   ├── startup.ts               # Initialization checks
│   ├── tools/
│   │   ├── run-codex-tasks.ts   # Main orchestration tool
│   │   └── review-plan.ts       # Plan review tool
│   └── utils/
│       ├── exec.ts              # Process execution
│       ├── fs.ts                # File system utilities
│       └── id.ts                # ID generation and validation
├── package.json
├── tsconfig.json
├── .mcp-codex.json              # Example configuration
└── README.md                    # This file
```

## Troubleshooting

### CODEX_API_KEY Not Set

**Error:** `Error: CODEX_API_KEY environment variable is not set`

**Solution:** Set the environment variable before running:

```bash
export CODEX_API_KEY=sk-...
npx claude-codex-runner
```

Or in Claude Desktop config:

```json
"env": { "CODEX_API_KEY": "sk-..." }
```

### Codex CLI Not Found

**Error:** `ENOENT: spawn codex ENOENT`

**Solution:** Install and verify Codex CLI:

```bash
npm install -g @openai/codex-cli
which codex
```

Or configure custom path in `.mcp-codex.json`:

```json
{ "codex_command": "/usr/local/bin/codex" }
```

### Task Timeout

**Error:** `Task timeout exceeded (300s)`

**Solution:** Increase `default_timeout_sec` in `.mcp-codex.json`:

```json
{ "default_timeout_sec": 600 }
```

Or pass per-task override:

```javascript
{
  task_id: "slow-task",
  prompt: "...",
  timeout_sec: 600
}
```

### Security Violation: Command Not in Allowlist

**Error:** `Command not in allowlist: "npm run custom-script"`

**Solution:** Add the command to `allowed_commands` in `.mcp-codex.json`:

```json
{
  "allowed_commands": [
    "npm test",
    "npm run lint",
    "npm run custom-script"
  ]
}
```

### Security Violation: Path Not in Allowed Patterns

**Error:** `Path not in allowed patterns: "config/secrets.json"`

**Solution:** Add the pattern to `default_allowed_paths` in `.mcp-codex.json`:

```json
{
  "default_allowed_paths": [
    "src/**",
    "tests/**",
    "config/**",
    "package.json"
  ]
}
```

### Worktree Cleanup Failed

**Error:** `Worktree cleanup failed: unable to delete directory`

**Workaround:** Manually clean up orphaned worktrees:

```bash
git worktree list
git worktree remove /path/to/orphaned/worktree --force
```

Or clean all:

```bash
git worktree prune
```

## License

MIT License. See LICENSE file for details.

## Contributing

Contributions are welcome. Please open issues and pull requests on GitHub.
