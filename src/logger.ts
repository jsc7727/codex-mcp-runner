import { writeFile, appendFile, readdir, stat, rm, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { redact } from "./log-redactor.js";
import type { TaskResult, RunCodexTasksOutput } from "./types.js";

export interface RunLogger {
  log(level: string, message: string, data?: Record<string, unknown>, task_id?: string): Promise<void>;
  writeTaskResult(taskId: string, result: TaskResult): Promise<void>;
  finalize(output: RunCodexTasksOutput): Promise<void>;
  enforceRetention(maxRuns: number): Promise<void>;
}

export async function createRunLogger(runId: string, baseDir?: string): Promise<RunLogger> {
  const runsDir = baseDir || ".codex-runs";
  const runDir = join(runsDir, runId);
  await mkdir(runDir, { recursive: true });

  // Write creation timestamp for reliable retention sorting
  const createdAt = new Date().toISOString();
  await writeFile(join(runDir, "_created_at"), createdAt, "utf-8");

  const logPath = join(runDir, "run.log");

  return {
    async log(level: string, message: string, data?: Record<string, unknown>, task_id?: string) {
      const entry = {
        timestamp: new Date().toISOString(),
        level,
        task_id,
        message: redact(message),
        data,
      };
      await appendFile(logPath, JSON.stringify(entry) + "\n", "utf-8");
    },

    async writeTaskResult(taskId: string, result: TaskResult) {
      const resultPath = join(runDir, `${taskId}.json`);
      // Redact all string fields
      const redactedResult = {
        ...result,
        patch: redact(result.patch),
        evidence: redact(result.evidence),
        summary: redact(result.summary),
        notes_for_manager: redact(result.notes_for_manager),
        logs: {
          stdout: redact(result.logs.stdout),
          stderr: redact(result.logs.stderr),
          tail: redact(result.logs.tail),
        },
      };
      await writeFile(resultPath, JSON.stringify(redactedResult, null, 2), "utf-8");
    },

    async finalize(output: RunCodexTasksOutput) {
      const summaryPath = join(runDir, "summary.json");
      await writeFile(summaryPath, JSON.stringify(output, null, 2), "utf-8");
    },

    async enforceRetention(maxRuns: number) {
      try {
        const dirents = await readdir(runsDir, { withFileTypes: true });
        const entries = dirents.filter(d => d.isDirectory()).map(d => d.name);
        if (entries.length <= maxRuns) return;

        // Read _created_at timestamps for sorting
        const runDirs: { name: string; createdAt: string }[] = [];
        for (const entry of entries) {
          try {
            const tsPath = join(runsDir, entry, "_created_at");
            const ts = await readFile(tsPath, "utf-8");
            runDirs.push({ name: entry, createdAt: ts.trim() });
          } catch {
            // Fallback: use stat mtime
            try {
              const s = await stat(join(runsDir, entry));
              runDirs.push({ name: entry, createdAt: s.mtime.toISOString() });
            } catch {
              // Skip entries we can't stat
            }
          }
        }

        // Sort oldest first
        runDirs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

        // Remove oldest until within limit
        const toRemove = runDirs.length - maxRuns;
        for (let i = 0; i < toRemove; i++) {
          try {
            await rm(join(runsDir, runDirs[i].name), { recursive: true, force: true });
          } catch {
            // Ignore removal errors (race condition)
          }
        }
      } catch {
        // Ignore retention errors entirely
      }
    },
  };
}
