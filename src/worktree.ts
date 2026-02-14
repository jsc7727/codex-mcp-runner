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

  // Clean up any orphaned directories
  const worktreesDir = resolve(root, WORKTREES_DIR);
  try {
    const entries = await readdir(worktreesDir);
    for (const entry of entries) {
      // Try to remove -- if it's a valid worktree, git worktree remove will handle it
      const entryPath = join(worktreesDir, entry);
      await removeDir(entryPath);
    }
  } catch {
    // Directory may not exist (first run)
  }
}
