import { describe, it, expect } from "vitest";
import { buildCodexArgs } from "../../src/codex-runner.js";
import type { CodexConfig, TaskInput } from "../../src/types.js";

const defaultConfig: CodexConfig = {
  allowed_commands: ["npm test"],
  default_allowed_paths: ["src/**"],
  default_concurrency: 2,
  default_timeout_sec: 300,
  resource_policy: "conservative",
  network_policy: "deny",
  codex_command: "codex",
  codex_model: "o4-mini",
  codex_full_auto: true,
  codex_ephemeral: true,
  sandbox_mode: "workspace-write",
  max_runs_retained: 20,
  max_tasks_per_run: 10,
};

const defaultTask: TaskInput = {
  task_id: "test-task",
  prompt: "Fix the bug in main.ts",
};

describe("buildCodexArgs", () => {
  it("produces correct basic args", () => {
    const args = buildCodexArgs(defaultTask, "/tmp/worktree", defaultConfig);
    expect(args[0]).toBe("exec");
    expect(args).toContain("--full-auto");
    expect(args).toContain("--ephemeral");
    expect(args).toContain("--json");
    expect(args).toContain("-m");
    expect(args).toContain("o4-mini");
    expect(args).toContain("-C");
    expect(args).toContain("/tmp/worktree");
    expect(args).toContain("-o");
    // Check -- terminator is before prompt
    const dashDashIndex = args.indexOf("--");
    expect(dashDashIndex).toBeGreaterThan(-1);
    expect(args[dashDashIndex + 1]).toBe("Fix the bug in main.ts");
    // Prompt is last
    expect(args[args.length - 1]).toBe("Fix the bug in main.ts");
  });

  it("uses --dangerously-bypass-approvals-and-sandbox when full_auto is false", () => {
    const config = { ...defaultConfig, codex_full_auto: false };
    const args = buildCodexArgs(defaultTask, "/tmp/wt", config);
    expect(args).toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(args).not.toContain("--full-auto");
  });

  it("omits --ephemeral when disabled", () => {
    const config = { ...defaultConfig, codex_ephemeral: false };
    const args = buildCodexArgs(defaultTask, "/tmp/wt", config);
    expect(args).not.toContain("--ephemeral");
  });

  it("adds --sandbox when sandbox_mode differs from default", () => {
    const config = { ...defaultConfig, sandbox_mode: "read-only" as const };
    const args = buildCodexArgs(defaultTask, "/tmp/wt", config);
    expect(args).toContain("--sandbox");
    expect(args).toContain("read-only");
  });

  it("does not add --sandbox when workspace-write (default)", () => {
    const args = buildCodexArgs(defaultTask, "/tmp/wt", defaultConfig);
    expect(args).not.toContain("--sandbox");
  });

  it("always has -- before prompt", () => {
    const args = buildCodexArgs(defaultTask, "/tmp/wt", defaultConfig);
    const ddIdx = args.indexOf("--");
    const promptIdx = args.indexOf(defaultTask.prompt);
    expect(ddIdx).toBeLessThan(promptIdx);
    expect(promptIdx).toBe(args.length - 1);
  });

  it("handles prompts that look like flags", () => {
    const task = { ...defaultTask, prompt: "--help" };
    const args = buildCodexArgs(task, "/tmp/wt", defaultConfig);
    // -- should prevent --help from being interpreted as a flag
    const ddIdx = args.indexOf("--");
    expect(args[ddIdx + 1]).toBe("--help");
  });
});
