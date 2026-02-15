# codex-mcp-runner

[![npm version](https://img.shields.io/npm/v/codex-mcp-runner.svg)](https://www.npmjs.com/package/codex-mcp-runner)
[![npm downloads](https://img.shields.io/npm/dm/codex-mcp-runner.svg)](https://www.npmjs.com/package/codex-mcp-runner)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](README.md) | **한국어**

> Codex CLI 병렬 실행을 **안전하게** — git worktree 격리와 6단계 보안으로.

## 왜 필요한가?

`codex exec`를 여러 개 동시에 돌리는 건 가능하지만, **불안정합니다**:

- [세션 충돌](https://github.com/openai/codex/issues/11435) — 병렬 인스턴스가 공유 세션 복원으로 서로 간섭
- [크래시 & 출력 잘림](https://github.com/openai/codex/issues/10887) — 리소스 집약 병렬 작업이 세션 종료 유발

**codex-mcp-runner**가 이를 해결합니다:

| | `codex exec` x N 직접 실행 | codex-mcp-runner |
|--|---|---|
| 병렬 실행 | 가능하지만 불안정 | 안정적 (worktree 격리) |
| 세션 충돌 | 공유 상태 간섭 | 각 작업이 독립된 git worktree에서 실행 |
| 보안 | 경계 없음 | 6단계 방어 (명령어 허용 목록, 경로 제한, 환경 정제) |
| 결과 수집 | 수동 | 패치, 로그, 증거 포함 구조화된 출력 |
| 정리 | 수동 | 완료/타임아웃/크래시 시 자동 정리 |
| 통합 | CLI만 가능 | **MCP 표준** — Claude, Cursor 등 모든 MCP 클라이언트에서 사용 가능 |

## 개요

`codex-mcp-runner`는 완전한 격리와 보안으로 Codex CLI 작업을 병렬 조율하는 MCP(Model Context Protocol) 서버입니다. 모든 MCP 클라이언트에서 다음을 수행할 수 있습니다:

- 설정 가능한 동시성으로 여러 Codex 작업을 병렬로 실행 (최대 8개)
- 각 작업을 자신의 git worktree에 격리하여 세션 충돌 방지
- 보안 정책에 따라 패치 및 파일 수정사항 검증
- 명령어 로그, 파일 변경사항 및 증거를 포함한 구조화된 결과 수집
- 완성도 및 병렬화 기회에 대한 개발 계획 검토

MCP 클라이언트의 계획 기능을 Codex의 자동화된 코드 실행과 연결하여, 안전하고 감시되며 재현 가능한 다단계 코드 생성 워크플로우를 실현합니다.

## 아키텍처

```
Claude (Manager)
    |
    | MCP Protocol (stdio)
    |
    v
codex-mcp-runner (MCP Server)
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

각 작업은 자신의 격리된 worktree에서 독립적으로 실행되어 상태 누수를 방지하면서 병렬 실행을 허용합니다. 결과는 수집, 검증되고 전체 감시 추적과 함께 Claude에 반환됩니다.

## 특징

- **병렬 작업 실행**: 설정 가능한 제한으로 여러 Codex CLI 작업을 동시에 실행
- **Git Worktree 격리**: 각 작업이 자신의 worktree에서 실행되어 교차 오염 방지
- **보안 우선 설계**: 명령어 허용 목록, 경로 제한, 환경 정제 및 실행 후 검증
- **패치 검증**: 패치가 기본 저장소 참조에 깔끔하게 적용되는지 확인
- **구조화된 출력**: 명령어 로그, 파일 변경사항, 실행 증거 및 타이밍이 포함된 상세한 작업 결과
- **계획 검토 도구**: 개발 계획의 완성도, 종속성 및 병렬화 간격 분석
- **포괄적 로깅**: 디버깅을 위한 타임스탬프가 있는 로그 및 자동 보존 정책
- **우아한 정리**: 완료, 타임아웃 또는 충돌 시 자동 worktree 정리
- **드라이 런 모드**: 실제 실행 없이 작업 구성 테스트
- **리소스 제한**: 설정 가능한 동시성, 타임아웃 및 작업 수 제한

## 사전 요구사항

- **Node.js** >= 18.0.0
- **Git** (worktree 지원 포함)
- **OpenAI Codex CLI** (설치됨 및 PATH에 있음)
- **인증** (다음 중 하나):
  - `CODEX_API_KEY` 환경 변수에 유효한 OpenAI API 키 설정, 또는
  - `codex login` (OAuth 기반 인증)

### 사전 요구사항 확인

```bash
node --version          # >= 18.0.0
git --version           # any recent version
which codex             # should return path to codex binary
codex auth status       # 인증 상태 확인
```

## 설치

### 전역 설치 (MCP 서버에 권장)

```bash
npm install -g codex-mcp-runner
```

그 다음 실행:

```bash
codex-mcp-runner
```

### npx 사용 (설치 불필요)

```bash
npx -y codex-mcp-runner
```

### 로컬 개발 설치

```bash
git clone https://github.com/jsc7727/codex-mcp-runner.git
cd codex-mcp-runner
npm install
npm run build
npm start
```

## MCP 클라이언트 설정

### Claude Desktop 구성

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) 또는 해당 플랫폼의 동등한 파일을 편집합니다:

```json
{
  "mcpServers": {
    "codex-runner": {
      "command": "npx",
      "args": ["-y", "codex-mcp-runner"],
      "env": {
        "CODEX_API_KEY": "your-openai-api-key-here"
      }
    }
  }
}
```

Claude Desktop을 다시 시작합니다. 이제 `run_codex_tasks` 및 `review_plan_with_codex` 도구를 사용할 수 있습니다.

### Claude Code (oh-my-claudecode) 구성

`.claude/agents.json` 또는 에이전트 구성에 다음을 추가합니다:

```json
{
  "mcp_servers": [
    {
      "name": "codex-runner",
      "command": "npx",
      "args": ["-y", "codex-mcp-runner"],
      "env": {
        "CODEX_API_KEY": "your-openai-api-key-here"
      }
    }
  ]
}
```

## 프로젝트 구성

저장소 루트의 `.mcp-codex.json` 파일로 `codex-mcp-runner` 동작을 구성합니다.

### 구성 파일 예시

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

### 구성 필드

| 필드 | 타입 | 기본값 | 설명 |
|-------|------|---------|-------------|
| `allowed_commands` | string[] | `["npm test", "npm run lint", "npx tsc --noEmit"]` | 명령어 접두사 허용 목록. Codex는 이 접두사로 시작하는 명령어만 실행할 수 있습니다. |
| `default_allowed_paths` | string[] | `["src/**", "tests/**", "package.json"]` | 파일 수정사항에 대한 Glob 패턴. Codex로 수정된 파일은 하나의 패턴과 일치해야 합니다. |
| `default_concurrency` | number | `2` | 실행당 최대 병렬 작업 수 (1-8). |
| `default_timeout_sec` | number | `300` | 작업별 타임아웃 (초 단위, 10-1800). |
| `resource_policy` | string | `"conservative"` | 리소스 할당 전략: `"conservative"` 또는 `"normal"`. |
| `network_policy` | string | `"deny"` | 네트워크 액세스 정책: `"deny"` 또는 `"allow"`. |
| `codex_command` | string | `"codex"` | Codex CLI를 호출할 경로 또는 명령어. |
| `codex_model` | string | `"o4-mini"` | Codex 작업에 사용할 모델. |
| `codex_full_auto` | boolean | `true` | 자동화된 실행을 위해 `--full-auto` 플래그 활성화. |
| `codex_ephemeral` | boolean | `true` | `--ephemeral` 플래그 활성화 (대화 기록 없음). |
| `sandbox_mode` | string | `"workspace-write"` | 샌드박스 수준: `"read-only"`, `"workspace-write"` 또는 `"danger-full-access"`. |
| `max_runs_retained` | number | `20` | 보존할 최대 로그 디렉토리 수. 오래된 로그는 삭제됩니다. |
| `max_tasks_per_run` | number | `10` | `run_codex_tasks` 호출당 허용되는 최대 작업 수 (1-50). |

## MCP 도구

### run_codex_tasks

여러 Codex CLI 작업을 완전한 격리 및 보안 검증으로 병렬로 실행합니다.

**입력 스키마:**

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

**출력 스키마:**

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

**사용 예시:**

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

개발 계획의 완성도, 종속성, 병렬화 기회 및 위험성을 검토합니다.

**입력 스키마:**

```typescript
{
  plan_text: string;              // Development plan to review
  repo_context?: string;          // Optional repository context (architecture, tech stack, etc.)
}
```

**출력 스키마:**

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

**사용 예시:**

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

## 보안

`codex-mcp-runner`는 안전한 코드 실행을 보장하기 위해 6가지 방어 계층을 구현합니다:

### 계층 1: 사전 검증

- 작업 ID 검증 (영숫자, 점, 하이픈, 언더스코어; 1-64자)
- 실행 내 고유 작업 ID 확보
- 구성 파일 스키마 검증
- 사전 요구사항 확인 (Node.js, git, Codex CLI, API 키)

### 계층 2: 환경 정제

- 특정 환경 변수를 허용 목록: `PATH`, `HOME`, `USER`, `LANG`, `TERM`, `SHELL`, `TMPDIR`, `NODE_ENV`
- Codex 인증을 위해 항상 `CODEX_API_KEY` 전달
- 모든 비밀 같은 변수 제거 (이름이 `_KEY`, `_SECRET`, `_TOKEN`, `_PASSWORD`로 끝남)
- 환경 기반 주입 공격 방지

### 계층 3: 명령어 허용 목록

- 셸 메타문자 거부: `;`, `|`, `&`, `$`, `()`, `` ` ``, 줄바꿈
- 구성된 `allowed_commands`에 대한 접두사 매칭 강제
- 작업 제출(사전 검증) 및 실행 결과(사후 실행) 모두에서 검증
- 명령어 주입 및 셸 탈출 방지

### 계층 4: 경로 허용 목록

- `default_allowed_paths`에 대한 Glob 패턴 매칭 강제
- 디렉토리 순회(`..`, 절대 경로) 방지
- 실행 후 모든 파일 수정사항 검증
- 범위를 벗어난 변경사항에 대해 위반 발생

### 계층 5: Git Worktree 격리

- 각 작업은 `.git/worktrees/{runId}-{taskId}`의 자신의 git worktree에서 실행
- 작업 간 간섭 및 파일 시스템 오염 방지
- 완료, 타임아웃 또는 충돌 시 정리 보장
- 기본 저장소는 원래 상태 유지

### 계층 6: 패치 검증

- 생성된 패치는 기본 저장소 참조에 대해 검증
- 패치가 충돌 없이 깔끔하게 적용되도록 보장
- 패치는 비밀 누수를 방지하기 위해 결과에서 제외
- 적용된 패치는 로그에 서명 및 타임스탐프됨

## 개발

### 복제 및 설정

```bash
git clone https://github.com/jsc7727/codex-mcp-runner.git
cd codex-mcp-runner
npm install
```

### 빌드

```bash
npm run build
```

TypeScript가 `dist/` 디렉토리로 컴파일됩니다.

### 감시 모드 (개발)

```bash
npm run dev
```

소스 파일 변경 시 자동으로 다시 컴파일합니다.

### 테스트 실행

```bash
npm test
```

Vitest로 테스트 스위트를 실행합니다.

### 감시 테스트

```bash
npm run test:watch
```

테스트를 실행하고 파일 변경 시 다시 실행합니다.

### 로컬 실행

```bash
npm start
```

stdio에서 MCP 서버를 시작합니다. 먼저 `CODEX_API_KEY` 환경 변수를 설정합니다:

```bash
export CODEX_API_KEY=your-key-here
npm start
```

### 프로젝트 구조

```
codex-mcp-runner/
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

## 문제 해결

### 인증을 찾을 수 없음

**오류:** `No Codex authentication found. Set CODEX_API_KEY environment variable or run 'codex login'.`

**해결책 (방법 1 - OAuth):** Codex 로그인을 한번 실행합니다:

```bash
codex login
```

**해결책 (방법 2 - API 키):** 환경 변수를 설정합니다:

```bash
export CODEX_API_KEY=sk-...
npx codex-mcp-runner
```

또는 MCP 클라이언트 설정에서:

```json
"env": { "CODEX_API_KEY": "sk-..." }
```

### Codex CLI 찾을 수 없음

**오류:** `ENOENT: spawn codex ENOENT`

**해결책:** Codex CLI를 설치하고 확인합니다:

```bash
npm install -g @openai/codex-cli
which codex
```

또는 `.mcp-codex.json`에서 사용자 정의 경로를 구성합니다:

```json
{ "codex_command": "/usr/local/bin/codex" }
```

### 작업 타임아웃

**오류:** `Task timeout exceeded (300s)`

**해결책:** `.mcp-codex.json`에서 `default_timeout_sec` 증가:

```json
{ "default_timeout_sec": 600 }
```

또는 작업별 재정의 전달:

```javascript
{
  task_id: "slow-task",
  prompt: "...",
  timeout_sec: 600
}
```

### 보안 위반: 명령어가 허용 목록에 없음

**오류:** `Command not in allowlist: "npm run custom-script"`

**해결책:** `.mcp-codex.json`의 `allowed_commands`에 명령어 추가:

```json
{
  "allowed_commands": [
    "npm test",
    "npm run lint",
    "npm run custom-script"
  ]
}
```

### 보안 위반: 경로가 허용된 패턴에 없음

**오류:** `Path not in allowed patterns: "config/secrets.json"`

**해결책:** `.mcp-codex.json`의 `default_allowed_paths`에 패턴 추가:

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

### Worktree 정리 실패

**오류:** `Worktree cleanup failed: unable to delete directory`

**해결책:** 고아 worktree를 수동으로 정리합니다:

```bash
git worktree list
git worktree remove /path/to/orphaned/worktree --force
```

또는 모두 정리:

```bash
git worktree prune
```

## 라이선스

MIT License. LICENSE 파일에서 자세한 사항을 참조하세요.

## 기여

기여를 환영합니다. GitHub에서 이슈 및 풀 리퀘스트를 열어주세요.
