import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { exec } from "./utils/exec.js";
import { parseCodexOutput } from "./codex-output-parser.js";
import { sanitizeEnvironment, validatePostExecution } from "./security.js";
import { redact } from "./log-redactor.js";
import { getRepoDiff, getChangedFiles } from "./worktree.js";
import type { TaskInput, TaskResult, CodexConfig, SecurityViolation } from "./types.js";

function buildCodexArgs(task: TaskInput, worktreePath: string, config: CodexConfig): string[] {
  const outputFile = join(worktreePath, ".codex-last-message.txt");
  const args: string[] = ["exec"];

  // Approval/sandbox mode
  if (config.codex_full_auto) {
    args.push("--full-auto");
    // Explicit sandbox mode if different from default
    if (config.sandbox_mode !== "workspace-write") {
      args.push("--sandbox", config.sandbox_mode);
    }
  } else {
    // WARNING: Bypassing all Codex safety guardrails
    console.error("[SECURITY WARNING] codex_full_auto=false: using --dangerously-bypass-approvals-and-sandbox. All Codex sandbox protections are disabled.");
    args.push("--dangerously-bypass-approvals-and-sandbox");
  }

  // Ephemeral mode
  if (config.codex_ephemeral) {
    args.push("--ephemeral");
  }

  // Always: structured output
  args.push("--json");

  // Model
  args.push("-m", config.codex_model);

  // Working directory
  args.push("-C", worktreePath);

  // Output last message to file
  args.push("-o", outputFile);

  // Argument terminator (prevents prompt from being parsed as flag)
  args.push("--");

  // Prompt (positional - MUST be last, after --)
  args.push(task.prompt);

  return args;
}

export async function runCodexTask(
  task: TaskInput,
  worktreePath: string,
  config: CodexConfig,
  repoRoot: string
): Promise<TaskResult> {
  const startTime = Date.now();
  const timeout_sec = task.timeout_sec ?? config.default_timeout_sec;
  const args = buildCodexArgs(task, worktreePath, config);
  const env = sanitizeEnvironment(process.env);
  const outputFile = join(worktreePath, ".codex-last-message.txt");

  // Spawn codex exec
  const result = await exec(config.codex_command, args, {
    cwd: worktreePath,
    timeout_ms: timeout_sec * 1000,
    env,
  });

  const duration_ms = Date.now() - startTime;

  // Parse JSONL stdout
  const parsed = parseCodexOutput(result.stdout);

  // Read -o output file for notes_for_manager
  let notesForManager = "";
  try {
    notesForManager = await readFile(outputFile, "utf-8");
  } catch {
    // File may not exist if codex failed early
  }

  // Determine initial status
  let status: TaskResult["status"];
  if (result.timedOut) {
    status = "timeout";
    notesForManager += "\n[TIMEOUT] Task exceeded " + timeout_sec + "s limit.";
  } else if (result.exitCode !== 0 || parsed.errors.length > 0) {
    status = "failed";
    if (parsed.errors.length > 0) {
      notesForManager += "\n[ERRORS]\n" + parsed.errors.join("\n");
    }
  } else {
    status = "success";
  }

  // Get git changes
  let patch = "";
  let filesChanged: string[] = [];
  try {
    patch = await getRepoDiff(worktreePath);
    filesChanged = await getChangedFiles(worktreePath);
  } catch {
    // Git operations may fail in broken worktree
  }

  // Merge parser-detected files with git-detected files
  const allFilesChanged = [...new Set([...filesChanged, ...parsed.files_changed])];

  // Post-execution security validation
  const allowedPaths = (task.allowed_paths && task.allowed_paths.length > 0)
    ? task.allowed_paths
    : config.default_allowed_paths;
  const allowedCommands = (task.allowed_commands && task.allowed_commands.length > 0)
    ? task.allowed_commands
    : config.allowed_commands;
  let violations: SecurityViolation[] = [];

  violations = validatePostExecution(
    { ...parsed, files_changed: allFilesChanged },
    allowedCommands,
    allowedPaths,
    repoRoot
  );

  if (violations.length > 0) {
    status = "failed";
    const violationDetails = violations
      .map(v => `[${v.type.toUpperCase()}] ${v.detail}`)
      .join("\n");
    notesForManager += "\n[SECURITY VIOLATIONS]\n" + violationDetails;
  }

  // Build tail (last ~50 lines of combined stdout/stderr)
  const combinedOutput = (result.stdout + "\n" + result.stderr).trim();
  const tailLines = combinedOutput.split("\n").slice(-50).join("\n");

  // Build the task result with unredacted patch (caller redacts after validation)
  return {
    task_id: task.task_id,
    status,
    exit_code: result.exitCode,
    files_changed: allFilesChanged,
    patch: patch,
    patch_applicable: false, // Will be set by patch-validator later
    apply_check_log: "",     // Will be set by patch-validator later
    commands_run: parsed.commands_run,
    evidence: redact(parsed.evidence),
    logs: {
      stdout: redact(result.stdout),
      stderr: redact(result.stderr),
      tail: redact(tailLines),
    },
    workspace_path: worktreePath,
    duration_ms,
    summary: redact(parsed.summary || notesForManager.slice(0, 500)),
    notes_for_manager: redact(notesForManager),
  };
}

// Export for testing
export { buildCodexArgs };
