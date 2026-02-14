import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { exec } from "./utils/exec.js";
import { WorktreeError } from "./errors.js";
import { removeDir } from "./utils/fs.js";

const WORKTREES_DIR = ".codex-worktrees";

export async function createWorktree(
  runId: string,
  taskId: string,
  baseRef: string,
  repoRoot?: string
): Promise<string> {
  const root = repoRoot || process.cwd();
  const worktreePath = resolve(root, WORKTREES_DIR, runId, taskId);

  const result = await exec("git", [
    "worktree", "add", worktreePath, baseRef, "--detach",
  ], { cwd: root });

  if (result.exitCode !== 0) {
    throw new WorktreeError(
      `Failed to create worktree at ${worktreePath}: ${result.stderr}`
    );
  }

  return worktreePath;
}

export async function removeWorktree(worktreePath: string, repoRoot?: string): Promise<void> {
  const root = repoRoot || process.cwd();
  await exec("git", ["worktree", "remove", worktreePath, "--force"], { cwd: root });
}

export async function cleanupRun(runId: string, repoRoot?: string): Promise<void> {
  const root = repoRoot || process.cwd();
  const runWorktreeDir = resolve(root, WORKTREES_DIR, runId);

  try {
    const entries = await readdir(runWorktreeDir);
    for (const entry of entries) {
      const worktreePath = join(runWorktreeDir, entry);
      await exec("git", ["worktree", "remove", worktreePath, "--force"], { cwd: root }).catch(() => {});
    }
  } catch {
    // Directory may not exist
  }

  // Remove the run directory itself
  await removeDir(runWorktreeDir);

  // Prune git worktree records
  await exec("git", ["worktree", "prune"], { cwd: root });
}

export async function getRepoDiff(worktreePath: string): Promise<string> {
  const result = await exec("git", ["-C", worktreePath, "diff", "HEAD"]);
  return result.stdout;
}

export async function getChangedFiles(worktreePath: string): Promise<string[]> {
  const result = await exec("git", ["-C", worktreePath, "diff", "HEAD", "--name-only"]);
  return result.stdout.trim().split("\n").filter(Boolean);
}

export async function pruneStaleWorktrees(repoRoot?: string): Promise<void> {
  const root = repoRoot || process.cwd();

  // Prune git worktree records for removed directories
  await exec("git", ["worktree", "prune"], { cwd: root });

  // Get list of registered worktrees
  const listResult = await exec("git", ["worktree", "list", "--porcelain"], { cwd: root });
  const registeredPaths = new Set(
    listResult.stdout.split("\n")
      .filter(l => l.startsWith("worktree "))
      .map(l => l.slice("worktree ".length))
  );

  // Clean up orphaned directories (not registered as git worktrees)
  const worktreesDir = resolve(root, WORKTREES_DIR);
  try {
    const runDirs = await readdir(worktreesDir);
    for (const runDir of runDirs) {
      const runDirPath = join(worktreesDir, runDir);
      try {
        const taskDirs = await readdir(runDirPath);
        let allOrphaned = true;
        for (const taskDir of taskDirs) {
          const taskDirPath = join(runDirPath, taskDir);
          if (registeredPaths.has(taskDirPath)) {
            allOrphaned = false;
          } else {
            await removeDir(taskDirPath);
          }
        }
        // Remove the run directory if all its task dirs are orphaned
        if (allOrphaned) {
          await removeDir(runDirPath);
        }
      } catch {
        // Skip entries that aren't directories
      }
    }
  } catch {
    // Directory may not exist (first run)
  }
}
