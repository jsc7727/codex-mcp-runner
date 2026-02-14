import pLimit from "p-limit";
import { generateRunId, sanitizeId } from "../utils/id.js";
import { loadConfig } from "../config.js";
import { createWorktree, cleanupRun } from "../worktree.js";
import { runCodexTask } from "../codex-runner.js";
import { validateTaskInput } from "../security.js";
import { createRunLogger } from "../logger.js";
import { activeRuns } from "../active-runs.js";
import { InputValidationError } from "../errors.js";
import { validatePatch } from "../patch-validator.js";
import { redact } from "../log-redactor.js";
import type { RunCodexTasksInput, RunCodexTasksOutput, TaskResult } from "../types.js";

export async function handleRunCodexTasks(
  input: RunCodexTasksInput
): Promise<RunCodexTasksOutput> {
  const startTime = Date.now();
  const config = await loadConfig();
  const repoRoot = process.cwd();

  // Generate or sanitize run_id
  const runId = input.run_id ? sanitizeId(input.run_id) : generateRunId();

  // Dynamic max_tasks_per_run validation (I7)
  if (input.tasks.length > config.max_tasks_per_run) {
    throw new InputValidationError(
      `Too many tasks: ${input.tasks.length} exceeds max_tasks_per_run (${config.max_tasks_per_run})`
    );
  }

  // Track run for signal cleanup
  activeRuns.add(runId);

  // Create logger
  const logger = await createRunLogger(runId);

  const concurrency = input.concurrency ?? config.default_concurrency;
  const baseRef = input.base_ref ?? "HEAD";

  await logger.log("info", `Starting run ${runId} with ${input.tasks.length} tasks, concurrency=${concurrency}`);

  // Dry-run mode: return skipped results immediately
  if (input.dry_run) {
    const results: TaskResult[] = input.tasks.map(task => ({
      task_id: task.task_id,
      status: "skipped" as const,
      exit_code: null,
      files_changed: [],
      patch: "",
      patch_applicable: false,
      apply_check_log: "",
      commands_run: [],
      evidence: "",
      logs: { stdout: "", stderr: "", tail: "" },
      workspace_path: "",
      duration_ms: 0,
      summary: "Dry run - task skipped",
      notes_for_manager: "Dry run mode enabled. No actual execution performed.",
    }));

    const output: RunCodexTasksOutput = {
      run_id: runId,
      results,
      total_duration_ms: Date.now() - startTime,
    };

    await logger.finalize(output);
    activeRuns.delete(runId);
    return output;
  }

  const taskResults: TaskResult[] = [];

  try {
    const limit = pLimit(concurrency);

    const settled = await Promise.allSettled(
      input.tasks.map(task => limit(async (): Promise<TaskResult> => {
        // Pre-flight security validation
        try {
          validateTaskInput(task, config, repoRoot);
        } catch (err) {
          return {
            task_id: task.task_id,
            status: "failed",
            exit_code: null,
            files_changed: [],
            patch: "",
            patch_applicable: false,
            apply_check_log: "",
            commands_run: [],
            evidence: "",
            logs: { stdout: "", stderr: "", tail: "" },
            workspace_path: "",
            duration_ms: 0,
            summary: "Pre-flight security validation failed",
            notes_for_manager: err instanceof Error ? err.message : String(err),
          };
        }

        // Create worktree (inside allSettled per-task path)
        let worktreePath: string;
        try {
          worktreePath = await createWorktree(runId, task.task_id, baseRef, repoRoot);
        } catch (err) {
          return {
            task_id: task.task_id,
            status: "failed",
            exit_code: null,
            files_changed: [],
            patch: "",
            patch_applicable: false,
            apply_check_log: "",
            commands_run: [],
            evidence: "",
            logs: { stdout: "", stderr: "", tail: "" },
            workspace_path: "",
            duration_ms: 0,
            summary: "Worktree creation failed",
            notes_for_manager: err instanceof Error ? err.message : String(err),
          };
        }

        try {
          // Run Codex task
          const result = await runCodexTask(task, worktreePath, config, repoRoot);

          // Validate patch against clean base_ref
          if (result.patch && result.status === "success") {
            try {
              const patchResult = await validatePatch(result.patch, repoRoot, baseRef);
              result.patch_applicable = patchResult.applicable;
              result.apply_check_log = patchResult.log;
            } catch (err) {
              result.patch_applicable = false;
              result.apply_check_log = err instanceof Error ? err.message : String(err);
            }
          }

          // Redact patch after validation
          result.patch = redact(result.patch);

          await logger.writeTaskResult(task.task_id, result);
          await logger.log("info", `Task ${task.task_id} completed: ${result.status}`, undefined, task.task_id);
          return result;
        } catch (err) {
          const failResult: TaskResult = {
            task_id: task.task_id,
            status: "failed",
            exit_code: null,
            files_changed: [],
            patch: "",
            patch_applicable: false,
            apply_check_log: "",
            commands_run: [],
            evidence: "",
            logs: { stdout: "", stderr: "", tail: "" },
            workspace_path: worktreePath,
            duration_ms: 0,
            summary: "Task execution failed with unexpected error",
            notes_for_manager: err instanceof Error ? err.message : String(err),
          };
          await logger.writeTaskResult(task.task_id, failResult);
          return failResult;
        }
      }))
    );

    // Collect results from settled promises
    for (const result of settled) {
      if (result.status === "fulfilled") {
        taskResults.push(result.value);
      } else {
        // This shouldn't happen since we catch all errors above, but just in case
        taskResults.push({
          task_id: "unknown",
          status: "failed",
          exit_code: null,
          files_changed: [],
          patch: "",
          patch_applicable: false,
          apply_check_log: "",
          commands_run: [],
          evidence: "",
          logs: { stdout: "", stderr: "", tail: "" },
          workspace_path: "",
          duration_ms: 0,
          summary: "Unexpected promise rejection",
          notes_for_manager: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }

    const output: RunCodexTasksOutput = {
      run_id: runId,
      results: taskResults,
      total_duration_ms: Date.now() - startTime,
    };

    await logger.finalize(output);
    await logger.enforceRetention(config.max_runs_retained);

    return output;
  } finally {
    // Guaranteed cleanup (B4)
    await cleanupRun(runId, repoRoot).catch(() => {});
    activeRuns.delete(runId);
  }
}
