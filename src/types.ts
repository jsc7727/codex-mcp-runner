import { z } from "zod";
import { SAFE_ID_REGEX } from "./utils/id.js";

// --- ID Sanitization ---

export const SafeIdSchema = z.string()
  .min(1)
  .max(64)
  .regex(SAFE_ID_REGEX, "ID must contain only alphanumeric, dot, hyphen, or underscore characters (1-64 chars)");

// --- Configuration Schema ---
export const CodexConfigSchema = z.object({
  allowed_commands: z.array(z.string()).default(["npm test", "npm run lint", "npx tsc --noEmit"]),
  default_allowed_paths: z.array(z.string()).default(["src/**", "tests/**", "package.json"]),
  default_concurrency: z.number().int().min(1).max(8).default(2),
  default_timeout_sec: z.number().int().min(10).max(1800).default(300),
  resource_policy: z.enum(["conservative", "normal"]).default("conservative"),
  network_policy: z.enum(["deny", "allow"]).default("deny"),
  codex_command: z.string().default("codex"),
  codex_model: z.string().default("o4-mini"),
  codex_full_auto: z.boolean().default(true),
  codex_ephemeral: z.boolean().default(true),
  sandbox_mode: z.enum(["read-only", "workspace-write", "danger-full-access"]).default("workspace-write"),
  max_runs_retained: z.number().int().min(1).default(20),
  max_tasks_per_run: z.number().int().min(1).max(50).default(10),
});

export type CodexConfig = z.infer<typeof CodexConfigSchema>;

// --- Task Input ---
export const TaskInputSchema = z.object({
  task_id: SafeIdSchema,
  prompt: z.string().min(1),
  allowed_paths: z.array(z.string()).optional(),
  allowed_commands: z.array(z.string()).optional(),
  timeout_sec: z.number().int().min(10).max(600).optional(),
});

export type TaskInput = z.infer<typeof TaskInputSchema>;

export const RunCodexTasksInputSchema = z.object({
  run_id: SafeIdSchema.optional(),
  base_ref: z.string().default("HEAD"),
  concurrency: z.number().int().min(1).max(8).optional(),
  resource_policy: z.enum(["conservative", "normal"]).optional(),
  tasks: z.array(TaskInputSchema).min(1),
  dry_run: z.boolean().default(false).optional(),
}).refine(
  (data) => {
    const ids = data.tasks.map(t => t.task_id);
    return new Set(ids).size === ids.length;
  },
  { message: "task_id values must be unique within a run" }
);

export type RunCodexTasksInput = z.infer<typeof RunCodexTasksInputSchema>;

// --- Command Record ---
export const CommandRecordSchema = z.object({
  cmd: z.string(),
  exit_code: z.number().nullable(),
});

export type CommandRecord = z.infer<typeof CommandRecordSchema>;

// --- Task Result (server-constructed, not validated from external input) ---
export interface TaskResult {
  task_id: string;
  status: "success" | "failed" | "timeout" | "skipped";
  exit_code: number | null;
  files_changed: string[];
  patch: string;
  patch_applicable: boolean;
  apply_check_log: string;
  commands_run: CommandRecord[];
  evidence: string;
  logs: { stdout: string; stderr: string; tail: string };
  workspace_path: string;
  duration_ms: number;
  summary: string;
  notes_for_manager: string;
}

export interface RunCodexTasksOutput {
  run_id: string;
  results: TaskResult[];
  total_duration_ms: number;
}

// --- JSONL Event Types (verified from Codex CLI docs) ---
export interface CodexItemBase {
  id: string;
  type: string;
  status: string;
}

export interface CommandExecutionItem extends CodexItemBase {
  type: "command_execution";
  command: string;
  status: "in_progress" | "completed" | "failed";
  exit_code?: number;
}

export interface AgentMessageItem extends CodexItemBase {
  type: "agent_message";
  text: string;
  status: "in_progress" | "completed";
}

export interface FileChangeItem extends CodexItemBase {
  type: "file_change";
  path: string;
  status: "in_progress" | "completed";
}

export interface McpToolCallItem extends CodexItemBase {
  type: "mcp_tool_call";
  tool_name?: string;
}

export interface WebSearchItem extends CodexItemBase {
  type: "web_search";
}

export interface PlanUpdateItem extends CodexItemBase {
  type: "plan_update";
}

export type CodexItem =
  | CommandExecutionItem
  | AgentMessageItem
  | FileChangeItem
  | McpToolCallItem
  | WebSearchItem
  | PlanUpdateItem
  | CodexItemBase;

export interface UsageInfo {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
}

export type CodexEvent =
  | { type: "thread.started"; thread_id: string }
  | { type: "turn.started" }
  | { type: "turn.completed"; usage: UsageInfo }
  | { type: "turn.failed"; error?: { message: string } }
  | { type: "item.started"; item: CodexItem }
  | { type: "item.completed"; item: CodexItem }
  | { type: "error"; message: string }
  | { type: string; [key: string]: unknown };

export interface ParsedCodexOutput {
  commands_run: CommandRecord[];
  summary: string;
  evidence: string;
  errors: string[];
  files_changed: string[];
  raw_events: CodexEvent[];
  usage: UsageInfo | null;
}

// --- Security ---
export interface SecurityViolation {
  type: "command" | "path";
  detail: string;
  value: string;
}

// --- Review Tool ---
export interface ReviewPlanInput {
  plan_text: string;
  repo_context?: string;
}

export interface ReviewPlanOutput {
  report: {
    missing_tasks: string[];
    dependency_issues: string[];
    parallelization_suggestions: string[];
    test_gaps: string[];
    risk_flags: string[];
    recommended_task_splits: string[];
  };
}

// --- Patch Validation ---
export interface PatchValidationResult {
  applicable: boolean;
  log: string;
}

// --- Exec ---
export interface ExecOptions {
  cwd?: string;
  timeout_ms?: number;
  env?: Record<string, string>;
  signal?: AbortSignal;
  maxBuffer?: number;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}
