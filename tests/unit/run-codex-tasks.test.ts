import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handleRunCodexTasks } from "../../src/tools/run-codex-tasks.js";

describe("handleRunCodexTasks", () => {
  let originalCwd: string;
  let tmpDir: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tmpDir = join(tmpdir(), `run-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe("dry_run mode", () => {
    it("returns skipped results without spawning Codex", async () => {
      // Use the real project dir (it's a git repo)
      const output = await handleRunCodexTasks({
        base_ref: "HEAD",
        dry_run: true,
        tasks: [
          { task_id: "task-a", prompt: "Do something" },
          { task_id: "task-b", prompt: "Do something else" },
        ],
      });

      expect(output.run_id).toBeTruthy();
      expect(output.results).toHaveLength(2);
      expect(output.total_duration_ms).toBeGreaterThanOrEqual(0);

      for (const result of output.results) {
        expect(result.status).toBe("skipped");
        expect(result.exit_code).toBeNull();
        expect(result.summary).toContain("Dry run");
        expect(result.notes_for_manager).toContain("dry-run" /* case insensitive check below */
          .toLowerCase() ? "Dry run" : "dry");
        expect(result.commands_run).toHaveLength(0);
        expect(result.patch).toBe("");
      }

      // Verify task_ids are preserved
      expect(output.results[0].task_id).toBe("task-a");
      expect(output.results[1].task_id).toBe("task-b");
    });

    it("generates run_id when not provided", async () => {
      const output = await handleRunCodexTasks({
        base_ref: "HEAD",
        dry_run: true,
        tasks: [{ task_id: "t1", prompt: "test" }],
      });

      expect(output.run_id).toBeTruthy();
      expect(output.run_id.length).toBeGreaterThan(0);
    });

    it("uses provided run_id", async () => {
      const output = await handleRunCodexTasks({
        run_id: "my-custom-run",
        base_ref: "HEAD",
        dry_run: true,
        tasks: [{ task_id: "t1", prompt: "test" }],
      });

      expect(output.run_id).toBe("my-custom-run");
    });
  });

  describe("input validation", () => {
    it("rejects when tasks exceed max_tasks_per_run", async () => {
      // Default max_tasks_per_run is 10, create 11 tasks
      const tasks = Array.from({ length: 11 }, (_, i) => ({
        task_id: `task-${i}`,
        prompt: "test",
      }));

      await expect(
        handleRunCodexTasks({
          base_ref: "HEAD",
          dry_run: true,
          tasks,
        })
      ).rejects.toThrow(/exceeds max_tasks_per_run/);
    });
  });
});
